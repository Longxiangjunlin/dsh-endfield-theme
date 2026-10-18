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

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, extname, join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const CLIENT_ROOT = join(PACKAGE_ROOT, 'client')
const ROUTE_PREFIX = '/dsh-endfield'

/** Our own version, reported to the account service as the calling client's version. */
const PACKAGE_VERSION = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')).version
const THEME_SCRIPT = `${ROUTE_PREFIX}/theme.js`

const CONTENT_TYPES = {
  '.avif': 'image/avif',
  '.css': 'text/css; charset=utf-8',
  '.flac': 'audio/flac',
  '.gif': 'image/gif',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.wav': 'audio/wav',
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
 * The two transports are NOT equivalent here, and the difference is visible.
 *
 * Browser: the host renders these rows into the HTML it returns, so the splash
 * markup is in the document before any script runs. It is genuinely the first
 * paint — checked by capturing the first frame of a served index with and
 * without the rows.
 *
 * Desktop: `index.html` is 825 bytes served straight out of the packaged dist by
 * the `dsh-app://` handler, which special-cases `/`, `/index.html` and
 * `/assets/*`, so it never passes through the web server and never sees the rows.
 * The page applies them off `dshDesktopBoot.ready()` — one `ipcRenderer.invoke`
 * round trip after it starts — and by then the app has painted its own boot card.
 * A few frames of that card are visible on the real window.
 *
 * A plugin cannot close that gap. `script-preload` is a no-op in the frontend's
 * row interpreter and does not appear in `preload-app.cjs`, so there is no
 * pre-paint channel; and the window's `backgroundColor` and `show:false` timing
 * are main-process options. What the row still buys on the desktop is that the
 * splash replaces the boot card at the earliest moment a plugin can reach, rather
 * than several hundred milliseconds later once theme.js and its stylesheet have
 * both loaded.
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

/**
 * Answer the balance readout.
 *
 * This is a PASSTHROUGH, on purpose. The plugin never talks to the Platform, never reads a
 * credential, and never decides what a wallet looks like: it asks the host's own
 * `deepseekAccount` service, which owns the signed-in grant, and hands whatever projection it
 * returns to the browser. If that projection ever gains or loses a field, the browser half
 * shows the fields it recognises instead of the plugin having guessed wrong about the shape.
 *
 * Cached briefly, because the browser half polls it and a settings panel left open should not
 * mean an account API call every few seconds. The cache is one entry: this is one signed-in
 * user on one machine, not a shared server.
 */
const BALANCE_CACHE_MS = 30000
let balanceCache = { at: 0, body: null }

function balanceClientMetadata(request) {
  const locale = typeof request.headers['accept-language'] === 'string'
    ? request.headers['accept-language'].split(',')[0].trim()
    : 'zh-CN'
  return {
    version: PACKAGE_VERSION,
    locale,
    timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
  }
}

function sendJson(response, status, body) {
  const text = JSON.stringify(body)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(Buffer.byteLength(text)),
    'cache-control': 'no-store',
  })
  response.end(text)
}

