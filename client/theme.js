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

  if (window.__dshEndfieldTheme) return
  window.__dshEndfieldTheme = { version: '1.0.0' }

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

  function ensureBackdrop() {
    var body = doc.body
    if (body === null) return
    var existing = doc.getElementById('ef-backdrop')
    if (existing !== null) {
      if (existing.parentNode !== body) body.appendChild(existing)
      return
    }
    // Appended LAST, not first: the layer is `position: fixed; z-index: -1`, so
    // document order does not decide what it paints behind, but being the first
    // child of <body> would hand it to anything keyed on `body > :first-child`.
    body.appendChild(buildBackdrop())
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
    try {
      var query = new URLSearchParams(window.location.search)
      if (query.get('dsh-endfield-brand') === '0') return false
    } catch (err) {
      /* an unparsable query string is not a reason to skip the branding */
    }
    return true
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
    try {
      var query = new URLSearchParams(window.location.search)
      if (query.get('dsh-endfield-splash') === '0') return false
    } catch (err) {
      /* an unparsable query string is not a reason to skip the splash */
    }
    return true
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

    function restore() {
      html.removeAttribute('data-ef-splash')
      pokeCaptionColors()
    }

    function remove() {
      if (el.parentNode !== null) el.parentNode.removeChild(el)
    }

    function finish() {
      if (finished) return
      finished = true
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

    return function dispose() {
      clearTimeout(doneTimer)
      clearTimeout(goneTimer)
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
    if (hasRows) html.setAttribute('data-ef-conversation', 'on')
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

  start()
})()
