/**
 * dsh-endfield-theme — host half.
 *
 * Two jobs, both of them plumbing:
 *
 *  1. serve the browser half (`client/theme.css`, `client/theme.js`, and the
 *     backdrop art under `client/assets/`) from one prefix route;
 *  2. get that script into the page on both transports the Web GUI uses —
 *     `webServer.tapIndex` for the browser-served shell, and a
 *     `webserver/index-inject` row for the desktop (Electron) shell, whose
 *     index.html never passes through `renderIndex`.
 *
 * The injected row is an INLINE script that appends its own `<script src>`
 * with `onerror` swallowed. A `script-src` row would be the shorter spelling,
 * but the desktop page interpreter rejects the whole boot when such a row
 * fails to load, and an injection table is collected before this plugin is
 * live — so a dead route would take the application down with it instead of
 * costing us the theme. Inline rows cannot fail to load.
 *
 * Nothing here writes to the DOM, and nothing here knows a class name: every
 * visual decision lives in `client/`.
 */

import { readFileSync, statSync } from 'node:fs'
import { dirname, extname, join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const CLIENT_ROOT = join(PACKAGE_ROOT, 'client')
const ROUTE_PREFIX = '/dsh-endfield'
const THEME_SCRIPT = `${ROUTE_PREFIX}/theme.js`

const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
}

/**
 * Paint the canvas before any stylesheet arrives, so the first frame of the
 * application is already charcoal instead of the shell's white. The browser
 * half corrects this to the daylight colour when the shell is in light mode —
 * deliberately NOT with a `:has()` here: a `:has()` anchored on <html> is
 * re-evaluated on every mutation anywhere in the body, which is a real cost
 * while a long transcript mounts.
 */
const CRITICAL_CSS = 'html,body{background-color:#050606}'

/** Inline row that pulls in the browser half without risking the boot. */
const LOADER_ROW = '(function(){try{'
  + 'var d=document.body||document.head||document.documentElement;if(!d)return;'
  + `if(document.querySelector('script[data-dsh-endfield]'))return;`
  + 'var s=document.createElement("script");s.src="' + THEME_SCRIPT + '";'
  + 's.async=false;s.setAttribute("data-dsh-endfield","1");s.onerror=function(){};'
  + 'd.appendChild(s)'
  + '}catch(e){}})()'

/**
 * Why the splash is delivered as an injection row instead of being built by
 * theme.js.
 *
 * The desktop page applies its whole injection table *before* it constructs
 * the shell (`dsh-web-frontend/dist/assets/index-*.js`: `new ShellController(root)`
 * … `await applyRows(injections)` … render), and the browser transport renders
 * the same rows into the served HTML. So a splash that arrives as a `html` row
 * is in the document before anything the user could call "the app" exists —
 * which is what removes the flash of the stock white boot screen. Building it
 * from theme.js instead costs two round trips (the script, then its stylesheet)
 * and lands several hundred milliseconds into the session, which is exactly the
 * window the flash lived in.
 *
 * The row is emitted as style-then-markup in ONE row so the two can never be
 * applied separately — an unmatched splash element would render as loose text.
 */
function splashRow() {
  const css = readClientFile('splash.css').body.toString('utf8')
  const markup = readClientFile('splash.html').body.toString('utf8')
  return `<style data-dsh-endfield-splash>${css}</style>${markup}`
}

/**
 * Marks the splash window on <html> and forces the desktop preload to
 * re-measure the caption colours.
 *
 * The preload resolves `--dsw-specific-sidebar-fill` / `--dsw-alias-label-primary`
 * from a hidden probe and pushes them to the main process
 * (`setTitleBarOverlay`), but only re-measures when `html[lang]` or
 * `body[data-ds-dark-theme]` mutates. Re-assigning `lang` its own value is a
 * mutation record that changes nothing visually — that is the poke. The 6s
 * timer is the no-theme.js fallback: splash.css hides the layer on its own, and
 * this puts the caption colours back even if the browser half never loads.
 */
const SPLASH_MARK_ROW = '(function(){try{'
  + 'var h=document.documentElement;'
  + 'try{if(matchMedia("(prefers-reduced-motion: reduce)").matches)return}catch(e){}'
  + 'h.setAttribute("data-ef-splash","on");'
  + 'var p=function(){try{h.lang=h.lang}catch(e){}};'
  + 'p();'
  + 'setTimeout(function(){h.removeAttribute("data-ef-splash");p()},6000)'
  + '}catch(e){}})()'

/** mtime-keyed file cache: editing a client file shows up on the next reload. */
const fileCache = new Map()

