// Exercise the plugin's host half without a running harness: mount it on a
// fake cordis root, then drive the route handler and the injection row.
//
// usage: node test/host.test.mjs   (or: npm test)
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

const { default: plugin } = await import('../lib/index.js')

const rows = []
const routes = []
const taps = []
let injectCallback = null
let effectCleanups = []

const root = {
  on(event, callback) {
    if (event === 'webserver/index-inject') rows.push(callback)
  },
  inject(services, callback) {
    assert.deepEqual(services, ['webServer'])
    injectCallback = callback
  },
  effect(callback) {
    effectCleanups.push(callback())
  },
}

assert.equal(plugin.name, 'dsh-endfield-theme')
plugin.apply(root)

// --- injection table -------------------------------------------------------
const table = []
for (const subscriber of rows) subscriber(table)
assert.equal(table.length, 4, 'canvas style + splash html + splash marker + theme loader')

assert.equal(table[0].kind, 'style')
assert.match(table[0].text, /html,body\{background-color:#050606\}/)

// The splash row is one unit: the sheet and the markup can never be applied
// apart, or an unmatched #ef-splash would paint as loose text.
assert.equal(table[1].kind, 'html')
assert.equal(table[1].placement, 'body')
assert.match(table[1].html, /<style data-dsh-endfield-splash>/)
assert.match(table[1].html, /id="ef-splash"/)
assert.match(table[1].html, /ef-splash__mark/)
assert.match(table[1].html, /animation-delay:1\.14s/)
assert.match(table[1].html, /终末地工业/)
assert.match(table[1].html, /url\(\/dsh-endfield\/assets\/endfield-mark-zh\.png\)/)
assert.match(table[1].html, /ef-splash__band/, 'title-bar band element')
// The caption strip is handed a TRANSPARENT fill, never a charcoal one: the
// overlay paints above the page, so a flat colour can only ever be a rectangle
// lying on the artwork, and setTitleBarOverlay takes one colour — a gradient
// cannot be passed to it. Transparent hands the 40px back to the page.
assert.match(table[1].html, /--dsw-specific-sidebar-fill: rgba\(5, 6, 6, 0\)/)
assert.match(table[1].html, /--dsw-alias-label-primary: #f2f013/)
assert.match(table[1].html, /html\[data-windows-titlebar\] \.ef-splash__tape--top/, 'tape returns to y=0 on desktop')
assert.ok(table[1].html.indexOf('<style') < table[1].html.indexOf('id="ef-splash"'), 'sheet before markup')

// The marker row is what turns the Windows caption strip black and yellow.
assert.equal(table[2].kind, 'script')
assert.equal(table[2].placement, 'body')
assert.match(table[2].text, /data-ef-splash/)
assert.match(table[2].text, /h\.lang=h\.lang/)
assert.match(table[2].text, /prefers-reduced-motion/)

assert.equal(table[3].kind, 'script')
assert.equal(table[3].placement, 'body')
assert.match(table[3].text, /\/dsh-endfield\/theme\.js/)
assert.match(table[3].text, /onerror/)

// idempotent: a second collection must not append a duplicate row
const secondTable = [...table]
for (const subscriber of rows) subscriber(secondTable)
assert.equal(secondTable.length, 4, 'row de-duplication')

// --- routes ---------------------------------------------------------------
const ctx = {
  webServer: {
    register(route) {
      routes.push(route)
      return () => routes.splice(routes.indexOf(route), 1)
    },
    tapIndex(transform) {
      taps.push(transform)
      return () => taps.splice(taps.indexOf(transform), 1)
    },
  },
  effect(callback) {
    effectCleanups.push(callback())
  },
}

const call = (path, { method = 'GET', headers = {} } = {}) => {
  const route = routes.find((candidate) => path.startsWith(candidate.path))
  assert.ok(route !== undefined, `no route for ${path}`)
  let status = null
  let body = Buffer.alloc(0)
  let responseHeaders = null
  const response = {
    writeHead(code, hdrs) {
      status = code
      responseHeaders = hdrs ?? null
    },
    end(payload) {
      if (Buffer.isBuffer(payload)) body = payload
    },
  }
  route.handler({
    method,
    url: path,
    headers: { host: '127.0.0.1:19387', 'sec-fetch-site': 'same-origin', ...headers },
  }, response)
  return { status, body, headers: responseHeaders }
}

injectCallback(ctx)

assert.equal(routes.length, 1)
assert.equal(routes[0].kind, 'prefix')
assert.equal(routes[0].path, '/dsh-endfield')
assert.equal(taps.length, 1)

const css = call('/dsh-endfield/theme.css')
assert.equal(css.status, 200)
assert.equal(css.headers['content-type'], 'text/css; charset=utf-8')
const themeText = css.body.toString('utf8')
assert.match(themeText, /--ef-y:/)
// The caption strip is made transparent by overriding the preload's probe
// element, so the overlay stops double-layering the sidebar token — that step
// at y=40 is what read as "the title bar is a different surface".
assert.match(themeText, /body > span\[style\*='visibility:hidden'\]\[style\*='--dsw-specific-sidebar-fill'\]/)
// The shell's own 40px band is re-cut to continue whatever sits below it.
assert.match(themeText, /\[data-windows-titlebar\] \[data-slot='root'\] > div::before/)
assert.match(themeText, /var\(--ef-col-left, 280px\)/)
assert.match(themeText, /var\(--ef-col-right, 100%\)/)
// The brand swap is client-only; the sheet carries the hiding rules and the
// script carries the replacement mark.
assert.match(themeText, /\[data-slot='sidebar\.brand\.mark'\]/)
assert.match(themeText, /\.ef-brand__badge/)
assert.equal(css.body.byteLength, Number(css.headers['content-length']))

const js = call('/dsh-endfield/theme.js')
assert.equal(js.status, 200)
assert.equal(js.headers['content-type'], 'text/javascript; charset=utf-8')
const jsText = js.body.toString('utf8')
assert.match(jsText, /__dshEndfieldTheme/)
assert.match(jsText, /decorateBrand/)
assert.match(jsText, /终末地工业/)
assert.match(jsText, /dsh-endfield-brand/)

const art = call('/dsh-endfield/assets/endfield-field.jpg')
assert.equal(art.status, 200)
assert.equal(art.headers['content-type'], 'image/jpeg')
assert.ok(art.body.byteLength > 100_000)
assert.equal(art.body.subarray(0, 2).toString('hex'), 'ffd8', 'JPEG magic')

const icon = call('/dsh-endfield/assets/endfield-icon.svg')
assert.equal(icon.status, 200)
assert.equal(icon.headers['content-type'], 'image/svg+xml; charset=utf-8')

// The splash sheet and markup are served too: theme.js falls back to fetching
// them when a page got the script without the injection row.
const splashCss = call('/dsh-endfield/splash.css')
assert.equal(splashCss.status, 200)
assert.equal(splashCss.headers['content-type'], 'text/css; charset=utf-8')
assert.match(splashCss.body.toString('utf8'), /--efs-ink/)
assert.match(splashCss.body.toString('utf8'), /data-ef-splash/)

const splashHtml = call('/dsh-endfield/splash.html')
assert.equal(splashHtml.status, 200)
assert.match(splashHtml.body.toString('utf8'), /id="ef-splash"/)

assert.equal(call('/dsh-endfield/').status, 302, 'directory redirect')
assert.equal(call('/dsh-endfield/theme.css', { method: 'POST' }).status, 405)
assert.equal(call('/dsh-endfield/nope.css').status, 404, 'missing file')
assert.equal(call('/dsh-endfield/../../package.json').status, 404, 'traversal')
assert.equal(call('/dsh-endfield/%2e%2e/%2e%2e/package.json').status, 404, 'encoded traversal')
assert.equal(call('/dsh-endfield/theme.css', { headers: { 'sec-fetch-site': 'cross-site' } }).status, 403, 'cross-site')
assert.equal(call('/dsh-endfield/theme.css', { headers: { origin: 'http://evil.test' } }).status, 403, 'foreign origin')

const head = call('/dsh-endfield/theme.css', { method: 'HEAD' })
assert.equal(head.status, 200)
assert.equal(head.body.byteLength, 0)
assert.equal(Number(head.headers['content-length']), css.body.byteLength)

// --- index tap ------------------------------------------------------------
const tapped = taps[0]('<html><body><div id="root"></div></body></html>')
assert.match(tapped, /\/dsh-endfield\/theme\.js/)
assert.ok(tapped.indexOf('<style>') < tapped.indexOf('</body>'))
assert.equal(taps[0](tapped), tapped, 'tap is idempotent')

// --- teardown -------------------------------------------------------------
for (const cleanup of effectCleanups) cleanup()
assert.equal(routes.length, 0, 'routes disposed')
assert.equal(taps.length, 0, 'taps disposed')

// A content hash makes accidental truncation of a shipped asset visible.
const hash = (path) => createHash('sha256').update(path).digest('hex').slice(0, 12)
console.log('host half OK — routes, injection row, tap, guards, teardown')
console.log('theme.css sha256[:12]  ', hash(css.body), `(${css.body.byteLength} B)`)
console.log('theme.js  sha256[:12]  ', hash(js.body), `(${js.body.byteLength} B)`)
console.log('backdrop  sha256[:12]  ', hash(art.body), `(${art.body.byteLength} B)`)
