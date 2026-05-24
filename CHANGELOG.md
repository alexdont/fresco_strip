# Changelog

All notable changes to FrescoStrip are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 0.1.0 — 2026-05-24

Initial release. Extracted from `fresco <= 0.5.9` where the same
component lived as `Fresco.scroll_strip`. Behavior is byte-for-byte
identical to the pre-extraction implementation — only the module
name and JS import path change.

### Why a separate package?

- Keep `fresco` lightweight for the common viewer / canvas consumer
  (lightboxes, paged readers, document viewers, lookbooks) who
  never needed the strip's memory-windowing / per-image-overlay
  machinery.
- Let strip mode iterate on its own release cadence — most strip-
  side changes don't touch viewer/canvas, and vice versa.
- Distinct mental models: viewer/canvas pan + zoom + rotate via CSS
  transforms; strip is a flat `<img>` list with native scroll.
  Two API surfaces, two changelogs.

### Migration from `fresco.scroll_strip`

```diff
 # mix.exs
 defp deps do
   [
-    {:fresco, "~> 0.5.9"}
+    {:fresco, "~> 0.6.0"},
+    {:fresco_strip, "~> 0.1.0"}
   ]
 end

 # assets/js/app.js
 import "../../deps/fresco/priv/static/fresco.js"
+import "../../deps/fresco_strip/priv/static/fresco_strip.js"

 # template
-<Fresco.scroll_strip id="reader" sources={@pages} extensions={@ext} />
+<FrescoStrip.viewer id="reader" sources={@pages} extensions={@ext} />
```

Three lines of consumer diff. Etcher (0.4.12+) detects the strip
handle at runtime — no code change needed there.

### Shared `window.Fresco` global

Both `fresco` and `fresco_strip` contribute handles to the same
`window.Fresco.viewerRegistry`. Peer libraries (Etcher annotations,
ML overlays, comment threads) call `window.Fresco.viewerFor(id)` /
`onReady(id, cb)` and get the right handle regardless of which
package mounted it. Order-independent — whichever package's JS
runs first creates the registry; the second piggy-backs.