function readClientFile(relative) {
  const absolute = join(CLIENT_ROOT, relative)
  const stats = statSync(absolute)
  const cached = fileCache.get(absolute)
  if (cached !== undefined && cached.mtimeMs === stats.mtimeMs) return cached
  const entry = { mtimeMs: stats.mtimeMs, body: readFileSync(absolute) }
  fileCache.set(absolute, entry)
  return entry
}

/**
 * Resolve a request path inside `client/`, refusing anything that escapes it.
 * @returns the path relative to `client/`, or null when the request is unsafe.
 */
function resolveRelative(requestPath) {
  let decoded
  try {
    decoded = decodeURIComponent(requestPath)
  } catch {
    return null
  }
  if (decoded.includes('\0')) return null
  const relative = normalize(decoded).replace(/^[/\\]+/u, '')
  if (relative === '' || relative === '.') return null
  if (relative.split(/[/\\]/u).some((segment) => segment === '..')) return null
  const absolute = join(CLIENT_ROOT, relative)
  if (absolute !== CLIENT_ROOT && !absolute.startsWith(CLIENT_ROOT + sep)) return null
  return relative
}

const sameOriginOnly = (request) => {
  const site = request.headers['sec-fetch-site']
  if (typeof site === 'string' && site !== 'same-origin' && site !== 'none') return false
  const origin = request.headers.origin
  if (typeof origin !== 'string' || origin === '') return true
  try {
    const url = new URL(origin)
    return url.host === request.headers.host
  } catch {
    return false
  }
}

export default {
  name: 'dsh-endfield-theme',

  apply(root) {
    // The injection row is registered synchronously: the desktop shell collects
    // its table once, early, and a row added after that collection never lands.
    root.on('webserver/index-inject', (table) => {
      if (!Array.isArray(table)) return
      for (const row of table) {
        if (row === null || typeof row !== 'object') continue
        if (row.kind === 'script' && typeof row.text === 'string' && row.text.includes(THEME_SCRIPT)) return
        if (row.kind === 'script-src' && row.src === THEME_SCRIPT) return
      }
      table.push({ kind: 'style', text: CRITICAL_CSS })
      table.push({ kind: 'html', placement: 'body', html: splashRow() })
      table.push({ kind: 'script', placement: 'body', text: SPLASH_MARK_ROW })
      table.push({ kind: 'script', placement: 'body', text: LOADER_ROW })
    })

    root.inject(['webServer'], (ctx) => {
      const disposers = []

      disposers.push(ctx.webServer.register({
        kind: 'prefix',
        path: ROUTE_PREFIX,
        handler: (request, response) => {
          if (request.method !== 'GET' && request.method !== 'HEAD') {
            response.writeHead(405, { allow: 'GET, HEAD' })
            response.end()
            return
          }
          if (!sameOriginOnly(request)) {
            response.writeHead(403)
            response.end()
            return
          }
          const pathname = new URL(request.url ?? '/', 'http://dsh.invalid').pathname
          if (pathname === `${ROUTE_PREFIX}/` || pathname === ROUTE_PREFIX) {
            response.writeHead(302, { location: `${ROUTE_PREFIX}/theme.css` })
            response.end()
            return
          }
          const relative = resolveRelative(pathname.slice(ROUTE_PREFIX.length))
          if (relative === null) {
            response.writeHead(404)
            response.end()
            return
          }
          let entry
          try {
            entry = readClientFile(relative)
          } catch {
            response.writeHead(404, { 'cache-control': 'no-store' })
            response.end()
            return
          }
          response.writeHead(200, {
            'content-type': CONTENT_TYPES[extname(relative).toLowerCase()] ?? 'application/octet-stream',
            'content-length': String(entry.body.byteLength),
            'cache-control': 'no-cache',
          })
          response.end(request.method === 'HEAD' ? undefined : entry.body)
        },
      }))

      // Browser-served shell: the index HTML is rendered per request, so a tap
      // registered now applies to the very next page load.
      disposers.push(ctx.webServer.tapIndex((html) => {
        if (html.includes(THEME_SCRIPT)) return html
        const tags = `<style>${CRITICAL_CSS}</style><script>${LOADER_ROW}</script>`
        if (html.includes('</body>')) return html.replace('</body>', `${tags}</body>`)
        return html + tags
      }))

      ctx.effect(() => () => {
        for (const dispose of disposers) {
          try {
            dispose()
          } catch {
            /* a route that already went away is not a failure worth reporting */
          }
        }
      })
    })
  },
}
