/**
 * dsh-endfield-theme — browser half.
 *
 * Plain script, no module system, no framework: it appends the theme
 * stylesheet, builds the fixed decoration layer the stylesheet paints into,
 * and runs the boot splash once per document.
 *
 * Everything it creates lives OUTSIDE `#root`, so React never owns, diffs or
 * unmounts it. The decoration layer sits at z-index -1 and the shell's own
 * grounds are made transparent by the stylesheet, which is what turns the
 * artwork into the page's ground rather than a picture behind a white room.
 */
(function () {
  'use strict'

  var ROOT = '/dsh-endfield'
  var CSS_HREF = ROOT + '/theme.css'
  /** When the splash timeline is over and the exit animation starts. */
  var SPLASH_MS = 2780
  /** How long after that the node is dropped (the CRT collapse duration). */
  var SPLASH_FADE_MS = 700
  var CSS_WAIT_MS = 400
  /**
   * The BOOT bar's read-out window, in milliseconds into the splash timeline. These
   * mirror `ef-fill` in splash.css (`animation: ef-fill 1.15s ... 1.45s`); the fill
   * itself stays CSS, and the number is computed from the same clock animation so the
   * two cannot drift apart. Change them together.
   */
  var SPLASH_FILL_AT_MS = 1450
  var SPLASH_FILL_MS = 1150
  /** Boot sting. Missing or refused is fine - the animation does not depend on it. */
  var SPLASH_AUDIO = ROOT + '/assets/endfield-boot.mp3'

  if (window.__dshEndfieldTheme) return
  window.__dshEndfieldTheme = { version: '1.7.0' }

  var doc = document
  var html = doc.documentElement

  html.setAttribute('data-dsh-endfield', '1')

  /* ---------------------------------------------------------------- styles */

  function ensureStylesheet() {
    var existing = doc.querySelector('link[data-dsh-endfield-css]')
    if (existing !== null) return Promise.resolve()
    return new Promise(function (resolve) {
      var link = doc.createElement('link')
      link.rel = 'stylesheet'
      link.href = CSS_HREF
      link.setAttribute('data-dsh-endfield-css', '1')
      var settled = false
      var done = function () {
        if (settled) return
        settled = true
        resolve()
      }
      link.addEventListener('load', done, { once: true })
      link.addEventListener('error', done, { once: true })
      ;(doc.head || html).appendChild(link)
      // A stylesheet that never settles must not hold the splash hostage.
      setTimeout(done, CSS_WAIT_MS)
    })
  }

  /* -------------------------------------------------------------- backdrop */

  function buildBackdrop() {
    var layer = doc.createElement('div')
    layer.id = 'ef-backdrop'
    layer.setAttribute('aria-hidden', 'true')
    layer.innerHTML = [
      '<div class="ef-art"></div>',
      '<div class="ef-scrim"></div>',
      '<div class="ef-grid"></div>',
      '<div class="ef-tape ef-tape--top"></div>',
      '<div class="ef-tape ef-tape--bottom"></div>',
      '<div class="ef-frame">',
      '<span class="ef-bracket ef-bracket--tl"></span>',
      '<span class="ef-bracket ef-bracket--tr"></span>',
      '<span class="ef-bracket ef-bracket--bl"></span>',
      '<span class="ef-bracket ef-bracket--br"></span>',
      '<span class="ef-ruler"></span>',
      '</div>',
    ].join('')
    return layer
  }

  /**
   * The screen texture. One element, one repeating gradient, never animated — and the only
   * layer that paints ABOVE the app rather than behind it: a scanline pattern the panels cover
   * up is wallpaper, not a screen. Kept faint enough that body text stays crisp.
   */
  var crtElement = null

  function crtEnabled() {
    try {
      var query = new URLSearchParams(window.location.search)
      if (query.get('dsh-endfield-crt') === '0') return false
    } catch (err) {
      /* an unparsable query string is not a reason to skip it */
    }
    return true
  }

  function ensureCrt() {
    if (uninstalled) return
    if (!crtEnabled()) return
    var body = doc.body
    if (body === null) return
    if (crtElement !== null && crtElement.parentNode === body) return
    var existing = doc.getElementById('ef-crt')
    if (existing !== null) {
      crtElement = existing
      if (existing.parentNode !== body) body.appendChild(existing)
      return
    }
    crtElement = doc.createElement('div')
    crtElement.id = 'ef-crt'
    crtElement.setAttribute('aria-hidden', 'true')
    body.appendChild(crtElement)
  }

  /**
   * Set once the user has uninstalled the plugin from its own settings page.
   *
   * Everything in this script is idempotent and self-healing by design - a rAF pump, a
   * MutationObserver, a debounced conversation tick - which is exactly what makes it come back
   * after it has been torn down. The tear-down is only cosmetic anyway (the script cannot
   * unload itself), so the honest thing is to stop rebuilding and let the restart finish the
   * job. Every rebuilder checks this first.
   */
  var uninstalled = false

  function ensureBackdrop() {
    if (uninstalled) return
    var body = doc.body
    if (body === null) return
    var existing = doc.getElementById('ef-backdrop')
    if (existing !== null) {
      if (existing.parentNode !== body) body.appendChild(existing)
    } else {
      // Appended LAST, not first: the layer is `position: fixed; z-index: -1`, so
      // document order does not decide what it paints behind, but being the first
      // child of <body> would hand it to anything keyed on `body > :first-child`.
      body.appendChild(buildBackdrop())
    }
    ensureCrt()
    applySettings()
    ensureBalance()
  }

  /**
   * Anchor the HUD frame on the conversation column.
   *
   * Window-anchored corners put a bracket straight through the sidebar's brand
   * row, where it reads as a second, mis-drawn collapse button sitting on the
   * logo. Measuring the column instead keeps the frame around the terminal and
   * out of the chrome, and it follows every resize and sidebar collapse.
   */
  var frameElement = null
  var frameTarget = null
  var frameObserver = null
  var railState = null

  /**
   * Flag the collapsed-to-a-rail layout so the stylesheet can make the way back
   * out obvious. At 55px the sidebar reads as "gone", and the report that
   * followed was "you have to restart the client to get it back" — the toggle
   * is there, it just does not look like one.
   */
  function syncRailState(columnLeft) {
    var next = columnLeft > 0 && columnLeft < 160 ? 'on' : null
    if (next === railState) return
    railState = next
    if (next === null) html.removeAttribute('data-ef-rail')
    else html.setAttribute('data-ef-rail', next)
  }

  function syncFrame() {
    if (frameElement === null || frameElement.parentNode === null) {
      var layer = doc.getElementById('ef-backdrop')
      frameElement = layer === null ? null : layer.querySelector('.ef-frame')
      if (frameElement === null) return
    }
    var column = doc.querySelector('[class*="centerCol"], [data-slot="main"]')
    if (column === null) {
      frameElement.classList.remove('is-placed')
      return
    }
    if (column !== frameTarget) {
      frameTarget = column
      if (typeof ResizeObserver === 'function') {
        if (frameObserver !== null) frameObserver.disconnect()
        frameObserver = new ResizeObserver(syncFrame)
        frameObserver.observe(column)
      }
    }
    var rect = column.getBoundingClientRect()
    syncRailState(rect.left)
    // The desktop title-bar band is one element spanning the whole window, so
    // it needs to know where the columns actually are to match them (see 4b in
    // theme.css).
    html.style.setProperty('--ef-col-left', Math.round(rect.left) + 'px')
    html.style.setProperty('--ef-col-right', Math.round(rect.right) + 'px')
    reserveSidebarSpace()
    if (rect.width < 240) {
      frameElement.classList.remove('is-placed')
      return
    }
    frameElement.style.left = Math.round(rect.left) + 'px'
    frameElement.style.top = Math.round(rect.top) + 'px'
    frameElement.style.width = Math.round(rect.width) + 'px'
    frameElement.style.height = Math.round(rect.height) + 'px'
    frameElement.classList.add('is-placed')
  }

  /* --------------------------------------------------------------- settings */

  /**
   * User settings, kept in localStorage.
   *
   * Stored as one JSON blob under one key, and read once at load. Every accessor below goes
   * through `setting()`, so a URL parameter and a stored value can never disagree about which
   * one wins: the URL wins, always, because it is the one you can put in a bug report.
   *
   * Nothing here reads a remote config or writes anywhere but localStorage.
   */
  var SETTINGS_KEY = 'dsh-endfield-theme.settings'

  var DEFAULTS = {
    splash: true,
    bootAudio: true,
    brand: true,
    crt: true,
    crtStrength: 22,
    turnRail: true,
    conversation: true,
    /* Which picture sits behind the transcript. 'field' keeps the per-mode default; 'day' forces
       the snow field in both modes; 'contour' is the generated topographic pattern, which is the
       option for anyone who cannot have character art on screen at work; 'none' is flat. A
       'custom:<name>' value points at a file the user put in the host's backdrop folder. */
    backdrop: 'field',
    balance: true,
    warnAt: 5,
    /* A second trigger, alongside the amount above: warn when the reserve is worth fewer than this
       many days at the recent burn rate. 0 leaves only the amount threshold in charge. */
    warnDays: 0,
    warnVoice: true,
    warnVolume: 90,
    /* Which rendition of the warning to sound. The in-game clips are 8-9 seconds long, which is
       a lot of talking for "your balance dipped"; `brief` keeps the beginning and fades out,
       `beep` is a synthesised two-note chime half a second long, and `custom` uses warnLength. */
    warnClip: 'voice',
    warnLength: 2.5,
    /* Where the power panel sits: '' docks it bottom-left, "x,y" is a dragged position in
       viewport pixels. Dragging writes this; double-clicking the panel resets it. */
    powerPos: '',
    pollSeconds: 60,
    gaugeSpan: 4,
  }

  var stored = null
  try {
    var raw = window.localStorage.getItem(SETTINGS_KEY)
    stored = raw === null ? null : JSON.parse(raw)
  } catch (err) {
    /* private mode, a quota, or a corrupted value: defaults are always usable */
  }

  function setting(name) {
    var fromUrl = null
    try {
      var query = new URLSearchParams(window.location.search)
      var flag = query.get('dsh-endfield-' + name)
      if (flag !== null) fromUrl = flag
    } catch (err) {
      /* an unparsable query string leaves the stored value in charge */
    }
    var fallback = DEFAULTS[name]
    var value = stored !== null && typeof stored === 'object' && name in stored ? stored[name] : fallback
    if (fromUrl !== null) {
      if (typeof fallback === 'boolean') value = fromUrl !== '0'
      else if (typeof fallback === 'number') {
        var parsed = Number(fromUrl)
        if (isFinite(parsed)) value = parsed
      }
    }
    return value
  }

  function saveSettings(next) {
    stored = next
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
    } catch (err) {
      /* the session still honours the change; it just will not outlive the page */
    }
  }

  /** Publish the settings the stylesheet needs as attributes and custom properties. */
  function applySettings() {
    var flags = {
      'data-ef-crt': setting('crt'),
      'data-ef-rail': setting('turnRail'),
      'data-ef-balance': setting('balance'),
    }
    for (var attr in flags) {
      if (flags[attr]) html.removeAttribute(attr)
      else html.setAttribute(attr, 'off')
    }
    var strength = Number(setting('crtStrength'))
    if (!isFinite(strength)) strength = DEFAULTS.crtStrength
    strength = Math.min(60, Math.max(0, strength))
    html.style.setProperty('--ef-crt-alpha', String(strength / 100))
    applyBackdrop()
    applyPowerPosition()
    // Every control's change handler ends up here, so this is the one place that has to keep the
    // dependency greying in step with the values. A no-op until the panel exists.
    syncSettingGates()
  }

  /* --------------------------------------------------------------- backdrop */

  /**
   * Swap the picture behind the transcript.
   *
   * `--ef-art` is what the stylesheet paints, and it is set per colour scheme on <body> - so the
   * override has to go on <body> as an inline property, which wins over those rules. 'field'
   * removes the override and lets the per-mode default back in, so the default stays a default
   * rather than becoming one hard-coded file.
   */
  function applyBackdrop() {
    var body = doc.body
    if (body === null) return
    var choice = String(setting('backdrop') || 'field')
    if (choice === 'field') {
      body.style.removeProperty('--ef-art')
      return
    }
    if (choice === 'day') {
      body.style.setProperty('--ef-art', 'url(' + ROOT + '/assets/endfield-field-day.jpg)')
      return
    }
    if (choice === 'contour') {
      body.style.setProperty('--ef-art', 'url(' + ROOT + '/assets/endfield-contour.svg)')
      return
    }
    if (choice === 'none') {
      body.style.setProperty('--ef-art', 'none')
      return
    }
    if (choice.indexOf('custom:') === 0) {
      body.style.setProperty(
        '--ef-art',
        'url(' + ROOT + '/backdrop/' + encodeURIComponent(choice.slice('custom:'.length)) + ')',
      )
    }
  }

  var backdropFiles = []

  /** Ask the host which pictures the user has put in the backdrop folder. */
  function loadBackdrops() {
    try {
      window
        .fetch(ROOT + '/backdrops', { credentials: 'same-origin' })
        .then(function (response) { return response.ok ? response.json() : null })
        .then(function (payload) {
          if (payload !== null && Array.isArray(payload.files)) backdropFiles = payload.files
          refreshBackdropOptions()
        })
        .catch(function () {
          /* no host route yet: the built-in choices still work */
        })
    } catch (err) {
      /* as above */
    }
  }

  function refreshBackdropOptions() {
    var panel = doc.getElementById(SETTINGS_PANEL_ID)
    if (panel === null) return
    var select = panel.querySelector('select[data-ef-setting="backdrop"]')
    if (select === null) return
    var current = String(setting('backdrop') || 'field')
    while (select.firstChild !== null) select.removeChild(select.firstChild)
    var choices = [
      ['field', '炭黑 · 终末地原画'],
      ['day', '雪原 · 亮底'],
      ['contour', '等高线（无角色，适合办公）'],
      ['none', '纯色 · 无底图'],
    ]
    for (var i = 0; i < choices.length; i++) {
      var option = doc.createElement('option')
      option.value = choices[i][0]
      option.textContent = choices[i][1]
      select.appendChild(option)
    }
    for (var j = 0; j < backdropFiles.length; j++) {
      var custom = doc.createElement('option')
      custom.value = 'custom:' + backdropFiles[j].name
      custom.textContent = '自备：' + backdropFiles[j].name
      select.appendChild(custom)
    }
    select.value = current
  }

  /* ------------------------------------------------------- panel placement */

  var sideScroller = null

  /**
   * The sidebar's scrollable list.
   *
   * Found by behaviour, not by class: the shell's class names are build hashes, and
   * [data-slot="sidebar"] is `display: contents` so it has no box to measure. The element that
   * actually scrolls is the tallest one inside the sidebar whose overflow-y says so.
   */
  function sidebarScroller() {
    var sidebar = doc.querySelector('[data-slot="sidebar"]')
    if (sidebar === null) return null
    var found = null
    var foundHeight = -1
    var nodes = sidebar.querySelectorAll('*')
    for (var i = 0; i < nodes.length; i++) {
      var style = window.getComputedStyle(nodes[i])
      if (style.overflowY !== 'auto' && style.overflowY !== 'scroll') continue
      var rect = nodes[i].getBoundingClientRect()
      if (rect.width < 40 || rect.height < 40) continue
      if (rect.height > foundHeight) {
        found = nodes[i]
        foundHeight = rect.height
      }
    }
    return found
  }

  /**
   * Keep the docked panel from covering the list.
   *
   * While it is docked, its height plus a gap becomes margin on that scroller, so the list's box
   * ends above the panel and a longer list overflows into a scrollbar instead of sliding
   * underneath. While the panel floats somewhere else the space is handed back, because nothing is
   * covering the list any more.
   */
  function reserveSidebarSpace() {
    if (sideScroller === null || sideScroller.parentNode === null) sideScroller = sidebarScroller()
    if (sideScroller === null) return
    if (html.getAttribute('data-ef-power-pos') === 'custom') {
      sideScroller.style.marginBottom = ''
      return
    }
    var panel = balanceElement
    if (panel === null || panel.parentNode === null) {
      sideScroller.style.marginBottom = ''
      return
    }
    var height = panel.offsetHeight
    // Margin, not padding: padding on this element left its bottom edge where it was (the list's
    // scrollHeight tracked clientHeight exactly), while margin shrinks the flex item's box and so
    // moves that edge above the panel.
    sideScroller.style.marginBottom = Math.round(height + 18) + 'px'
  }

  function clearPowerPosition() {
    html.removeAttribute('data-ef-power-pos')
    html.style.removeProperty('--ef-power-left')
    html.style.removeProperty('--ef-power-top')
  }

  /** Apply the stored position: '' docks it, "x,y" pins it where the user left it. */
  function applyPowerPosition() {
    var raw = String(setting('powerPos') || '')
    var parts = raw.split(',')
    var left = parts.length === 2 ? parseFloat(parts[0]) : NaN
    var top = parts.length === 2 ? parseFloat(parts[1]) : NaN
    if (!isFinite(left) || !isFinite(top)) {
      clearPowerPosition()
      reserveSidebarSpace()
      return
    }
    // Clamp on apply: a position saved in a bigger window must not put the panel off screen.
    var width = balanceElement === null ? 260 : balanceElement.offsetWidth
    var height = balanceElement === null ? 115 : balanceElement.offsetHeight
    left = Math.max(0, Math.min(Math.max(0, window.innerWidth - width), left))
    top = Math.max(0, Math.min(Math.max(0, window.innerHeight - height), top))
    html.setAttribute('data-ef-power-pos', 'custom')
    html.style.setProperty('--ef-power-left', Math.round(left) + 'px')
    html.style.setProperty('--ef-power-top', Math.round(top) + 'px')
    reserveSidebarSpace()
  }

  /**
   * Drag the panel.
   *
   * Pointer events with capture, so a fast drag does not lose the panel when the pointer leaves it.
   * The move writes the CSS variables directly (the panel must follow the pointer frame by frame)
   * and only the drop persists to settings.
   */
  function makePowerDraggable(panel) {
    var offsetX = 0
    var offsetY = 0
    var dragging = false

    panel.addEventListener('pointerdown', function (event) {
      if (event.button !== 0) return
      var rect = panel.getBoundingClientRect()
      offsetX = event.clientX - rect.left
      offsetY = event.clientY - rect.top
      dragging = true
      panel.setAttribute('data-ef-dragging', '1')
      try {
        panel.setPointerCapture(event.pointerId)
      } catch (err) {
        /* capture is a convenience, not a requirement */
      }
      event.preventDefault()
    })

    panel.addEventListener('pointermove', function (event) {
      if (!dragging) return
      var left = event.clientX - offsetX
      var top = event.clientY - offsetY
      left = Math.max(0, Math.min(Math.max(0, window.innerWidth - panel.offsetWidth), left))
      top = Math.max(0, Math.min(Math.max(0, window.innerHeight - panel.offsetHeight), top))
      html.setAttribute('data-ef-power-pos', 'custom')
      html.style.setProperty('--ef-power-left', Math.round(left) + 'px')
      html.style.setProperty('--ef-power-top', Math.round(top) + 'px')
      event.preventDefault()
    })

    var drop = function (event) {
      if (!dragging) return
      dragging = false
      panel.removeAttribute('data-ef-dragging')
      try {
        panel.releasePointerCapture(event.pointerId)
      } catch (err) {
        /* already released */
      }
      var next = Object.assign({}, stored || {}, {})
      next.powerPos =
        html.style.getPropertyValue('--ef-power-left') + ',' + html.style.getPropertyValue('--ef-power-top')
      saveSettings(next)
      reserveSidebarSpace()
    }
    panel.addEventListener('pointerup', drop)
    panel.addEventListener('pointercancel', drop)

    panel.addEventListener('dblclick', function () {
      var next = Object.assign({}, stored || {}, {})
      next.powerPos = ''
      saveSettings(next)
      applyPowerPosition()
      syncSettingsControls()
    })
  }

  /* ------------------------------------------------------- panel placement end */

  /* ---------------------------------------------------------------- balance */

  /**
   * The balance readout in the sidebar, drawn as a power reserve.
   *
   * The theme already talks about the account in the game's own terms - the boot log runs
   * "FACTORY OS", the splash measures a field link - and the two warning clips the user
   * supplied are power-station announcements. A balance is the one number in this UI that maps
   * onto that cleanly: it is a reserve that runs down, warns, and eventually cuts out. So it is
   * drawn as a cell gauge with a reserve figure, not as a currency widget.
   *
   * The value comes from `/dsh-endfield/balance`, which is the host half asking the host's own
   * account service. Nothing here knows about wallets or credentials; it reads the fields it
   * recognises out of whatever that service returns, and stays quiet when it recognises none.
   */
  var balanceElement = null
  var balanceTimer = null
  var balanceValue = null
  var balanceReason = 'pending'
  /** Which warning has already been sounded for the current excursion. */
  var warnedLevel = null

  /**
   * A spendable amount out of one list of wallets.
   *
   * CNY wins when present: this is a Chinese-language client, and a multi-currency list would
   * otherwise report whichever currency happened to come first.
   */
  function walletListAmount(list) {
    if (!Array.isArray(list) || list.length === 0) return null
    var preferred = null
    for (var j = 0; j < list.length; j++) {
      var wallet = list[j]
      if (wallet === null || typeof wallet !== 'object') continue
      var amount = null
      var currency = null
      for (var key in wallet) {
        if (amount === null && /^(balance|amount|total)$/i.test(key)) amount = Number(wallet[key])
        if (currency === null && /^currency$/i.test(key)) currency = String(wallet[key])
      }
      if (amount === null || !isFinite(amount)) continue
      if (currency !== null && /^cny$/i.test(currency)) return amount
      if (preferred === null) preferred = amount
    }
    return preferred
  }

  /**
   * Pull a spendable amount out of the account service's projection.
   *
   * The real payload, read off a live host rather than assumed, is:
   *
   *   { status: "ready",
   *     value:        [ { currency: "CNY", balance: "17.2213610400000000" } ],
   *     bonusWallets: [ { currency: "CNY", balance: "0" } ] }
   *
   * so the spendable list is `value` — a BARE array, not an object keyed by wallet name, which
   * is what the first revision of this function looked for. That is why the readout sat at NO
   * SIGNAL with a perfectly good balance one key away. The other spellings are kept because
   * they cost nothing and a projection that grows a name should not kill the readout.
   *
   * `bonusWallets` is never consulted: the service documents granted bonus as separate from
   * recharge balance, so counting it would overstate what is actually left to spend.
   */
  /**
   * Today's change in the balance, derived from the polls.
   *
   * The account service reports a balance and nothing else, so the only way to say "spent
   * today" is to remember where the day started and subtract. Two things reset the baseline: a
   * new calendar day, and a balance that went UP - a top-up is not negative spending, and
   * carrying yesterday's baseline through one would report a nonsense figure.
   *
   * Kept in localStorage so a reload does not restart the measurement at the wrong number.
   */
  var SPEND_KEY = 'dsh-endfield-theme.spend'
  var spendBaseline = null

  function dayKey() {
    var now = new Date()
    return now.getFullYear() + '-' + (now.getMonth() + 1) + '-' + now.getDate()
  }

  function noteSpend(amount) {
    // After a wipe the baseline is deliberately NOT re-derived; see `dataWiped`.
    if (dataWiped) return
    if (!isFinite(amount)) return
    var day = dayKey()
    var stored = null
    try {
      stored = JSON.parse(window.localStorage.getItem(SPEND_KEY) || 'null')
    } catch (err) {
      stored = null
    }
    var usable = stored !== null && typeof stored === 'object' &&
      stored.day === day && isFinite(stored.start)
    if (!usable || amount > stored.start) {
      stored = { day: day, start: amount }
      try {
        window.localStorage.setItem(SPEND_KEY, JSON.stringify(stored))
      } catch (err) {
        /* the session still tracks it, it just will not survive a reload */
      }
    }
    spendBaseline = stored
  }

  /* ------------------------------------------------------- burn rate / days left */

  /**
   * A second warning trigger: "the reserve is worth fewer than N days".
   *
   * The fixed threshold stays exactly as it was - it is predictable and people set it deliberately.
   * This is added alongside it, because five yuan means very different things at different burn
   * rates, and the polls the gauge already runs are enough to measure that rate for free.
   *
   * Samples are kept as a small ring in localStorage: one per poll, trimmed to seven days, so the
   * estimate reflects the last week rather than a single unlucky gap. The rate is computed from the
   * two endpoints of that window, not from every pair, because balance also moves when the account
   * is topped up and a per-pair average would be dragged by it.
   */
  var POLL_KEY = 'dsh-endfield-theme.polls'
  var POLL_KEEP_MS = 7 * 24 * 60 * 60 * 1000
  var POLL_LIMIT = 1200
  var pollSamples = []

  try {
    var rawPolls = window.localStorage.getItem(POLL_KEY)
    if (rawPolls !== null) {
      var parsedPolls = JSON.parse(rawPolls)
      if (Array.isArray(parsedPolls)) {
        for (var pi = 0; pi < parsedPolls.length; pi++) {
          var sample = parsedPolls[pi]
          if (sample !== null && typeof sample === 'object' && isFinite(sample.t) && isFinite(sample.v)) {
            pollSamples.push({ t: sample.t, v: sample.v })
          }
        }
      }
    }
  } catch (err) {
    /* a corrupted ring is not worth keeping */
  }

  function notePoll(amount) {
    if (!isFinite(amount)) return
    var now = Date.now()
    var last = pollSamples.length === 0 ? null : pollSamples[pollSamples.length - 1]
    // One sample per poll: a refresh-heavy session would otherwise fill the ring with duplicates.
    if (last !== null && now - last.t < 30000 && Math.abs(last.v - amount) < 0.0001) return
    pollSamples.push({ t: now, v: amount })
    while (pollSamples.length > POLL_LIMIT) pollSamples.shift()
    while (pollSamples.length > 0 && now - pollSamples[0].t > POLL_KEEP_MS) pollSamples.shift()
    try {
      window.localStorage.setItem(POLL_KEY, JSON.stringify(pollSamples))
    } catch (err) {
      /* the estimate still works for this session */
    }
  }

  /**
   * Days of reserve left at the recent burn rate, or null when it cannot be estimated.
   *
   * A top-up inside the window would make the endpoints show negative burn; that is reported as
   * "cannot estimate" rather than as an infinite reserve, because "plenty left" is the one wrong
   * answer a warning must never give.
   */
  function daysLeft(amount) {
    if (!isFinite(amount) || pollSamples.length < 2) return null
    var first = pollSamples[0]
    var last = pollSamples[pollSamples.length - 1]
    var hours = (last.t - first.t) / 3600000
    if (!(hours > 0.25)) return null
    var spent = first.v - last.v
    if (!(spent > 0.0001)) return null
    var perDay = spent / (hours / 24)
    if (!(perDay > 0)) return null
    var days = amount / perDay
    return isFinite(days) ? days : null
  }

  var balanceDaysLeft = null

  function drawSpend() {
    var el = balanceElement === null ? null : balanceElement.querySelector('.ef-power__spend')
    if (el === null) return
    if (spendBaseline === null || !isFinite(spendBaseline.start) || balanceValue === null) {
      el.textContent = ''
      el.hidden = true
      return
    }
    el.hidden = false
    var delta = balanceValue - spendBaseline.start
    var parts = []
    if (Math.abs(delta) < 0.005) {
      parts.push('今日 无变化')
      el.setAttribute('data-sign', 'flat')
    } else {
      var spent = -delta
      parts.push('今日 ' + (spent > 0 ? '−' : '+') + '¥' + Math.abs(spent).toFixed(2))
      el.setAttribute('data-sign', spent > 0 ? 'down' : 'up')
    }
    if (balanceDaysLeft !== null && balanceDaysLeft < 365) {
      parts.push('约 ' + Math.max(0, Math.floor(balanceDaysLeft)) + ' 天')
    }
    el.textContent = parts.join(' · ')
  }

  function walletAmount(value) {
    if (value === null || typeof value !== 'object') return null
    if (Array.isArray(value)) return walletListAmount(value)
    for (var key in value) {
      if (/^(normal[_-]?)?wallets?$/i.test(key) || /^value$/i.test(key)) {
        var found = walletListAmount(value[key])
        if (found !== null) return found
      }
    }
    return null
  }

  function amountFromPayload(payload) {
    if (payload === null || typeof payload !== 'object' || payload.ok !== true) return null
    var value = payload.balance
    var direct = walletAmount(value)
    if (direct !== null) return direct
    // Some projections nest the wallets one level down, under a summary or data key.
    if (value !== null && typeof value === 'object') {
      for (var key in value) {
        var nested = walletAmount(value[key])
        if (nested !== null) return nested
      }
    }
    return null
  }

  /**
   * Sound a warning once per excursion.
   *
   * Edge-triggered on purpose: the poll runs every minute, and a level-triggered warning would
   * say "power output insufficient" every minute for as long as the balance stayed low. The
   * level resets when the balance recovers, so the next dip is announced again.
   *
   * Two triggers, both optional, neither replacing the other: the amount threshold people set
   * themselves, and - when 余额可用天数 is above zero - a reserve worth fewer days than that at the
   * recent burn rate. Either one raises the same 'low' level, so the two share the edge.
   */
  function checkWarning(amount) {
    var threshold = Number(setting('warnAt'))
    if (!isFinite(threshold) || threshold < 0) threshold = DEFAULTS.warnAt
    var warnDaysValue = Number(setting('warnDays'))
    if (!isFinite(warnDaysValue) || warnDaysValue < 0) warnDaysValue = 0
    var level = null
    if (amount <= 0) level = 'empty'
    else if (amount < threshold) level = 'low'
    else if (warnDaysValue > 0 && balanceDaysLeft !== null && balanceDaysLeft < warnDaysValue) level = 'low'
    if (level === null) {
      warnedLevel = null
      return
    }
    if (warnedLevel === level || !setting('warnVoice')) return
    warnedLevel = level
    playWarning(level)
  }

  function drawBalance() {
    if (balanceElement === null) return
    var amount = balanceValue
    var threshold = Number(setting('warnAt'))
    if (!isFinite(threshold) || threshold < 0) threshold = DEFAULTS.warnAt

    var fill = balanceElement.querySelector('.ef-power__fill')
    var figure = balanceElement.querySelector('.ef-power__figure')
    var caption = balanceElement.querySelector('.ef-power__caption')

    if (amount === null) {
      balanceElement.setAttribute('data-state', 'unknown')
      if (figure !== null) figure.textContent = balanceReason === 'signed-out' ? '未登录' : '——'
      if (caption !== null) caption.textContent = balanceReason === 'signed-out' ? 'NO ACCOUNT' : 'NO SIGNAL'
      if (fill !== null) fill.style.transform = 'scaleX(0)'
      return
    }

    // Full scale is a multiple of the warning threshold (four by default), so the warning point
    // sits at a fixed fraction of the gauge - visibly "low" long before it is reached, which is
    // the whole point of a gauge. The multiplier is a setting because what counts as "plenty of
    // reserve" is different for someone topping up ¥10 and someone topping up ¥500.
    var span = Number(setting('gaugeSpan'))
    if (!isFinite(span) || span < 1) span = DEFAULTS.gaugeSpan
    var full = threshold > 0 ? threshold * span : Math.max(1, amount)
    var ratio = Math.max(0, Math.min(1, amount / full))
    var state = amount <= 0 ? 'empty' : amount < threshold ? 'low' : 'nominal'
    balanceElement.setAttribute('data-state', state)
    if (fill !== null) fill.style.transform = 'scaleX(' + ratio.toFixed(4) + ')'
    if (figure !== null) figure.textContent = '¥' + amount.toFixed(2)
    if (caption !== null) {
      caption.textContent = state === 'empty' ? 'DEPLETED' : state === 'low' ? 'OUTPUT LOW' : 'NOMINAL'
    }
    noteSpend(amount)
    notePoll(amount)
    balanceDaysLeft = daysLeft(amount)
    drawSpend()
    checkWarning(amount)
  }

  /**
   * A forced balance, for testing the warnings without waiting for a real one.
   *
   * `?dsh-endfield-fakeBalance=0` makes the readout believe the account is empty, so the
   * "reserve depleted" clip can be auditioned on an account that is nowhere near empty. It is
   * read on every poll rather than once, so changing the URL and reloading is all it takes.
   *
   * Returns null when the override is absent or unparsable, which is the normal case: a
   * malformed value must never be mistaken for a real zero.
   */
  function fakeBalance() {
    try {
      var query = new URLSearchParams(window.location.search)
      var raw = query.get('dsh-endfield-fakeBalance')
      if (raw === null) return null
      var value = Number(raw)
      return isFinite(value) ? value : null
    } catch (err) {
      return null
    }
  }

  function refreshBalance() {
    if (!setting('balance')) return
    var forced = fakeBalance()
    if (forced !== null) {
      balanceValue = forced
      balanceReason = 'ok'
      drawBalance()
      return
    }
    var request
    try {
      request = window.fetch(ROOT + '/balance', { credentials: 'same-origin' })
    } catch (err) {
      return
    }
    request
      .then(function (response) {
        return response.ok ? response.json() : null
      })
      .then(function (payload) {
        balanceValue = amountFromPayload(payload)
        balanceReason = balanceValue === null && payload !== null && typeof payload.reason === 'string'
          ? payload.reason
          : balanceValue === null ? 'unknown' : 'ok'
        drawBalance()
      })
      .catch(function () {
        balanceReason = 'error'
        drawBalance()
      })
  }

  function ensureBalance() {
    if (uninstalled) return
    var body = doc.body
    if (body === null) return
    if (!setting('balance')) {
      if (balanceElement !== null && balanceElement.parentNode !== null) {
        balanceElement.parentNode.removeChild(balanceElement)
      }
      return
    }
    if (balanceElement !== null && balanceElement.parentNode !== null) return
    var sidebar = doc.querySelector('[data-slot="sidebar"]')
    if (sidebar === null) return
    balanceElement = doc.createElement('div')
    balanceElement.id = 'ef-power'
    balanceElement.innerHTML =
      '<div class="ef-power__head"><span>电力储备</span><i>POWER RESERVE</i></div>' +
      '<div class="ef-power__meter"><u class="ef-power__fill"></u>' +
      '<b class="ef-power__ticks"></b></div>' +
      '<div class="ef-power__foot"><b class="ef-power__figure">——</b>' +
      '<i class="ef-power__caption">NO SIGNAL</i></div>' +
      '<div class="ef-power__spend" hidden></div>'
    sidebar.appendChild(balanceElement)
    drawBalance()
    refreshBalance()
    startBalanceTimer()
    makePowerDraggable(balanceElement)
    applyPowerPosition()

  }

  /**
   * (Re)start the poll. The interval is a setting, so the handler that changes it calls this
   * again rather than leaving the old timer in place - two timers would double the request rate
   * and neither would be the one the user asked for.
   */
  function startBalanceTimer() {
    if (balanceTimer !== null) {
      window.clearInterval(balanceTimer)
      balanceTimer = null
    }
    var seconds = Number(setting('pollSeconds'))
    if (!isFinite(seconds) || seconds < 15) seconds = DEFAULTS.pollSeconds
    balanceTimer = window.setInterval(refreshBalance, Math.round(seconds) * 1000)
  }

  /* ---------------------------------------------------------------- balance end */

  /* ------------------------------------------------------------ settings panel */

  /**
   * The theme's own page inside DSH's settings dialog.
   *
   * The plugin is host-only (its cordis patch has no dsh.client facet), so it cannot register a
   * settings page the way a client plugin does. It can, however, put one where the user asked
   * for it - inside the settings - by extending the dialog's own DOM.
   *
   * Two anchors, both taken from the live dialog rather than guessed:
   *
   *   nav button                       the tab strip; the new tab goes after the last one
   *   [data-slot="settings.section"]   the content area; the parent of that slot is where the
   *                                    built-in sections live, so the panel is a sibling
   *
   * `data-slot` is a stable attribute the shell sets on purpose, which is why it is used
   * instead of any of the hashed CSS-module class names around it. The tab strip has no such
   * attribute, so it is found structurally.
   *
   * Switching is ours to handle: the shell knows nothing about a tab it did not render, so
   * clicking ours hides its content and clicking any of its tabs hides ours.
   */
  var SETTINGS_TAB_ID = 'ef-settings-tab'
  var SETTINGS_PANEL_ID = 'ef-settings-panel'

  function findSettingsParts() {
    var dialog = doc.querySelector('[role="dialog"]')
    if (dialog === null) return null
    var nav = dialog.querySelector('nav')
    var anchor = dialog.querySelector('[data-slot="settings.section"]')
    if (nav === null || anchor === null) return null
    var buttons = nav.querySelectorAll('button')
    if (buttons.length === 0) return null
    if (anchor.parentNode === null) return null
    // `anchor.parentNode` is the element that actually scrolls (measured: overflow-y auto, and
    // it is the only scrollable node between the panel and the dialog). The panel goes INSIDE
    // it and the section is hidden on its own, so the page scrolls with the dialog instead of
    // hanging below the fold with nothing to scroll it.
    return {
      nav: nav,
      lastTab: buttons[buttons.length - 1],
      options: anchor.parentNode,
      section: anchor,
    }
  }

  /**
   * One settings row.
   *
   * A `<label>` only when the control is a checkbox. Wrapping a range or a number in a label
   * makes the label forward clicks to the control, which turns a drag into a jump and leaves
   * the part of the row beside the control doing nothing - so the sliders felt broken. A
   * checkbox is the one control where click-anywhere-to-toggle is what you want.
   *
   * The row carries its setting name and its depth in the dependency tree; the stylesheet
   * indents by depth and `syncSettingGates` uses the name.
   */
  function settingsRow(name, label, hint, control) {
    var clickToToggle = control.tagName === 'INPUT' && control.type === 'checkbox'
    var row = doc.createElement(clickToToggle ? 'label' : 'div')
    row.className = 'ef-set__row'
    row.setAttribute('data-ef-setting', name)
    row.setAttribute('data-depth', String(settingDepth(name)))
    var text = doc.createElement('span')
    text.className = 'ef-set__text'
    var name = doc.createElement('b')
    name.textContent = label
    text.appendChild(name)
    if (hint) {
      var note = doc.createElement('i')
      note.textContent = hint
      text.appendChild(note)
    }
    row.appendChild(text)
    row.appendChild(control)
    return row
  }

  function toggleControl(name) {
    var input = doc.createElement('input')
    input.type = 'checkbox'
    input.className = 'ef-set__switch'
    input.checked = setting(name) !== false
    input.addEventListener('change', function () {
      var next = Object.assign({}, stored || {}, {})
      next[name] = input.checked
      saveSettings(next)
      applySettings()
      syncSettingsControls()
      refreshBalance()
    })
    return input
  }

  /**
   * A range control. `after` runs once the value is stored, for settings whose effect is not
   * purely declarative - the volume control auditions the new level, the gauge span redraws.
   */
  function rangeControl(name, min, max, suffix, after) {
    var wrap = doc.createElement('span')
    wrap.className = 'ef-set__range'
    var input = doc.createElement('input')
    input.type = 'range'
    input.min = String(min)
    input.max = String(max)
    input.step = '1'
    input.value = String(setting(name))
    var readout = doc.createElement('u')
    readout.textContent = input.value + suffix
    input.addEventListener('input', function () {
      readout.textContent = input.value + suffix
    })
    input.addEventListener('change', function () {
      var next = Object.assign({}, stored || {}, {})
      next[name] = Number(input.value)
      saveSettings(next)
      applySettings()
      if (typeof after === 'function') after()
    })
    wrap.appendChild(input)
    wrap.appendChild(readout)
    return wrap
  }

  /** A number control. `after` exists for the same reason as in `rangeControl`. */
  function numberControl(name, min, max, suffix, after) {
    var wrap = doc.createElement('span')
    wrap.className = 'ef-set__number'
    var input = doc.createElement('input')
    input.type = 'number'
    input.min = String(min)
    input.max = String(max)
    input.step = '1'
    input.value = String(setting(name))
    var unit = doc.createElement('u')
    unit.textContent = suffix
    input.addEventListener('change', function () {
      var parsed = Number(input.value)
      if (!isFinite(parsed)) parsed = DEFAULTS[name]
      parsed = Math.min(max, Math.max(min, parsed))
      input.value = String(parsed)
      var next = Object.assign({}, stored || {}, {})
      next[name] = parsed
      saveSettings(next)
      drawBalance()
      if (typeof after === 'function') after()
    })
    wrap.appendChild(input)
    wrap.appendChild(unit)
    return wrap
  }

  /**
   * A select control.
   *
   * Native `<select>` rather than a custom menu: the shell renders its own portalled menus inside
   * the composer card (see the clip-path note in the stylesheet), and a native popup cannot be
   * clipped, stacked behind something, or captured by a screenshot of the page - which is exactly
   * what a settings page with four short options needs.
   */
  function selectControl(name, options, after) {
    var wrap = doc.createElement('span')
    wrap.className = 'ef-set__select'
    var select = doc.createElement('select')
    for (var i = 0; i < options.length; i++) {
      var option = doc.createElement('option')
      option.value = options[i][0]
      option.textContent = options[i][1]
      select.appendChild(option)
    }
    select.value = String(setting(name))
    select.addEventListener('change', function () {
      var next = Object.assign({}, stored || {}, {})
      next[name] = select.value
      saveSettings(next)
      applySettings()
      syncSettingGates()
      if (typeof after === 'function') after()
    })
    wrap.appendChild(select)
    return wrap
  }

  function showOwnTab(parts, own) {
    // Hide the SECTION, not the container it lives in: the container is the scroller, and the
    // theme's page is inside it. Hiding the container took the page off screen with it.
    parts.section.style.display = own ? 'none' : ''
    var panel = doc.getElementById(SETTINGS_PANEL_ID)
    if (panel !== null) panel.hidden = !own
    var tabs = parts.nav.querySelectorAll('button')
    for (var i = 0; i < tabs.length; i++) {
      var isOwn = tabs[i].id === SETTINGS_TAB_ID
      if (isOwn) {
        if (own) tabs[i].setAttribute('data-ef-active', '1')
        else tabs[i].removeAttribute('data-ef-active')
      } else if (own) {
        // The shell marks its own active tab with a class whose name is a build hash, so the
        // only portable way to clear it is to match the part that is not.
        var classes = (tabs[i].className || '').toString().split(/\s+/)
        tabs[i].setAttribute('data-ef-was-active', '')
        for (var c = 0; c < classes.length; c++) {
          if (/active/i.test(classes[c])) tabs[i].classList.remove(classes[c])
        }
      }
    }
  }

  function syncSettingsControls() {
    var panel = doc.getElementById(SETTINGS_PANEL_ID)
    if (panel === null) return
    // Selects carry `data-ef-setting` too, so the query is by attribute rather than by tag.
    var inputs = panel.querySelectorAll('[data-ef-setting]')
    for (var i = 0; i < inputs.length; i++) {
      var input = inputs[i]
      var name = input.getAttribute('data-ef-setting')
      if (input.tagName === 'SELECT') input.value = String(setting(name))
      else if (input.type === 'checkbox') input.checked = setting(name) !== false
      else input.value = String(setting(name))
    }
    syncSettingGates()
  }

  /**
   * Which settings are decided by which.
   *
   * These are real dependencies, not visual grouping: with the splash off there is no sting to
   * hear; with the reserve panel off there is no poll, so the warnings stop too; with the
   * threshold at zero "full scale = threshold x N" means nothing.
   *
   * The rule for a child is simply "the parent's value is truthy", which covers both kinds of
   * master: a switch that is off, and a number that is zero.
   */
  var SETTING_PARENT = {
    bootAudio: 'splash',
    crtStrength: 'crt',
    pollSeconds: 'balance',
    warnVoice: 'balance',
    warnAt: 'balance',
    warnVolume: 'warnVoice',
    warnClip: 'warnVoice',
    warnLength: 'warnClip',
    warnDays: 'balance',
    gaugeSpan: 'warnAt',
  }

  /**
   * Gates that are not "the parent is truthy".
   *
   * The length only matters for one of the four renditions, so it is not enough to know that a
   * master is on: the parent has to be in a particular state. Kept separate from SETTING_PARENT
   * because that map also decides indentation, and this rule is about availability only.
   */
  var SETTING_GATE = {
    warnLength: function () {
      return setting('warnClip') === 'custom'
    },
  }

  function settingDepth(name) {
    var depth = 0
    var cursor = name
    while (SETTING_PARENT[cursor] !== undefined && depth < 8) {
      cursor = SETTING_PARENT[cursor]
      depth += 1
    }
    return depth
  }

  function settingUsable(name) {
    var gate = SETTING_GATE[name]
    if (typeof gate === 'function' && !gate()) return false
    var cursor = SETTING_PARENT[name]
    while (cursor !== undefined) {
      if (!setting(cursor)) return false
      var nested = SETTING_GATE[cursor]
      if (typeof nested === 'function' && !nested()) return false
      cursor = SETTING_PARENT[cursor]
    }
    return true
  }

  /**
   * Grey out and genuinely disable anything whose master is off.
   *
   * `input.disabled` rather than a pointer-events trick, so a keyboard cannot reach a control
   * that has no effect either. Rows are dimmed rather than hidden, so switching a master on and
   * off does not make the page jump around under the pointer.
   */
  function syncSettingGates() {
    var panel = doc.getElementById(SETTINGS_PANEL_ID)
    if (panel === null) return
    var rows = panel.querySelectorAll('.ef-set__row[data-ef-setting]')
    for (var i = 0; i < rows.length; i++) {
      var usable = settingUsable(rows[i].getAttribute('data-ef-setting'))
      rows[i].classList.toggle('is-gated', !usable)
      var inputs = rows[i].querySelectorAll('input, select')
      for (var j = 0; j < inputs.length; j++) inputs[j].disabled = !usable
    }
  }

  /* ------------------------------------------------------------- warning audio */

  /**
   * Seconds of each rendition. `voice` is 0, meaning "play the whole clip".
   *
   * A length cap rather than trimmed audio files: the thing people want to change is how much
   * talking they get, one asset can serve every length, and trimming at playback keeps the choice
   * adjustable from the settings page instead of baked into the package.
   */
  var CLIP_SECONDS = { voice: 0, brief: 2.4, beep: 0.5 }

  var audioContext = null
  var currentClip = null

  function warnVolumeLevel() {
    var volume = Number(setting('warnVolume'))
    return isFinite(volume) ? Math.min(1, Math.max(0, volume / 100)) : 0.9
  }

  function clipSeconds() {
    var mode = setting('warnClip')
    if (mode === 'custom') {
      var seconds = Number(setting('warnLength'))
      if (!isFinite(seconds) || seconds <= 0) return DEFAULTS.warnLength
      return Math.min(10, Math.max(0.5, seconds))
    }
    var fixed = CLIP_SECONDS[mode]
    return typeof fixed === 'number' ? fixed : 0
  }

  function stopCurrentClip() {
    if (currentClip === null) return
    if (currentClip.timer !== null) window.clearTimeout(currentClip.timer)
    if (currentClip.fade !== null) window.clearInterval(currentClip.fade)
    try {
      currentClip.audio.pause()
    } catch (err) {
      /* already finished */
    }
    currentClip = null
  }

  /**
   * A synthesised two-note chime.
   *
   * The "too long" complaint is really "I want a signal, not a sentence", and no available asset
   * is shorter than a sentence. This one is generated, so it ships for nothing, and the two notes
   * follow the same low/empty split the voice clips use.
   */
  function playChime(level, volume) {
    var Ctor = window.AudioContext || window.webkitAudioContext
    if (!Ctor) return false
    try {
      if (audioContext === null) audioContext = new Ctor()
      if (audioContext.state === 'suspended') audioContext.resume()
      var now = audioContext.currentTime
      var gain = audioContext.createGain()
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.linearRampToValueAtTime(Math.max(0.02, volume * 0.45), now + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.52)
      gain.connect(audioContext.destination)
      var osc = audioContext.createOscillator()
      osc.type = 'triangle'
      var low = level === 'empty'
      osc.frequency.setValueAtTime(low ? 520 : 740, now)
      osc.frequency.setValueAtTime(low ? 390 : 590, now + 0.13)
      osc.frequency.setValueAtTime(low ? 300 : 470, now + 0.28)
      osc.connect(gain)
      osc.start(now)
      osc.stop(now + 0.55)
      return true
    } catch (err) {
      return false
    }
  }

  /**
   * Sound the warning for `level`, honouring the chosen rendition and length.
   *
   * One path for both the real warning and the audition buttons, so trying a setting hears exactly
   * what the warning will do - the previous revision had the audition bypass the volume control's
   * own path, which made "试听" a weaker test than it looked.
   */
  function playWarning(level) {
    var volume = warnVolumeLevel()
    stopCurrentClip()
    if (volume <= 0) return
    if (setting('warnClip') === 'beep') {
      if (playChime(level, volume)) return
      /* No WebAudio: fall through to the clip rather than staying silent. */
    }
    var cap = clipSeconds()
    try {
      var audio = new window.Audio(
        ROOT + (level === 'empty' ? '/assets/endfield-no-power.mp3' : '/assets/endfield-low-power.mp3'),
      )
      audio.volume = volume
      currentClip = { audio: audio, timer: null, fade: null }
      var started = audio.play()
      if (started !== undefined && started !== null && typeof started.catch === 'function') {
        started.catch(function () {
          /* refused without a gesture; the gauge still shows the state */
        })
      }
      if (cap > 0) scheduleStop(cap, volume)
    } catch (err) {
      /* no audio available is not a reason to skip the readout */
    }
  }

  /**
   * Fade the tail of the clip out and stop at `cap` seconds.
   *
   * A hard cut sounds like a fault, so the last 300ms ramps the volume down instead. The fade and
   * the stop are both tracked, because a second warning (or an audition) has to be able to cancel
   * them - otherwise a stale timer would mute the clip that replaced it.
   */
  function scheduleStop(cap, volume) {
    var clip = currentClip
    if (clip === null) return
    var fadeAt = Math.max(0, cap - 0.3)
    clip.timer = window.setTimeout(function () {
      if (currentClip !== clip) return
      var steps = 6
      var step = 0
      clip.fade = window.setInterval(function () {
        if (currentClip !== clip) return
        step += 1
        try {
          clip.audio.volume = volume * Math.max(0, 1 - step / steps)
        } catch (err) {
          /* the element may already be gone */
        }
        if (step >= steps) {
          window.clearInterval(clip.fade)
          clip.fade = null
          try {
            clip.audio.pause()
          } catch (err) {
            /* already stopped */
          }
          if (currentClip === clip) currentClip = null
        }
      }, (0.3 * 1000) / steps)
    }, fadeAt * 1000)
  }

  /** Play one of the warning clips at the configured volume and length. */
  function auditionClip(which) {
    playWarning(which)
  }


  /** A button in the settings page, styled by `.ef-set__button`. */
  function panelButton(label, onClick) {
    var button = doc.createElement('button')
    button.type = 'button'
    button.className = 'ef-set__button'
    button.textContent = label
    button.addEventListener('click', onClick)
    return button
  }

  /**
   * Copy the settings out as JSON.
   *
   * The clipboard is the point, but it is also the part that can fail (a permission prompt, an
   * insecure context), so a prompt showing the text is the fallback rather than an error. The
   * button says "已复制" for a moment, because otherwise a successful copy looks like nothing
   * happened at all.
   */
  function exportSettings(button) {
    var json = JSON.stringify(stored || {})
    var show = function () {
      window.prompt('复制这段配置：', json)
    }
    var flash = function () {
      if (button === null || button === undefined) return
      var original = button.textContent
      button.textContent = '已复制'
      window.setTimeout(function () { button.textContent = original }, 1200)
    }
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(json).then(flash, show)
        return
      }
    } catch (err) {
      /* fall through to the prompt */
    }
    show()
  }

  /**
   * Take settings in as JSON.
   *
   * Only keys this build knows are copied across, so a pasted blob cannot introduce state the
   * rest of the theme will never validate. A value of the wrong TYPE for a known key is dropped
   * by the same pass - `setting()` falls back to the default for anything it cannot use, and a
   * number arriving where a boolean belongs would otherwise read as a truthy switch.
   */
  function importSettings() {
    var raw = window.prompt('粘贴配置 JSON：')
    if (raw === null) return
    var parsed
    try {
      parsed = JSON.parse(raw)
    } catch (err) {
      window.alert('配置解析失败：不是合法的 JSON')
      return
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      window.alert('配置解析失败：顶层必须是一个对象')
      return
    }
    var clean = {}
    for (var key in DEFAULTS) {
      if (!Object.prototype.hasOwnProperty.call(parsed, key)) continue
      if (typeof parsed[key] !== typeof DEFAULTS[key]) continue
      clean[key] = parsed[key]
    }
    if (Object.keys(clean).length === 0) {
      window.alert('这段配置里没有可识别的项')
      return
    }
    saveSettings(clean)
    applySettings()
    syncSettingsControls()
    drawBalance()
    startBalanceTimer()
  }

  /**
   * Wipe everything this plugin has ever stored, in one action.
   *
   * The point is a clean install of a later version: the two localStorage keys below are the
   * COMPLETE list of what this plugin writes anywhere - no cookies, no files, and the host
   * half's balance cache is memory-only - so removing them is genuinely everything.
   *
   * What it deliberately does NOT do is uninstall the package. That means editing the
   * profile's package.json and cordis.patch.yml, which is the user's own configuration: a
   * plugin that rewrites it from inside a page can break the client it is running in, and that
   * is not a trade worth making to save one paste. Instead the command is copied to the
   * clipboard so finishing the job is one paste, and the dialog says exactly what was and was
   * not done.
   */
  var UNINSTALL_COMMAND = 'dsh plugin --profile desktop remove dsh-endfield-theme'

  /**
   * True once the data has been wiped on this page.
   *
   * Without it the wipe undoes itself: `drawBalance()` runs right afterwards, and it derives the
   * day's baseline from the current balance and writes that back - so the key the button just
   * removed reappears within a frame. The flag suppresses the DERIVED value only. A setting the
   * user changes afterwards is a new choice and is still saved.
   */
  var dataWiped = false

  function clearPluginData() {
    var confirmed = window.confirm(
      '卸载终末地主题？\n\n' +
        '· 从 DSH 的 profile 里移除本插件（会先备份配置文件）\n' +
        '· 清空本插件的全部本地数据：13 项设置与「今日变化」统计\n' +
        '· 界面上立即消失，重启客户端后完全生效\n\n' +
        '（不会动 profile 里任何其他插件。）',
    )
    if (!confirmed) return

    var cleared = []
    try {
      if (window.localStorage.getItem(SETTINGS_KEY) !== null) cleared.push('设置')
      window.localStorage.removeItem(SETTINGS_KEY)
    } catch (err) {
      /* private mode: nothing was stored to begin with */
    }
    try {
      if (window.localStorage.getItem(SPEND_KEY) !== null) cleared.push('统计基线')
      window.localStorage.removeItem(SPEND_KEY)
    } catch (err) {
      /* as above */
    }

    dataWiped = true
    stored = null
    spendBaseline = null
    warnedLevel = null
    applySettings()
    syncSettingsControls()
    drawBalance()
    startBalanceTimer()

    /**
     * Take the plugin's own marks off the page.
     *
     * The running script cannot unload itself, but everything it put in the document can go -
     * so the interface looks uninstalled immediately rather than after a restart. The observer
     * is disconnected first, or it would helpfully rebuild the layers a frame later.
     */
    function removeOwnDom() {
      // Before anything else: stop the rebuilders. The rAF pump and the debounced conversation
      // tick are still scheduled, and they would put the brand and the layers straight back.
      uninstalled = true
      try {
        if (window.__dshEndfieldTheme && window.__dshEndfieldTheme.observer) {
          window.__dshEndfieldTheme.observer.disconnect()
        }
      } catch (err) {
        /* nothing to disconnect */
      }
      var ids = ['ef-power', 'ef-crt', 'ef-backdrop', 'ef-splash', SETTINGS_PANEL_ID, SETTINGS_TAB_ID]
      for (var i = 0; i < ids.length; i++) {
        var node = doc.getElementById(ids[i])
        if (node !== null && node.parentNode !== null) node.parentNode.removeChild(node)
      }
      var brands = doc.querySelectorAll('.ef-brand')
      for (var b = 0; b < brands.length; b++) {
        if (brands[b].parentNode !== null) brands[b].parentNode.removeChild(brands[b])
      }
      html.removeAttribute('data-ef-splash')
      html.removeAttribute('data-ef-brand')
      html.removeAttribute('data-ef-conversation')
      html.removeAttribute('data-ef-rail')
      html.removeAttribute('data-ef-crt')
      html.removeAttribute('data-dsh-endfield')
    }

    var report = function (text) {
      removeOwnDom()
      window.alert(text)
    }

    /**
     * Ask the host to take the plugin out of the profile.
     *
     * The host owns that write; the page cannot do it. A failure here is reported as a failure -
     * the local data is cleared either way, so the honest outcome is "data cleared, uninstall
     * did not happen, here is the command".
     */
    var request
    try {
      request = window.fetch(ROOT + '/uninstall', { method: 'POST', credentials: 'same-origin' })
    } catch (err) {
      request = null
    }
    if (request === null) {
      report(
        '本地数据已清除，但没能联系到宿主半区。\n\n' +
          '本次运行的版本可能还没有这个接口 —— 重启客户端后再试一次，或手动运行：\n' +
          UNINSTALL_COMMAND,
      )
      return
    }

    request
      .then(function (response) {
        return response.ok ? response.json() : null
      })
      .then(function (payload) {
        var head = cleared.length === 0 ? '本地数据本来就没有残留。' : '已清除：' + cleared.join('、') + '。'
        if (payload !== null && payload.ok === true) {
          var which = Array.isArray(payload.profiles)
            ? payload.profiles.map(function (entry) {
                var parts = []
                if (entry.changed && entry.changed.length > 0) parts.push(entry.changed.join(' + '))
                if (entry.backup && entry.backup.length > 0) parts.push('已备份')
                return parts.join('，') || '无需改动'
              }).join('；')
            : ''
          report(
            head +
              '\n\n已从 profile 移除本插件' +
              (which === '' ? '' : '（' + which + '）') +
              '。\n\n界面已清空，重启客户端后完全生效。' +
              '\n\n卸载命令同样留一份在这：\n' +
              UNINSTALL_COMMAND,
          )
          return
        }
        var why = payload !== null && typeof payload.error === 'string' ? payload.error : '宿主半区返回了失败'
        report(
          head +
            '\n\n但自动卸载没有成功：' +
            why +
            '\n\n请在终端手动运行：\n' +
            UNINSTALL_COMMAND,
        )
      })
      .catch(function () {
        report(
          (cleared.length === 0 ? '本地数据本来就没有残留。' : '已清除：' + cleared.join('、') + '。') +
            '\n\n但自动卸载没有成功（请求失败）。\n\n请在终端手动运行：\n' +
            UNINSTALL_COMMAND,
        )
      })
  }

  function buildSettingsPanel() {
    var panel = doc.createElement('div')
    panel.id = SETTINGS_PANEL_ID
    panel.hidden = true

    var head = doc.createElement('div')
    head.className = 'ef-set__head'
    head.innerHTML = '<b>终末地主题</b><i>ENDFIELD THEME</i>'
    panel.appendChild(head)

    var list = doc.createElement('div')
    list.className = 'ef-set__list'

    // Parents before children: the order is the reading order of the page.
    var spec = [
      ['splash', 'toggle', '开屏动画', '每次加载播一次，约 2.9 s · 修改后重启客户端生效'],
      ['bootAudio', 'toggle', '开屏音效', '开屏时播放的那条提示音 · 修改后重启客户端生效'],
      ['brand', 'toggle', '替换侧栏品牌位', '换成终末地 lockup · 修改后重启客户端生效'],
      ['crt', 'toggle', '屏幕细纹', '静态扫描线，不占每帧预算'],
      ['crtStrength', 'range', '细纹强度', '0 = 关闭'],
      ['turnRail', 'toggle', '轮次索引', '对话左侧的轮次号'],
      ['conversation', 'toggle', '对话区背景', '有对话内容时的主视觉'],
      ['backdrop', 'select', '对话区底图', '内置 / 等高线 / 自备图片（~/.dsh/endfield-backdrops）'],
      ['balance', 'toggle', '侧栏电力储备', '把账户余额画成电量计'],
      ['pollSeconds', 'number', '余额刷新间隔', '最小 15 秒'],
      ['warnVoice', 'toggle', '余额语音播报', '低于阈值 / 耗尽时播报'],
      ['warnClip', 'select', '播报版本', '完整语音约 9 秒；简短 / 提示音更利落'],
      ['warnLength', 'number', '播报时长', '仅「自定义」生效，0.5–10 秒'],
      ['warnVolume', 'range', '播报音量', '拖动即试听'],
      ['warnAt', 'number', '预警阈值', '余额低于它播报一次'],
      ['warnDays', 'number', '余额可用天数', '0 = 关闭；按最近一周的消耗速度折算'],
      ['gaugeSpan', 'range', '电量计满量程', '阈值 × 这个倍数 = 满格'],
    ]

    /* The four renditions offered for 播报版本. Values are what `warnClip` stores; the labels say
       how long each one runs, because "how long" is the question this setting exists to answer. */
    var WARN_CLIPS = [
      ['voice', '完整语音（约 9 秒）'],
      ['brief', '简短（约 2.4 秒）'],
      ['beep', '提示音（0.5 秒）'],
      ['custom', '自定义时长'],
    ]

    for (var i = 0; i < spec.length; i++) {
      var name = spec[i][0]
      var kind = spec[i][1]
      var control
      if (kind === 'toggle') control = toggleControl(name)
      else if (kind === 'select') {
        if (name === 'backdrop') {
          // Seeded with the built-in four; refreshBackdropOptions() adds the user's files once the
          // host has answered and the panel is in the document.
          control = selectControl(name, [
            ['field', '炭黑 · 终末地原画'],
            ['day', '雪原 · 亮底'],
            ['contour', '等高线（无角色，适合办公）'],
            ['none', '纯色 · 无底图'],
          ])
        } else {
          control = selectControl(name, WARN_CLIPS, function () { auditionClip('low') })
        }
      }
      else if (kind === 'range') {
        if (name === 'crtStrength') control = rangeControl(name, 0, 60, '%')
        else if (name === 'warnVolume') control = rangeControl(name, 0, 100, '%', function () { auditionClip('low') })
        else control = rangeControl(name, 2, 12, 'x', drawBalance)
      } else if (name === 'pollSeconds') control = numberControl(name, 15, 600, '秒', startBalanceTimer)
      else if (name === 'warnLength') {
        control = numberControl(name, 0.5, 10, '秒', function () { auditionClip('low') })
        // Half-second steps: the whole point is choosing a length shorter than the clip.
        control.firstChild.step = '0.5'
      }
      else if (name === 'warnDays') control = numberControl(name, 0, 60, '天', drawBalance)
      else control = numberControl(name, 0, 9999, '元')

      if (control.tagName === 'INPUT') control.setAttribute('data-ef-setting', name)
      else control.firstChild.setAttribute('data-ef-setting', name)
      list.appendChild(settingsRow(name, spec[i][2], spec[i][3], control))
    }

    // Audition row. This is what the debug URL was for, in the form that needs no URL: press a
    // button, hear the clip. It also exercises exactly the path the real warning uses.
    var buttons = doc.createElement('span')
    buttons.className = 'ef-set__buttons'
    buttons.appendChild(panelButton('输出不足', function () { auditionClip('low') }))
    buttons.appendChild(panelButton('储备耗尽', function () { auditionClip('empty') }))
    list.appendChild(settingsRow('audition', '试听警告音', '立即播放，不改变任何设置', buttons))

    // Panel placement. Dragging is the primary way; this exists so a panel dragged somewhere
    // useless can be recovered without clearing every other setting.
    var place = doc.createElement('span')
    place.className = 'ef-set__buttons'
    place.appendChild(panelButton('复位到左下角', function () {
      var next = Object.assign({}, stored || {}, {})
      next.powerPos = ''
      saveSettings(next)
      applyPowerPosition()
      syncSettingsControls()
    }))
    list.appendChild(settingsRow('powerpos', '面板位置', '直接拖动侧栏面板即可移动，双击复位', place))

    // Maintenance row: the two operations every settings page of this size needs.
    var tools = doc.createElement('span')
    tools.className = 'ef-set__buttons'
    tools.appendChild(panelButton('重置为默认', function () {
      saveSettings({})
      applySettings()
      syncSettingsControls()
      drawBalance()
      startBalanceTimer()
    }))
    tools.appendChild(panelButton('导出', function (event) {
      exportSettings(event.currentTarget)
    }))
    tools.appendChild(panelButton('导入', function () {
      importSettings()
    }))
    list.appendChild(settingsRow('config', '配置', '导出复制到剪贴板，导入粘贴 JSON', tools))

    // One button, for the moment before installing a new version: wipe everything this plugin
    // has ever written, so nothing of the old build leaks into the new one.
    var wipe = doc.createElement('span')
    wipe.className = 'ef-set__buttons'
    wipe.appendChild(panelButton('清除本插件数据', function () {
      clearPluginData()
    }))
    list.appendChild(settingsRow('wipe', '清除数据', '清空设置与统计，并把卸载命令复制到剪贴板', wipe))

    panel.appendChild(list)

    var note = doc.createElement('div')
    note.className = 'ef-set__note'
    note.textContent = '开屏 / 品牌位 / 开屏音效在重启客户端后生效；URL 上的 ?dsh-endfield-<项>=0 优先级最高。'
    panel.appendChild(note)

    syncSettingGates()
    return panel
  }

  function ensureSettingsPanel() {
    if (uninstalled) return
    // The id lookup comes FIRST and is cheap, so this can be called on every animation frame
    // from the pump below without querying the dialog each time.
    if (doc.getElementById(SETTINGS_TAB_ID) !== null) return
    var parts = findSettingsParts()
    if (parts === null) return

    var tab = doc.createElement('button')
    tab.id = SETTINGS_TAB_ID
    tab.className = parts.lastTab.className
    tab.type = 'button'
    tab.innerHTML = '<span class="ef-set__tabLabel">终末地主题</span>'
    tab.addEventListener('click', function () {
      showOwnTab(parts, true)
    })
    parts.lastTab.parentNode.appendChild(tab)

    // Any of the shell's own tabs hands the content area back.
    parts.nav.addEventListener('click', function (event) {
      var target = event.target
      while (target !== null && target !== parts.nav && target.tagName !== 'BUTTON') {
        target = target.parentNode
      }
      if (target === null || target === parts.nav) return
      if (target.id === SETTINGS_TAB_ID) return
      showOwnTab(parts, false)
    })

    // Inside the scroller, right after the section it replaces - so it scrolls with the
    // dialog's own content instead of sitting outside it and running past the fold.
    parts.options.insertBefore(buildSettingsPanel(), parts.section.nextSibling)

    // Gates again, now that the panel is in the document. buildSettingsPanel() calls
    // syncSettingGates() before returning, but at that moment the panel is still detached - the
    // lookup is by id from the document, so it found nothing and returned silently. The result
    // was that on first open every dependent row looked usable until the user touched something.
    syncSettingGates()
    refreshBackdropOptions()
  }

  /**
   * Install the panel the moment the dialog appears, instead of up to 200ms later.
   *
   * The dialog is opened by a click, so that click is the signal: pump on rAF for about a
   * second and a half and stop as soon as the panel is in. This is what removes the visible
   * delay - the shell renders the dialog a frame or two after the click, and the previous path
   * (the conversation MutationObserver, which is deliberately debounced by 200ms to survive
   * streaming transcripts) only noticed it after that window had elapsed.
   *
   * The observer path stays as the fallback, for a dialog opened some other way.
   */
  function pumpSettingsPanel() {
    var frames = 0
    var step = function () {
      ensureSettingsPanel()
      if (doc.getElementById(SETTINGS_TAB_ID) === null && frames++ < 90) {
        window.requestAnimationFrame(step)
      }
    }
    window.requestAnimationFrame(step)
  }

  /* -------------------------------------------------------- settings panel end */

  /* ------------------------------------------------------------------ brand */

  /**
   * The sidebar mark is the supplied Endfield lockup itself — crest, wordmark
   * and triangle — served as a theme asset and chosen by CSS for whichever
   * sidebar it has to sit on (see 4c in theme.css). At ~28px the wordmark
   * inside it is not readable and is not meant to be: it reads as the
   * silhouette, beside the name that spells it out.
   *
   * Duotone artwork needs two files rather than one — on the pale sidebar its
   * white half disappears, on the charcoal sidebar its black half does. The
   * dark-sidebar file is the same art with black and white swapped.
   *
   * Deliberately a background rather than an <img> so the swap is one CSS rule
   * and the asset never lands in the accessibility tree twice.
   */
  function brandEnabled() {
    return setting('brand') !== false
  }

  /**
   * Swap the sidebar's brand for the theme's own.
   *
   * The originals are React-owned, so they are hidden by CSS and the replacement
   * is appended beside them rather than removed. If a re-render drops it, the
   * observer in start() puts it back; the `data-ef-brand` gate keeps that
   * idempotent, so this can never ping-pong with React.
   *
   * Deliberately cosmetic: the button keeps its own `aria-label` (new session)
   * and the whole identity span is aria-hidden, so nothing about what the
   * control *does* changes.
   */
  function decorateBrand() {
    if (uninstalled) return
    if (!brandEnabled()) return
    var button = doc.querySelector('[data-slot="sidebar"] button[class*="brand"]')
    if (button === null || button.getAttribute('data-ef-brand') === 'on') return
    var span = doc.createElement('span')
    span.className = 'ef-brand'
    span.setAttribute('aria-hidden', 'true')
    span.innerHTML = '<span class="ef-brand__mark"></span>'
      + '<span class="ef-brand__name">终末地工业</span>'
      + '<span class="ef-brand__badge">ENDFIELD</span>'
    button.setAttribute('data-ef-brand', 'on')
    html.setAttribute('data-ef-brand', 'on')
    button.appendChild(span)
  }

  /* ---------------------------------------------------------------- splash */

  /**
   * The splash normally arrives already in the document: the host emits it as a
   * `html` index-injection row, which both transports apply before the shell
   * renders. This module only drives its lifecycle — decides when it is over,
   * removes it, and fixes up the desktop caption colours on the way in and out.
   *
   * The fetch below is the fallback for a page that got this script without the
   * row (a stale desktop injection table, a hand-rolled harness). It pulls the
   * same two files the row is built from, so nothing is duplicated here.
   */
  var splashMarkupPromise = null

  function splashEnabled() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
    return setting('splash') !== false
  }

  function ensureSplashStyle() {
    if (doc.querySelector('link[data-dsh-endfield-splash]') !== null) return
    var link = doc.createElement('link')
    link.rel = 'stylesheet'
    link.href = ROOT + '/splash.css'
    link.setAttribute('data-dsh-endfield-splash', '1')
    ;(doc.head || html).appendChild(link)
  }

  function fetchSplashMarkup() {
    if (splashMarkupPromise === null) {
      splashMarkupPromise = fetch(ROOT + '/splash.html').then(function (response) {
        if (!response.ok) throw new Error('splash markup ' + response.status)
        return response.text()
      })
    }
    return splashMarkupPromise
  }

  /** @returns a promise for the splash element, or null when it cannot be had. */
  function mountSplash() {
    var existing = doc.getElementById('ef-splash')
    if (existing !== null) return Promise.resolve(existing)
    if (doc.body === null) return Promise.resolve(null)
    ensureSplashStyle()
    return fetchSplashMarkup().then(function (markup) {
      var again = doc.getElementById('ef-splash')
      if (again !== null) return again
      doc.body.insertAdjacentHTML('beforeend', markup)
      return doc.getElementById('ef-splash')
    }).catch(function () {
      return null
    })
  }

  /**
   * How far into the timeline the injected splash already is.
   *
   * The row starts its CSS animations the moment it is parsed, which can be
   * hundreds of milliseconds before this script arrives, so the schedule has to
   * be relative to the animation clock rather than to "now".
   */
  function splashElapsed(el) {
    if (typeof el.getAnimations !== 'function') return 0
    var animations = el.getAnimations()
    for (var index = 0; index < animations.length; index += 1) {
      var animation = animations[index]
      if (animation.animationName === 'ef-splash-clock' && typeof animation.currentTime === 'number') {
        return animation.currentTime
      }
    }
    return 0
  }

  /**
   * Force the desktop preload to re-measure the caption colours.
   *
   * It reads `--dsw-specific-sidebar-fill` / `--dsw-alias-label-primary` off a
   * hidden probe and pushes them to the main process, but only on a mutation of
   * `html[lang]` or `body[data-ds-dark-theme]`. Re-assigning `lang` its own
   * value produces that record without changing anything visible.
   */
  function pokeCaptionColors() {
    try {
      html.lang = html.lang
    } catch (err) {
      /* a document without a lang attribute is not worth failing over */
    }
  }

  function driveSplash(el) {
    var finished = false
    var doneTimer = null
    var goneTimer = null
    var audio = null
    var audioFade = null
    var rafId = null
    var pct = el.querySelector('.ef-splash__pct')

    function restore() {
      html.removeAttribute('data-ef-splash')
      pokeCaptionColors()
    }

    function remove() {
      if (el.parentNode !== null) el.parentNode.removeChild(el)
    }

    /**
     * The read-out, driven off the clock animation rather than off `now`: on a cold
     * start the row is parsed hundreds of milliseconds before this script arrives, so
     * a counter started here would sit at 0% while the bar was already filling.
     */
    function tickProgress() {
      var t = splashElapsed(el)
      var ratio = (t - SPLASH_FILL_AT_MS) / SPLASH_FILL_MS
      if (pct !== null) {
        pct.textContent = (ratio <= 0 ? 0 : ratio >= 1 ? 100 : Math.round(ratio * 100)) + '%'
      }
      if (!finished) rafId = window.requestAnimationFrame(tickProgress)
    }

    /**
     * Best effort, never awaited and never surfaced: a browser that refuses autoplay
     * rejects the promise, and that is an expected outcome rather than a failure. If
     * it is refused the splash simply runs silent.
     */
    function startAudio() {
      if (setting('bootAudio') === false) return
      try {
        audio = new window.Audio(SPLASH_AUDIO)
        audio.volume = 0.9
        var started = audio.play()
        if (started !== undefined && started !== null && typeof started.catch === 'function') {
          started.catch(function () { audio = null })
        }
      } catch (err) {
        audio = null
      }
    }

    /**
     * Fade rather than cut: the clip runs about 5.9s and the splash is over at 2.8s,
     * so a hard stop would be audible. Detached from `audio` first, so dispose() and
     * finish() cannot both fade the same node.
     */
    function stopAudio() {
      if (audio === null) return
      var node = audio
      audio = null
      var from = node.volume
      var steps = 10
      var n = 0
      try {
        audioFade = window.setInterval(function () {
          n += 1
          try { node.volume = Math.max(0, from * (1 - n / steps)) } catch (err) { /* ignore */ }
          if (n >= steps) {
            window.clearInterval(audioFade)
            audioFade = null
            try { node.pause() } catch (err) { /* ignore */ }
          }
        }, 45)
      } catch (err) {
        try { node.pause() } catch (e2) { /* ignore */ }
      }
    }

    function finish() {
      if (finished) return
      finished = true
      if (rafId !== null) window.cancelAnimationFrame(rafId)
      rafId = null
      stopAudio()
      el.classList.add('is-done')
      restore()
      goneTimer = setTimeout(remove, SPLASH_FADE_MS)
    }

    function skip() {
      if (finished) return
      clearTimeout(doneTimer)
      finish()
    }

    var remaining = Math.max(0, SPLASH_MS - splashElapsed(el))
    doneTimer = setTimeout(finish, remaining)
    el.addEventListener('pointerdown', skip)
    window.addEventListener('keydown', skip, { once: true })
    tickProgress()
    startAudio()

    return function dispose() {
      clearTimeout(doneTimer)
      clearTimeout(goneTimer)
      if (rafId !== null) window.cancelAnimationFrame(rafId)
      if (audioFade !== null) window.clearInterval(audioFade)
      if (audio !== null) {
        try { audio.pause() } catch (err) { /* ignore */ }
        audio = null
      }
      remove()
    }
  }

  function runSplash() {
    return mountSplash().then(function (el) {
      if (el === null) return null
      if (!splashEnabled()) {
        // Reduced motion or an explicit opt-out: splash.css already hides it, so
        // drop the node and hand the caption colours back immediately.
        if (el.parentNode !== null) el.parentNode.removeChild(el)
        html.removeAttribute('data-ef-splash')
        pokeCaptionColors()
        return null
      }
      return driveSplash(el)
    })
  }

  /* ------------------------------------------------------------ system tint */

  function syncThemeColor() {
    var meta = doc.head && doc.head.querySelector('meta[name="theme-color"]')
    if (meta === null || meta === undefined) {
      meta = doc.createElement('meta')
      meta.name = 'theme-color'
      if (doc.head !== null) doc.head.appendChild(meta)
    }
    var dark = doc.body !== null && doc.body.hasAttribute('data-ds-dark-theme')
    meta.setAttribute('content', dark ? '#050606' : '#eef0ea')
    // The canvas colour is painted by inline style rather than a `:has()` rule
    // in the critical CSS, so the shell's light/dark switch never costs a
    // document-wide selector re-evaluation.
    html.style.backgroundColor = dark ? '#050606' : '#eef0ea'

    var favicon = doc.querySelector('link[rel="icon"][data-dsh-endfield-icon]')
    if (favicon === null) {
      favicon = doc.createElement('link')
      favicon.rel = 'icon'
      favicon.type = 'image/svg+xml'
      favicon.setAttribute('data-dsh-endfield-icon', '1')
      favicon.href = ROOT + '/assets/endfield-icon.svg'
      if (doc.head !== null) doc.head.appendChild(favicon)
    }
  }

  /* ------------------------------------------------------------ conversation */

  /**
   * Whether the current conversation has message rows. The stylesheet dims the
   * artwork when it does, so an occupied transcript keeps its contrast without
   * dimming the empty-state screen (where the art is the whole point).
   */
  function syncConversationState() {
    var hasRows = doc.querySelector('[data-chat-anchor-key], [data-chat-flow-kind]') !== null
    if (hasRows && setting('conversation') !== false) html.setAttribute('data-ef-conversation', 'on')
    else html.removeAttribute('data-ef-conversation')
  }

  /* ------------------------------------------------------------------ boot */

  function start() {
    if (doc.body === null) {
      doc.addEventListener('DOMContentLoaded', start, { once: true })
      return
    }
    ensureBackdrop()
    syncThemeColor()
    syncConversationState()
    // The user's own backdrop pictures, if the host route exists yet.
    loadBackdrops()

    // The shell renders its columns after this script runs, so the frame has to
    // wait for the conversation column to exist: pump on rAF until it does, then
    // let the ResizeObserver take over.
    var framePumps = 0
    var pumpFrame = function () {
      syncFrame()
      decorateBrand()
      if (frameTarget === null && framePumps++ < 600) window.requestAnimationFrame(pumpFrame)
    }
    window.requestAnimationFrame(pumpFrame)
    window.addEventListener('resize', syncFrame)

    // Opening the settings dialog is a click, so a click is the wake-up call. Capture phase, so
    // it still fires if the shell stops propagation on its own handlers.
    doc.addEventListener('click', pumpSettingsPanel, true)

    // The shell owns its own DOM; watch only for our layers going missing
    // (a re-mount of body's children, a page-level cleanup) and put them back.
    try {
      var observer = new MutationObserver(function () {
        ensureBackdrop()
      })
      observer.observe(doc.body, { childList: true })
      window.__dshEndfieldTheme.observer = observer
    } catch (err) {
      /* MutationObserver missing is not fatal: the layers simply stay put */
    }

    // Transcripts stream in; the dim state follows at a coarse cadence rather
    // than on every mutation of a streaming message. The HUD frame re-syncs on
    // the same tick, which is what catches a sidebar collapse or a column swap.
    var conversationTimer = null
    var conversationObserver = new MutationObserver(function () {
      if (conversationTimer !== null) return
      conversationTimer = setTimeout(function () {
        conversationTimer = null
        syncConversationState()
        syncFrame()
        decorateBrand()
        ensureSettingsPanel()
      }, 200)
    })
    conversationObserver.observe(doc.body, { childList: true, subtree: true })

    var themeObserver = new MutationObserver(syncThemeColor)
    themeObserver.observe(doc.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })

    // The splash is already in the document (the host emits it as an injection
    // row) and its animations have been running since it was parsed, so it is
    // driven immediately rather than after the stylesheet settles. Its own rules
    // ship with it in splash.css, so there is nothing to wait for.
    runSplash()
    ensureStylesheet()
  }

  /** Replay the boot animation on demand (console: __dshEndfieldTheme.replay()). */
  window.__dshEndfieldTheme.replay = function replay() {
    var running = doc.getElementById('ef-splash')
    if (running !== null && running.parentNode !== null) running.parentNode.removeChild(running)
    html.setAttribute('data-ef-splash', 'on')
    pokeCaptionColors()
    splashMarkupPromise = null
    runSplash()
  }

  /**
   * Build the settings page on demand.
   *
   * Exposed for the same reason `replay()` is: it is the only way to exercise the page outside
   * the click that normally opens it. A test that loads a second copy of this script into a page
   * that already has one cannot win the race for the dialog - whichever copy registered its
   * click pump first builds the page - so being able to call the builder directly is what makes
   * the un-installed code testable at all.
   */
  window.__dshEndfieldTheme.buildSettings = function buildSettings() {
    ensureSettingsPanel()
    return doc.getElementById(SETTINGS_PANEL_ID) !== null
  }



  start()
})()
