# FrescoStrip

Vertical-image-strip scroll companion to [Fresco](https://hex.pm/packages/fresco).

For content that is **read by scrolling continuously** through a stack
of full-width images: manhwa, long-form web comics, IG-style feeds,
documentation snapshots. For deep-zoom imagery or paged layouts,
reach for `Fresco.viewer` / `Fresco.canvas` from the `fresco` package
instead.

This was `Fresco.scroll_strip` in `fresco <= 0.5.9` — extracted in
`fresco_strip 0.1.0` so the base `fresco` package stays lightweight
for the common viewer / canvas consumer, and so strip mode can
iterate on its own release cadence.

## Install

```elixir
def deps do
  [
    {:fresco, "~> 0.6.0"},
    {:fresco_strip, "~> 0.1.0"}
  ]
end
```

```js
// assets/js/app.js
import "../../deps/fresco/priv/static/fresco.js"          // optional
import "../../deps/fresco_strip/priv/static/fresco_strip.js"

const liveSocket = new LiveSocket("/live", Socket, {
  hooks: { ...window.FrescoHooks, ...window.LeafHooks /* etc */ }
})
```

Both packages contribute to a shared `window.Fresco` global, so peer
libraries like [Etcher](https://hex.pm/packages/etcher) (0.4.12+)
find handles via `window.Fresco.viewerFor(id)` regardless of which
package mounted them.

## Usage

```heex
<FrescoStrip.viewer
  id="reader"
  sources={[
    %{url: "/img/page-01.jpg", width: 720, height: 9200},
    %{url: "/img/page-02.jpg", width: 720, height: 8800}
  ]}
  class="w-full h-lvh"
/>
```

See `FrescoStrip.viewer/1` for the full attribute list (`:extensions`,
`:window_before` / `:window_after`, `:snap_to_image`, `:view_tracking`,
…) and the JS handle API (`scrollTo`, `getImages`, `getExtension`,
`enableViewTracking`, …).

## License

MIT. See `LICENSE` for details.
