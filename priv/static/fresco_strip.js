// fresco_strip.js — vertical-scroll strip companion to Fresco
//
// Self-contained. Co-installable with fresco of any 0.5.x / 0.6.x
// version. Both packages contribute to the same `window.Fresco`
// global so peer libraries (Etcher annotations, ML overlays,
// comment threads) can `window.Fresco.onReady(domId, cb)` regardless
// of which package mounted the handle.
//
// Hook is registered on `window.FrescoHooks.FrescoScrollStrip`. Wire
// it the same way fresco's hooks are wired:
//
//   import "../../deps/fresco/priv/static/fresco.js"       // optional
//   import "../../deps/fresco_strip/priv/static/fresco_strip.js"
//
//   hooks: { ...window.FrescoHooks, ...window.LeafHooks, ... }

(function() {
  if (window.FrescoStripLoaded) return;
  window.FrescoStripLoaded = true;

  // ===========================================================================
  // Shared `window.Fresco` registry contract
  //
  // Both `fresco` and `fresco_strip` contribute handles to the same
  // `window.Fresco.viewerRegistry` global so consumers and peer
  // libraries can locate any handle via `window.Fresco.viewerFor(id)`
  // or `window.Fresco.onReady(id, cb)` without caring which package
  // mounted it.
  //
  // The setup is idempotent: whichever package loads first creates
  // the global; the second piggy-backs onto the existing one. Every
  // mutation goes through the shared `viewerRegistry` /
  // `_readyCallbacks` objects, so there's no order dependency.
  // ===========================================================================

  window.Fresco = window.Fresco || {};
  window.Fresco.viewerRegistry = window.Fresco.viewerRegistry || {};
  window.Fresco._readyCallbacks = window.Fresco._readyCallbacks || {};
  window.FrescoHooks = window.FrescoHooks || {};

  if (typeof window.Fresco.viewerFor !== "function") {
    window.Fresco.viewerFor = function(domId) {
      return window.Fresco.viewerRegistry[domId] || null;
    };
  }
  if (typeof window.Fresco.scrollStripFor !== "function") {
    // Back-compat alias for code written against fresco <= 0.5.9
    // that called `scrollStripFor` instead of `viewerFor`. Both
    // resolved to the same registry; preserved here for the same
    // reason.
    window.Fresco.scrollStripFor = function(domId) {
      return window.Fresco.viewerRegistry[domId] || null;
    };
  }
  if (typeof window.Fresco.onViewerReady !== "function") {
    window.Fresco.onViewerReady = function(domId, callback) {
      var handle = window.Fresco.viewerRegistry[domId];
      if (handle) { callback(handle); return; }
      var q = window.Fresco._readyCallbacks;
      q[domId] = q[domId] || [];
      q[domId].push(callback);
    };
  }
  if (typeof window.Fresco.onReady !== "function") {
    window.Fresco.onReady = function(domId, callback) {
      return window.Fresco.onViewerReady(domId, callback);
    };
  }

  function publishReady(domId, handle) {
    window.Fresco.viewerRegistry[domId] = handle;
    var q = window.Fresco._readyCallbacks;
    var cbs = q[domId] || [];
    delete q[domId];
    cbs.forEach(function(cb) { cb(handle); });
  }

  function unpublish(domId) {
    delete window.Fresco.viewerRegistry[domId];
  }

  // ===========================================================================
  // Slim shared utilities — duplicated from fresco.js (~120 lines combined)
  // intentionally to keep this package zero-dep on fresco. Drift mitigation:
  // touch in lockstep when the upstream version changes. The duplicated
  // surfaces are stable (event-bus shape, nav-button API, view-tracker
  // contract) — they haven't changed since 0.5.0.
  // ===========================================================================

  function makeButton(svg, title, onClick) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.title = title;
    btn.setAttribute("aria-label", title);
    btn.innerHTML = svg;
    btn.addEventListener("click", function(e) {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    });
    return btn;
  }

  function attachNavButton(navEl, svg, title, onClick) {
    if (!navEl) return function noop() {};
    var btn = makeButton(svg, title, onClick);
    navEl.appendChild(btn);
    var remove = function removeButton() {
      if (btn.parentNode === navEl) navEl.removeChild(btn);
    };
    remove.setIcon = function(nextSvg) { btn.innerHTML = nextSvg; };
    remove.setTitle = function(nextTitle) {
      btn.title = nextTitle;
      btn.setAttribute("aria-label", nextTitle);
    };
    remove.el = btn;
    return remove;
  }

  function createEventBus() {
    var subscribers = {};
    return {
      on: function(eventName, handler) {
        subscribers[eventName] = subscribers[eventName] || [];
        subscribers[eventName].push(handler);
        return function unsubscribe() {
          var arr = subscribers[eventName] || [];
          var idx = arr.indexOf(handler);
          if (idx !== -1) arr.splice(idx, 1);
        };
      },
      _emit: function(eventName, payload) {
        var arr = subscribers[eventName] || [];
        for (var i = 0; i < arr.length; i++) {
          try { arr[i](payload); } catch (_) {}
        }
      }
    };
  }

  // View tracker — emits "view-focus" / "view-blur" events on the bus when
  // the dominant image changes (or visibility flips). The host supplies
  // `getDominantImageId() → string | null` and calls `tick()` when the
  // viewport changes; the tracker handles the settleMs gate, the focused-
  // state machine, the Page Visibility pause, and the event emits.
  //
  // Default off — callers explicitly invoke `enable(opts)` to start. Until
  // then the helper sits idle and emits nothing.
  function createViewTracker(opts) {
    var bus = opts.bus;
    var getDominantImageId = opts.getDominantImageId;
    var settleMs = (typeof opts.defaultSettleMs === "number") ? opts.defaultSettleMs : 150;
    var threshold = (typeof opts.defaultThreshold === "number") ? opts.defaultThreshold : 0.5;

    var enabled = false;
    var focusedImageId = null;
    var focusedAtMs = 0;
    var candidateImageId = null;
    var candidateSince = 0;
    var settleTimerId = null;
    var visibilityListener = null;

    function nowMs() {
      return (typeof performance !== "undefined" && performance.now)
        ? performance.now() : Date.now();
    }

    function clearSettleTimer() {
      if (settleTimerId) {
        try { clearTimeout(settleTimerId); } catch (_) {}
        settleTimerId = null;
      }
    }

    function commitChange(newId, reason) {
      var prev = focusedImageId;
      var prevAtMs = focusedAtMs;
      if (prev !== null && prev !== newId) {
        bus._emit("view-blur", {
          imageId: prev,
          durationMs: Math.max(0, nowMs() - prevAtMs),
          atMs: nowMs(),
          reason: reason || "viewport-change"
        });
      }
      if (newId !== null && newId !== prev) {
        focusedImageId = newId;
        focusedAtMs = nowMs();
        bus._emit("view-focus", {
          imageId: newId,
          previousImageId: prev,
          atMs: nowMs()
        });
      } else if (newId === null) {
        focusedImageId = null;
        focusedAtMs = 0;
      }
    }

    function tick() {
      if (!enabled) return;
      if (typeof document !== "undefined" && document.hidden) return;
      var dominant = null;
      try { dominant = getDominantImageId(threshold); } catch (_) {}
      if (dominant === candidateImageId) return;
      candidateImageId = dominant;
      candidateSince = nowMs();
      clearSettleTimer();
      if (dominant !== focusedImageId) {
        settleTimerId = setTimeout(function() {
          settleTimerId = null;
          if (enabled &&
              candidateImageId === dominant &&
              dominant !== focusedImageId) {
            commitChange(dominant, "viewport-change");
          }
        }, settleMs);
      }
    }

    function onVisibilityChange() {
      if (!enabled) return;
      if (typeof document !== "undefined" && document.hidden) {
        if (focusedImageId !== null) {
          commitChange(null, "page-hidden");
        }
        clearSettleTimer();
        candidateImageId = null;
        candidateSince = 0;
      } else {
        tick();
      }
    }

    function enable(o) {
      if (o && typeof o.settleMs === "number") settleMs = o.settleMs;
      if (o && typeof o.threshold === "number") threshold = o.threshold;
      if (enabled) { tick(); return; }
      enabled = true;
      if (typeof document !== "undefined" && document.addEventListener) {
        visibilityListener = onVisibilityChange;
        document.addEventListener("visibilitychange", visibilityListener);
      }
      tick();
    }

    function disable(reason) {
      if (!enabled) return;
      if (focusedImageId !== null) {
        commitChange(null, reason || "disabled");
      }
      enabled = false;
      clearSettleTimer();
      candidateImageId = null;
      candidateSince = 0;
      if (visibilityListener && typeof document !== "undefined") {
        try {
          document.removeEventListener("visibilitychange", visibilityListener);
        } catch (_) {}
      }
      visibilityListener = null;
    }

    function getFocused() {
      if (!enabled || focusedImageId === null) return null;
      return {
        imageId: focusedImageId,
        durationSoFarMs: nowMs() - focusedAtMs,
        atMs: focusedAtMs
      };
    }

    return {
      enable: enable,
      disable: disable,
      tick: tick,
      getFocused: getFocused,
      isEnabled: function() { return enabled; }
    };
  }

  // ===========================================================================
  // Strip CSS — injected once on first hook mount. Uses the same
  // `--fresco-*` custom-property palette as fresco's viewer/canvas
  // styles so a consumer styling both gets a consistent look.
  // ===========================================================================

  var stripStylesInjected = false;
  function injectStripStyles() {
    if (stripStylesInjected) return;
    stripStylesInjected = true;
    var css = [
      ".fresco-strip:not([data-fresco-theme=\"inherit\"]) {",
      "  --fresco-bg: #fafafa;",
      "  --fresco-nav-bg: rgba(0, 0, 0, 0.55);",
      "  --fresco-nav-bg-hover: rgba(0, 0, 0, 0.78);",
      "  --fresco-nav-fg: #fff;",
      "  --fresco-nav-focus: rgba(255, 255, 255, 0.7);",
      "}",
      ".fresco-strip {",
      "  background-color: var(--fresco-bg);",
      "  -webkit-overflow-scrolling: touch;",
      "  scrollbar-width: thin;",
      "}",
      ".fresco-strip.fresco-strip--snap-mandatory {",
      "  scroll-snap-type: y mandatory;",
      "}",
      ".fresco-strip.fresco-strip--snap-mandatory > img {",
      "  scroll-snap-align: start;",
      "}",
      ".fresco-strip.fresco-strip--snap-proximity {",
      "  scroll-snap-type: y proximity;",
      "}",
      ".fresco-strip.fresco-strip--snap-proximity > img {",
      "  scroll-snap-align: start;",
      "}",
      "@media (prefers-color-scheme: dark) {",
      "  .fresco-strip:not([data-fresco-theme=\"light\"]):not([data-fresco-theme=\"inherit\"]) {",
      "    --fresco-bg: #0a0a0a;",
      "    --fresco-nav-bg: rgba(255, 255, 255, 0.12);",
      "    --fresco-nav-bg-hover: rgba(255, 255, 255, 0.20);",
      "    --fresco-nav-fg: #fff;",
      "    --fresco-nav-focus: rgba(255, 255, 255, 0.7);",
      "  }",
      "}",
      ".fresco-strip[data-fresco-theme=\"dark\"] {",
      "  --fresco-bg: #0a0a0a;",
      "  --fresco-nav-bg: rgba(255, 255, 255, 0.12);",
      "  --fresco-nav-bg-hover: rgba(255, 255, 255, 0.20);",
      "  --fresco-nav-fg: #fff;",
      "  --fresco-nav-focus: rgba(255, 255, 255, 0.7);",
      "}",
      ".fresco-strip[data-fresco-theme=\"light\"] {",
      "  --fresco-bg: #fafafa;",
      "  --fresco-nav-bg: rgba(0, 0, 0, 0.55);",
      "  --fresco-nav-bg-hover: rgba(0, 0, 0, 0.78);",
      "  --fresco-nav-fg: #fff;",
      "  --fresco-nav-focus: rgba(255, 255, 255, 0.7);",
      "}"
    ].join("\n");
    var style = document.createElement("style");
    style.setAttribute("data-fresco-strip", "");
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ===========================================================================
  // Strip handle factory
  //
  // The strip handle shares only the small surface ({on, _emit,
  // appendNavButton}) with viewer/canvas; the rest is strip-native:
  //
  //   handle.scrollTo({imageIdx, y, behavior})  — replaces panTo
  //   handle.scrollBy({dy, behavior})           — replaces panBy
  //   handle.imageToScreen({imageIdx, x, y})    — coords are per-image
  //   handle.screenToImage({x, y}) → {imageIdx, x, y}
  //   handle.getScrollState()                   — strip equivalent of bounds
  // ===========================================================================

  function makeStripHandle(container, sources, opts) {
    opts = opts || {};
    var navEl = opts.navEl || null;

    var bus = createEventBus();

    function imgAt(idx) {
      if (!container) return null;
      return container.querySelector(
        '[data-fresco-strip-img][data-image-idx="' + idx + '"]'
      );
    }

    function scrollTopFor(idx, y) {
      var img = imgAt(idx);
      if (!img) return null;
      var rect = img.getBoundingClientRect();
      var cRect = container.getBoundingClientRect();
      return container.scrollTop + (rect.top - cRect.top) + (y || 0);
    }

    function scrollTo(payload) {
      payload = payload || {};
      var behavior = payload.behavior === "smooth" ? "smooth" : "instant";
      var idx = typeof payload.imageIdx === "number" ? payload.imageIdx : 0;
      var y = typeof payload.y === "number" ? payload.y : 0;
      var top = scrollTopFor(idx, y);
      if (top == null) return;
      try {
        container.scrollTo({ top: top, behavior: behavior });
      } catch (_) {
        container.scrollTop = top;
      }
    }

    // Scroll the strip so a specific point on a specific image,
    // expressed in that image's source-pixel coordinate system,
    // sits at the chosen viewport alignment. This is the high-
    // level companion to `scrollTo({imageIdx, y})`, which takes a
    // pre-translated display-pixel offset and forces callers to
    // do the source-px -> render-px math themselves.
    //
    // Consumers that already hold source-pixel coords (Etcher's
    // `shape.geometry`, ML detection boxes, server-side annotation
    // payloads) can call this directly without owning the rendered
    // height of each image. The handle owns the imageEl + sources
    // map, so the conversion stays in one place.
    //
    // Options:
    //   imageIdx: <number>           required
    //   srcX:     <source-px number> optional, currently unused — kept
    //                                for forward compat (horizontal
    //                                scroll mode); strip is vertical
    //                                so X is ignored today.
    //   srcY:     <source-px number> required
    //   align:    "center" | "top" | "bottom"   default "center"
    //   behavior: "smooth" | "instant"          default "smooth"
    function scrollToImagePoint(payload) {
      payload = payload || {};
      var idx = typeof payload.imageIdx === "number" ? payload.imageIdx : 0;
      var srcY = typeof payload.srcY === "number" ? payload.srcY : 0;
      var align = (payload.align === "top" || payload.align === "bottom") ?
        payload.align : "center";
      var behavior = payload.behavior === "instant" ? "instant" : "smooth";
      var img = imgAt(idx);
      if (!img) return;
      var src = sources[idx] || {};
      var srcH = src.height || img.naturalHeight || 0;
      var renderedH = img.offsetHeight || 0;
      var scale = srcH > 0 ? renderedH / srcH : 1;
      var displayY = srcY * scale;
      var viewportH = container ? container.clientHeight : 0;
      var yOffset;
      if (align === "top") {
        yOffset = displayY;
      } else if (align === "bottom") {
        yOffset = displayY - viewportH;
      } else {
        yOffset = displayY - viewportH / 2;
      }
      if (yOffset < 0) yOffset = 0;
      scrollTo({ imageIdx: idx, y: yOffset, behavior: behavior });
    }

    function scrollBy(payload) {
      payload = payload || {};
      var dy = typeof payload.dy === "number" ? payload.dy : 0;
      var behavior = payload.behavior === "smooth" ? "smooth" : "instant";
      try {
        container.scrollBy({ top: dy, behavior: behavior });
      } catch (_) {
        container.scrollTop = container.scrollTop + dy;
      }
    }

    // Resolve a page's source-pixel width for scale calculations.
    // Order: explicit `sources[idx].width` (mount-time data-sources or
    // runtime `appendSources`), then `img.naturalWidth` (available once
    // the bitmap has loaded), then the rendered width (scale = 1, last
    // resort — coords will be wrong but the helper won't throw). The
    // naturalWidth fallback covers the gap where a consumer has
    // appended `<img>`s to the container but hasn't called
    // `appendSources` yet, or shipped specs with missing dimensions.
    function srcWidthFor(idx, img, rect) {
      if (sources[idx] && sources[idx].width) return sources[idx].width;
      if (img && img.naturalWidth) return img.naturalWidth;
      return rect.width;
    }

    function imageToScreen(pt) {
      pt = pt || {};
      var idx = typeof pt.imageIdx === "number" ? pt.imageIdx : 0;
      var img = imgAt(idx);
      if (!img) return { x: 0, y: 0 };
      var rect = img.getBoundingClientRect();
      var srcW = srcWidthFor(idx, img, rect);
      var scale = rect.width / srcW;
      return {
        x: rect.left + (pt.x || 0) * scale,
        y: rect.top + (pt.y || 0) * scale
      };
    }

    function screenToImage(pt) {
      pt = pt || {};
      var px = typeof pt.x === "number" ? pt.x : 0;
      var py = typeof pt.y === "number" ? pt.y : 0;
      // DOM-driven iteration so taps on pages appended after mount —
      // multi-chapter infinite-scroll readers — route to the correct
      // image. Bounding `for (i < sources.length)` (the previous form)
      // stopped before appended pages and dropped their taps onto the
      // last original page at (0, 0).
      var imgs = container
        ? container.querySelectorAll("[data-fresco-strip-img]")
        : [];
      var lastIdx = -1;
      for (var n = 0; n < imgs.length; n++) {
        var img = imgs[n];
        var i = parseInt(img.dataset.imageIdx, 10);
        if (isNaN(i)) continue;
        if (i > lastIdx) lastIdx = i;
        var rect = img.getBoundingClientRect();
        if (py >= rect.top && py <= rect.bottom) {
          var srcW = srcWidthFor(i, img, rect);
          var scale = srcW / rect.width;
          return {
            imageIdx: i,
            x: (px - rect.left) * scale,
            y: (py - rect.top) * scale
          };
        }
      }
      // Above the first page → snap to idx 0; below the last → snap to
      // the highest idx we saw in the DOM (which now includes appended
      // pages), falling back to the captured sources length when the
      // container is empty.
      if (py < 0) return { imageIdx: 0, x: 0, y: 0 };
      return {
        imageIdx: lastIdx >= 0 ? lastIdx : Math.max(0, sources.length - 1),
        x: 0,
        y: 0
      };
    }

    function getScrollState() {
      var state = opts.getState ? opts.getState() : {};
      return {
        scrollTop: container ? container.scrollTop : 0,
        scrollHeight: container ? container.scrollHeight : 0,
        viewportH: container ? container.clientHeight : 0,
        currentImageIdx: state.currentImageIdx || 0,
        fractionWithin: state.fractionWithin || 0
      };
    }

    function getExtension(name) {
      if (!container) return undefined;
      var raw = container.dataset.extensions;
      if (!raw) return undefined;
      try {
        var parsed = JSON.parse(raw);
        return parsed && parsed[name];
      } catch (_) { return undefined; }
    }

    // Extend the internal `sources` array at runtime — multi-chapter
    // infinite-scroll readers fetching the next chapter's images on
    // demand. Sequential append: the Nth spec lands at index
    // `sources.length` (before the push), matching the natural pattern
    // of consumers appending `<img data-image-idx="…">` elements to
    // the container.
    //
    // Specs are `{ url, width, height }` — same shape the `:sources`
    // attr / `data-sources` JSON ship at mount. `width`/`height` are
    // in source-pixel space (used for screenToImage / imageToScreen
    // scale before the bitmap has loaded). Missing dimensions are
    // tolerated — the coord helpers fall back to `img.naturalWidth`
    // once the appended `<img>` finishes loading.
    //
    // Emits `sources-changed` so the host hook can pick up the new
    // imgs in its memory-windowing / load-listener bookkeeping. Pairs
    // with `etcher 0.5.3`'s `layer.refreshPages()` — consumer flow is:
    //   1. fetch chapter N+1 specs from server
    //   2. append `<img data-image-idx="…">` elements to the container
    //   3. `handle.appendSources(specs)` so coord helpers + windowing
    //      know about the new pages
    //   4. `layer.refreshPages()` so Etcher builds overlays for them
    function appendSources(specs) {
      if (!Array.isArray(specs)) {
        if (typeof console !== "undefined" && console.warn) {
          console.warn(
            "[FrescoStrip] appendSources: expected an array of " +
            "`{url, width, height}` specs, got",
            specs
          );
        }
        return;
      }
      var added = 0;
      for (var i = 0; i < specs.length; i++) {
        var s = specs[i];
        if (!s || typeof s !== "object") continue;
        sources.push({
          url: typeof s.url === "string" ? s.url : "",
          width: typeof s.width === "number" ? s.width : 0,
          height: typeof s.height === "number" ? s.height : 0
        });
        added++;
      }
      if (added > 0) {
        bus._emit("sources-changed", { count: sources.length, added: added });
      }
    }

    function getImages() {
      if (!container) return [];
      var imgs = container.querySelectorAll("[data-fresco-strip-img]");
      var out = [];
      for (var i = 0; i < imgs.length; i++) {
        var img = imgs[i];
        var idx = parseInt(img.dataset.imageIdx, 10);
        if (isNaN(idx)) idx = i;
        var src = sources[idx] || {};
        var natW = img.naturalWidth || src.width || 0;
        var natH = img.naturalHeight || src.height || 0;
        out.push({
          idx: idx,
          url: src.url || img.getAttribute("src") || img.dataset.src || "",
          naturalWidth: natW,
          naturalHeight: natH,
          top: img.offsetTop,
          left: img.offsetLeft,
          width: img.offsetWidth,
          height: img.offsetHeight,
          element: img
        });
      }
      return out;
    }

    var handle = {
      container: container,

      scrollTo: scrollTo,
      scrollToImagePoint: scrollToImagePoint,
      scrollBy: scrollBy,
      imageToScreen: imageToScreen,
      screenToImage: screenToImage,
      getScrollState: getScrollState,
      getExtension: getExtension,
      getImages: getImages,
      appendSources: appendSources,

      // Strip is vertical-scroll-only by design — rotating it would
      // break the reader UX — so these are documented no-ops that
      // warn loudly enough to catch a wrong-handle bug in development
      // without crashing the page. Mirrors the parity-shim from
      // fresco 0.5.7+.
      setRotation: function() {
        if (typeof console !== "undefined" && console.warn) {
          console.warn(
            "[FrescoStrip] setRotation is not supported on <FrescoStrip.viewer>; " +
            "strip mode is vertical-only. Use <Fresco.canvas> / <Fresco.viewer> for rotated content."
          );
        }
      },
      getRotation: function() { return 0; },
      rotateBy: function() {
        if (typeof console !== "undefined" && console.warn) {
          console.warn(
            "[FrescoStrip] rotateBy is not supported on <FrescoStrip.viewer>."
          );
        }
      },

      on: bus.on,
      _emit: bus._emit,

      appendNavButton: function(svg, title, onClick) {
        return attachNavButton(navEl, svg, title, onClick);
      }
    };

    // Throwing getter: anything that pokes `handle.openSeadragon` on a strip
    // handle is almost certainly an overlay written against pre-0.5.x.
    Object.defineProperty(handle, "openSeadragon", {
      get: function() {
        throw new Error(
          "[FrescoStrip] handle.openSeadragon is gone — Fresco has not wrapped " +
          "OpenSeadragon since 0.5.x. Update overlays to use coordinate adapters " +
          "(`handle.imageToScreen`/`handle.screenToImage`) and event hooks " +
          "(`handle.on(\"scroll\"|\"viewport-change\"|\"image-loaded\", …)`)."
        );
      },
      configurable: false
    });

    return handle;
  }

  // ===========================================================================
  // FrescoScrollStrip LiveView hook
  // ===========================================================================

  window.FrescoHooks.FrescoScrollStrip = {
    mounted: function() {
      injectStripStyles();

      var self = this;
      var container = self.el;
      if (!container) return;

      var sourcesJson = container.dataset.sources;
      var sources;
      try {
        sources = JSON.parse(sourcesJson);
        if (!Array.isArray(sources) || sources.length === 0) throw new Error("empty");
      } catch (_) {
        console.warn(
          "[FrescoStrip] FrescoScrollStrip mount: data-sources missing or malformed",
          container
        );
        return;
      }

      var windowBefore = parseInt(container.dataset.windowBefore || "1", 10);
      var windowAfter = parseInt(container.dataset.windowAfter || "3", 10);

      var state = { currentImageIdx: 0, fractionWithin: 0 };

      var handle = makeStripHandle(container, sources, {
        navEl: null,
        getState: function() { return state; }
      });
      self.handle = handle;
      self.sources = sources;

      // ---- Memory windowing -------------------------------------------------

      var allImgs = Array.from(
        container.querySelectorAll("[data-fresco-strip-img]")
      );

      function evictOutsideWindow(centerIdx) {
        var lo = Math.max(0, centerIdx - windowBefore);
        var hi = Math.min(sources.length - 1, centerIdx + windowAfter);
        for (var i = 0; i < allImgs.length; i++) {
          var img = allImgs[i];
          var idx = parseInt(img.dataset.imageIdx, 10);
          if (idx >= lo && idx <= hi) {
            if (!img.src && img.dataset.src) {
              img.src = img.dataset.src;
            }
          } else {
            if (img.src) {
              if (!img.dataset.src) img.dataset.src = img.src;
              img.removeAttribute("src");
              handle._emit("image-evicted", { imageIdx: idx });
            }
          }
        }
      }

      function onImgLoad(e) {
        var img = e.target;
        if (!img || !img.dataset) return;
        var idx = parseInt(img.dataset.imageIdx, 10);
        if (!isNaN(idx)) handle._emit("image-loaded", { imageIdx: idx });
      }
      allImgs.forEach(function(img) {
        img.addEventListener("load", onImgLoad);
      });

      // Track which `<img>`s already carry a `load` listener so a
      // `sources-changed` re-scan can be cheap and idempotent.
      var trackedImgs = new WeakSet ? new WeakSet() : null;
      if (trackedImgs) {
        allImgs.forEach(function(img) { trackedImgs.add(img); });
      }

      // When the consumer extends the source set via
      // `handle.appendSources(...)`, the imgs they appended to the
      // container start invisible to memory-windowing, dominant-image
      // tracking, and the `image-loaded` re-emit — `allImgs` was a
      // mount-time snapshot. Re-scan the DOM and pick up the new ones
      // here. Imgs already complete by the time we attach the listener
      // (cached, or src set before the append) get a synthetic
      // `image-loaded` so Etcher's overlay viewBox snaps to the
      // correct natural dimensions immediately.
      handle.on("sources-changed", function() {
        if (!container) return;
        var current = container.querySelectorAll("[data-fresco-strip-img]");
        for (var i = 0; i < current.length; i++) {
          var img = current[i];
          if (trackedImgs && trackedImgs.has(img)) continue;
          if (!trackedImgs && allImgs.indexOf(img) !== -1) continue;
          allImgs.push(img);
          if (trackedImgs) trackedImgs.add(img);
          img.addEventListener("load", onImgLoad);
          if (img.complete && img.naturalWidth > 0) {
            var idx = parseInt(img.dataset.imageIdx, 10);
            if (!isNaN(idx)) handle._emit("image-loaded", { imageIdx: idx });
          }
        }
      });

      // ---- Scroll bridge ----------------------------------------------------

      var pendingScroll = false;

      function computeDominantImage() {
        var cTop = container.scrollTop;
        var cMid = cTop + container.clientHeight / 2;
        var bestIdx = state.currentImageIdx;
        var bestDist = Infinity;
        for (var i = 0; i < allImgs.length; i++) {
          var img = allImgs[i];
          var idx = parseInt(img.dataset.imageIdx, 10);
          var top = img.offsetTop;
          var mid = top + img.offsetHeight / 2;
          var dist = Math.abs(mid - cMid);
          if (dist < bestDist) {
            bestDist = dist;
            bestIdx = idx;
          }
        }
        var dominantImg = allImgs.find(function(img) {
          return parseInt(img.dataset.imageIdx, 10) === bestIdx;
        });
        var frac = 0;
        if (dominantImg && dominantImg.offsetHeight > 0) {
          frac = (cTop - dominantImg.offsetTop) / dominantImg.offsetHeight;
          if (frac < 0) frac = 0;
          if (frac > 1) frac = 1;
        }
        return { currentImageIdx: bestIdx, fractionWithin: frac };
      }

      function onScrollTick() {
        pendingScroll = false;
        handle._emit("scroll", {
          scrollTop: container.scrollTop,
          scrollHeight: container.scrollHeight
        });
        var next = computeDominantImage();
        if (next.currentImageIdx !== state.currentImageIdx) {
          state.currentImageIdx = next.currentImageIdx;
          state.fractionWithin = next.fractionWithin;
          handle._emit("viewport-change", {
            currentImageIdx: state.currentImageIdx,
            fractionWithin: state.fractionWithin
          });
          evictOutsideWindow(state.currentImageIdx);
        } else {
          state.fractionWithin = next.fractionWithin;
        }
      }

      self._onScroll = function() {
        if (pendingScroll) return;
        pendingScroll = true;
        window.requestAnimationFrame(onScrollTick);
      };
      container.addEventListener("scroll", self._onScroll, { passive: true });

      // ---- Server-pushed scroll --------------------------------------------

      self._onServerScroll = function(payload) {
        handle.scrollTo(payload || {});
      };
      if (typeof self.handleEvent === "function") {
        self.handleEvent("phx:scroll-to", self._onServerScroll);
      }

      // ---- View tracker -----------------------------------------------------

      var stripViewTracker = createViewTracker({
        bus: handle,
        getDominantImageId: function() {
          return state.currentImageIdx == null ? null : String(state.currentImageIdx);
        }
      });
      self.viewTracker = stripViewTracker;

      handle.on("viewport-change", function() {
        if (stripViewTracker.isEnabled()) stripViewTracker.tick();
      });

      handle.enableViewTracking  = function(o) { stripViewTracker.enable(o || {}); };
      handle.disableViewTracking = function() { stripViewTracker.disable("disabled"); };
      handle.getFocusedImage     = function() { return stripViewTracker.getFocused(); };

      // ---- Mount sequencing -------------------------------------------------

      var initial = computeDominantImage();
      state.currentImageIdx = initial.currentImageIdx;
      state.fractionWithin = initial.fractionWithin;
      evictOutsideWindow(state.currentImageIdx);

      publishReady(container.id, handle);

      handle._emit("viewport-change", {
        currentImageIdx: state.currentImageIdx,
        fractionWithin: state.fractionWithin
      });
      handle._emit("open", { sources: sources });

      if (container.dataset.viewTracking === "true") {
        var stripOpts = {};
        var sm = parseInt(container.dataset.viewSettleMs || "", 10);
        if (!isNaN(sm) && sm >= 0) stripOpts.settleMs = sm;
        stripViewTracker.enable(stripOpts);
      }
    },

    updated: function() {
      // Sources are immutable after mount. Consumers who need to swap should
      // change the component's `:id` to trigger a remount.
    },

    destroyed: function() {
      if (this.el && this.el.id) unpublish(this.el.id);
      if (this._onScroll && this.el) {
        this.el.removeEventListener("scroll", this._onScroll);
        this._onScroll = null;
      }
      if (this.viewTracker && this.viewTracker.isEnabled()) {
        this.viewTracker.disable("destroyed");
      }
      this.viewTracker = null;
      this.handle = null;
      this.sources = null;
    }
  };
})();