async function handleBalance(request, response, getAccount) {
  const account = getAccount()
  if (account === null || typeof account.getBalance !== 'function') {
    // Not an error: a profile with no account provider is a legitimate configuration, and the
    // browser half treats this as "no readout to draw".
    sendJson(response, 200, { ok: false, reason: 'unavailable' })
    return
  }
  const now = Date.now()
  if (balanceCache.body !== null && now - balanceCache.at < BALANCE_CACHE_MS) {
    sendJson(response, 200, balanceCache.body)
    return
  }
  try {
    const value = await account.getBalance(balanceClientMetadata(request))
    const body = value === null || value === undefined
      ? { ok: false, reason: 'signed-out' }
      : { ok: true, fetchedAt: now, balance: value }
    balanceCache = { at: now, body }
    sendJson(response, 200, body)
  } catch (error) {
    // The service's own failures are reported, not thrown at the page: a balance readout is
    // never worth breaking the client over. The message is included because the only consumer
    // is the user's own browser.
    sendJson(response, 200, {
      ok: false,
      reason: 'error',
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

/* ---------------------------------------------------------------- uninstall */

/** The name this plugin is installed under, in both the profile and the loader patch. */
const SELF_NAME = 'dsh-endfield-theme'

/**
 * Remove one `- id: <name>` list item from a cordis patch file.
 *
 * Text surgery rather than a YAML round-trip: this runs inside the host, the profile's YAML is
 * the user's own configuration, and re-serialising it through a parser would reformat every
 * unrelated entry and drop their comments. The rule is narrow and checked: the item starts at a
 * `- id: <name>` line and continues through every following line indented further than the dash,
 * stopping at the first line that is not.
 *
 * @returns the new text, and how many items were removed.
 */
function stripYamlItem(source, name) {
  const lines = source.split('\n')
  const kept = []
  let removed = 0
  const startsItem = new RegExp(`^\\s*-\\s*id:\\s*['"]?${name}['"]?\\s*$`)
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (!startsItem.test(line)) {
      kept.push(line)
      continue
    }
    const dashIndent = line.match(/^\s*/u)[0].length
    removed += 1
    i += 1
    while (i < lines.length) {
      const next = lines[i]
      if (next.trim() === '') break
      if (next.match(/^\s*/u)[0].length <= dashIndent) break
      i += 1
    }
    i -= 1
  }
  return { text: kept.join('\n'), removed }
}

/**
 * Take this plugin out of one profile directory.
 *
 * Deliberately not a package-manager uninstall: that would mean spawning pnpm against a profile
 * the running client has open. What actually stops the plugin loading is its two entries in the
 * profile's own configuration, and those are what this removes - and nothing else. The copy left
 * in `node_modules` is inert once nothing references it, and the next install prunes it.
 *
 * Both files are copied alongside themselves before being written. A profile is the user's own
 * configuration and this is the one code path in the plugin that writes to it; if anything here
 * is ever wrong, the backup is the difference between a repair and a reinstall.
 *
 * @returns a summary of what changed, for the caller to report honestly.
 */
export function stripSelfFromProfile(profileDir, name = SELF_NAME) {
  const result = { profile: profileDir, changed: [], missing: [], backup: [], error: null }
  const manifestPath = join(profileDir, 'package.json')
  const patchPath = join(profileDir, 'cordis.patch.yml')

  // package.json: the dependency and the bundle entry.
  if (existsSync(manifestPath)) {
    const original = readFileSync(manifestPath, 'utf8')
    let manifest = null
    try {
      manifest = JSON.parse(original)
    } catch (error) {
      result.error = `package.json 不是合法 JSON：${error.message}`
      return result
    }
    let touched = false
    if (manifest.dependencies && typeof manifest.dependencies === 'object' && name in manifest.dependencies) {
      delete manifest.dependencies[name]
      result.changed.push('dependencies')
      touched = true
    }
    const bundles = manifest.dsh && manifest.dsh.profile && manifest.dsh.profile.bundles
    if (Array.isArray(bundles) && bundles.includes(name)) {
      manifest.dsh.profile.bundles = bundles.filter((entry) => entry !== name)
      result.changed.push('bundles')
      touched = true
    }
    if (touched) {
      const backup = `${manifestPath}.ef-uninstall-backup`
      writeFileSync(backup, original)
      result.backup.push(backup)
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
    }
  } else {
    result.missing.push('package.json')
  }

  // cordis.patch.yml: the insert entry.
  if (existsSync(patchPath)) {
    const original = readFileSync(patchPath, 'utf8')
    const { text, removed } = stripYamlItem(original, name)
    if (removed > 0) {
      const backup = `${patchPath}.ef-uninstall-backup`
      writeFileSync(backup, original)
      result.backup.push(backup)
      writeFileSync(patchPath, text)
      result.changed.push(`patch.yml (${removed} 项)`)
    }
  } else {
    result.missing.push('cordis.patch.yml')
  }

  return result
}

/**
 * Every profile directory that currently references this plugin.
 *
 * Found by reading, not by guessing: `$DSH_HOME/profiles/*` is scanned for the name, so a profile
 * that never had the plugin is never touched. `DSH_HOME` is the host's own convention, with the
 * documented default for the case where the environment does not set it.
 */
function profilesUsing(name = SELF_NAME) {
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  const root = join(home, 'profiles')
  const found = []
  let entries = []
  try {
    entries = readdirSync(root, { withFileTypes: true })
  } catch {
    return found
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const dir = join(root, entry.name)
    const manifestPath = join(dir, 'package.json')
    if (existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
        const depends = Boolean(manifest.dependencies && name in manifest.dependencies)
        const bundled = Boolean(
          manifest.dsh && manifest.dsh.profile &&
          Array.isArray(manifest.dsh.profile.bundles) &&
          manifest.dsh.profile.bundles.includes(name),
        )
        if (depends || bundled) {
          found.push(dir)
          continue
        }
      } catch {
        /* an unreadable manifest is not a profile to edit */
      }
    }
    if (existsSync(join(dir, 'cordis.patch.yml'))) {
      try {
        if (readFileSync(join(dir, 'cordis.patch.yml'), 'utf8').includes(`id: ${name}`)) {
          found.push(dir)
        }
      } catch {
        /* as above */
      }
    }
  }
  return found
}

/**
 * The self-uninstall endpoint.
 *
 * POST-only and same-origin (checked by the caller): this is the one route that writes to the
 * user's own configuration, and a page on another origin must never be able to reach it.
 *
 * It removes THIS PLUGIN and nothing else, from every profile that names it, and reports what it
 * did. The running page cannot unload its own script, so it disappears from the UI immediately
 * and is gone for good on the next start - which the response says, and which the browser half
 * repeats to the user.
 */
function handleUninstall(response) {
  try {
    const profiles = profilesUsing()
    if (profiles.length === 0) {
      sendJson(response, 200, {
        ok: true,
        profiles: [],
        note: '没有找到引用本插件的 profile —— 可能已经卸载过了。',
      })
      return
    }
    const results = profiles.map((dir) => stripSelfFromProfile(dir))
    sendJson(response, 200, {
      ok: results.every((entry) => entry.error === null),
      profiles: results,
      note: '重启客户端后完全生效。',
    })
  } catch (error) {
    sendJson(response, 200, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/* ------------------------------------------------------------------- voice */

/**
 * Where character voice packs live.
 *
 * Deliberately OUTSIDE the package. The three clips this plugin ships are already Hypergryph's
 * audio (see NOTICE.md), and character voice lines are the same kind of asset - redistributing
 * them inside an MIT package is not something this project does, however convenient it would be.
 * So the mechanism ships and the audio does not: one folder per voice, files named
 * `<clip>.<lang>.<ext>`. The settings page lists whatever it finds, so a user who has the lines -
 * or records their own - gets a full picker, and a user who has none still hears the built-in
 * A.I.C voice.
 */
const VOICE_DIR = join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'endfield-voice')
const VOICE_CLIPS = ['boot', 'low', 'empty']
const VOICE_LANGS = ['zh', 'en', 'ja']
const VOICE_FILE = /^([a-z]+)\.(zh|en|ja)\.(mp3|wav|ogg|m4a|flac)$/
/** A single path segment that cannot be `.`/`..`, contain a separator, or contain a control char. */
const SAFE_SEGMENT = /^(?!\.{1,2}$)[^/\\\u0000-\u001f]+$/u

/** Make the folder exist so the layout is discoverable instead of something to be told about. */
export function ensureVoiceDir() {
  try {
    mkdirSync(VOICE_DIR, { recursive: true })
  } catch {
    /* read-only home, or a sandbox: the picker simply stays empty */
  }
  return VOICE_DIR
}

/**
 * Every folder under VOICE_DIR that contains at least one recognised file.
 *
 * The shape returned is what the browser half needs to build two selects: the pack name, and which
 * clip/language pairs that pack actually provides. A pack with only `boot` still appears; the
 * picker reports the gap instead of pretending the file is there.
 */
export function listVoicePacks() {
  const packs = []
  let entries = []
  try {
    entries = readdirSync(VOICE_DIR, { withFileTypes: true })
  } catch {
    return packs
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || !SAFE_SEGMENT.test(entry.name)) continue
    const clips = {}
    let count = 0
    let files = []
    try {
      files = readdirSync(join(VOICE_DIR, entry.name))
    } catch {
      continue
    }
    for (const file of files) {
      const match = VOICE_FILE.exec(file)
      if (match === null || !VOICE_CLIPS.includes(match[1])) continue
      clips[match[1]] = clips[match[1]] || {}
      clips[match[1]][match[2]] = file
      count += 1
    }
    if (count > 0) packs.push({ name: entry.name, clips, count })
  }
  return packs.sort((a, b) => a.name.localeCompare(b.name))
}

function voiceNotFound(response) {
  response.writeHead(404)
  response.end()
}

/**
 * Serve one file out of a pack.
 *
 * Every segment is validated before it is used, and the resolved path is checked to be inside
 * VOICE_DIR afterwards: `join()` normalises, so a name that slipped validation could otherwise
 * walk out of the folder even with the separators rejected.
 */
function serveVoiceFile(response, relative) {
  const segments = relative.split('/').filter((part) => part !== '')
  if (segments.length !== 2) {
    voiceNotFound(response)
    return
  }
  let pack = ''
  let file = ''
  try {
    pack = decodeURIComponent(segments[0])
    file = decodeURIComponent(segments[1])
  } catch {
    voiceNotFound(response)
    return
  }
  if (!SAFE_SEGMENT.test(pack) || !VOICE_FILE.test(file)) {
    voiceNotFound(response)
    return
  }
  // The shape regex accepts any `name.lang.ext`; the clip name has to be one this plugin actually
  // asks for, or the route would serve files the picker can never reference.
  const clip = VOICE_FILE.exec(file)[1]
  if (!VOICE_CLIPS.includes(clip)) {
    voiceNotFound(response)
    return
  }
  const absolute = join(VOICE_DIR, pack, file)
  if (absolute !== VOICE_DIR && !absolute.startsWith(VOICE_DIR + sep)) {
    voiceNotFound(response)
    return
  }
  let body
  try {
    body = readFileSync(absolute)
  } catch {
    voiceNotFound(response)
    return
  }
  const type = CONTENT_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream'
  response.writeHead(200, {
    'content-type': type,
    'content-length': body.length,
    // A pack is something people add while the client is running, so a cached 404 must not stick.
    'cache-control': 'no-cache',
  })
  response.end(body)
}

function handleVoiceList(response) {
  sendJson(response, 200, {
    ok: true,
    dir: VOICE_DIR,
    clips: VOICE_CLIPS,
    langs: VOICE_LANGS,
    packs: listVoicePacks(),
  })
}

export default {
  name: 'dsh-endfield-theme',

  apply(root) {
    // Create the voice-pack folder on load. Its existence is the whole documentation for where
    // packs go; an empty folder with the right name is a better hint than a paragraph.
    ensureVoiceDir()

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

    // The account service is injected SEPARATELY, and deliberately so.
    //
    // It is an OPTIONAL dependency: a profile with no Platform account provider (signed
    // out, or a deployment that does not use one) may never offer `deepseekAccount` at
    // all. Cordis holds an `inject` callback until its dependencies exist, so listing it
    // alongside `webServer` would mean the route below - and with it the entire theme -
    // never registers on those profiles. Held apart, a missing account provider costs the
    // balance readout and nothing else.
    //
    // The handle is a plain variable rather than a live service lookup so the route can
    // stay synchronous and cannot throw on a profile without the service.
    let accountService = null
    try {
      root.inject(['deepseekAccount'], (accountCtx) => {
        accountService = accountCtx.deepseekAccount
        return () => {
          accountService = null
        }
      })
    } catch {
      /* a host that cannot resolve the name simply has no balance to report */
    }

    root.inject(['webServer'], (ctx) => {
      const disposers = []

      disposers.push(ctx.webServer.register({
        kind: 'prefix',
        path: ROUTE_PREFIX,
        handler: (request, response) => {
          const pathname = new URL(request.url ?? '/', 'http://dsh.invalid').pathname
          // The only non-GET endpoint, so it is matched before the method guard.
          if (pathname === `${ROUTE_PREFIX}/uninstall`) {
            if (request.method !== 'POST') {
              response.writeHead(405, { allow: 'POST' })
              response.end()
              return
            }
            if (!sameOriginOnly(request)) {
              response.writeHead(403)
              response.end()
              return
            }
            handleUninstall(response)
            return
          }
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
          if (pathname === `${ROUTE_PREFIX}/balance`) {
            handleBalance(request, response, () => accountService)
            return
          }
          if (pathname === `${ROUTE_PREFIX}/voice-packs`) {
            handleVoiceList(response)
            return
          }
          if (pathname.startsWith(`${ROUTE_PREFIX}/voice/`)) {
            serveVoiceFile(response, pathname.slice(ROUTE_PREFIX.length + '/voice/'.length))
            return
          }
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
