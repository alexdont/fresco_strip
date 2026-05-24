# FrescoStrip

Vertical-image-strip scroll companion to [Fresco](https://hex.pm/packages/fresco).

For content that is **read by scrolling continuously** through a stack
of full-width images: manhwa, long-form web comics, IG-style feeds,
documentation snapshots. For deep-zoom imagery or paged layouts,
reach for `Fresco.viewer` / `Fresco.canvas` from the `fresco` package
instead.

**Annotation-ready.** [Etcher](https://hex.pm/packages/etcher)
(>= 0.4.12) draws shapes on each page of a strip out of the box —
per-page SVG overlays, hit-testing scoped to the right page, hover
tooltips, undo / redo, color picker, all the same affordances as
on `<Fresco.canvas>`. Drop in `<Etcher.layer fresco_id="reader" />`
alongside the strip and the annotation toolbar appears. See the
["Attaching annotation tools"](#) section in `FrescoStrip.viewer`
moduledoc for the persistence flow.

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

## Annotations (Etcher)

[Etcher](https://hex.pm/packages/etcher) (>= 0.4.12) detects strip
handles at runtime and renders one SVG overlay per page. The
annotation flow is identical to canvas mode — shapes get an
`image_idx` field identifying which page they live on, and
`etcher:annotations-changed` round-trips through the strip's
`:extensions` map.

```elixir
def mount(_params, _session, socket) do
  sources    = ... # %{url, width, height} list from your storage
  extensions = %{} # or hydrate %{"etcher" => %{"version" => "1", ...}}
  {:ok, assign(socket, sources: sources, extensions: extensions)}
end

def handle_event(
      "etcher:annotations-changed",
      %{"annotations" => annotations},
      socket
    ) do
  new_extensions =
    Map.put(socket.assigns.extensions, "etcher", %{
      "version" => "1",
      "annotations" => annotations
    })

  {:noreply, assign(socket, extensions: new_extensions)}
end
```

```heex
<FrescoStrip.viewer id="reader" sources={@sources} extensions={@extensions} class="w-full h-lvh" />
<Etcher.layer fresco_id="reader" />
```

Add `{:etcher, "~> 0.4.12"}` to your deps; everything else (Etcher's
toolbar, color picker, undo/redo, touch handling, per-page hit-test)
just works. The persisted shape format is the same as canvas-mode
Etcher payloads with one extra `image_idx` field per shape — a
consumer that already handles `etcher:annotations-changed` for
canvas can reuse the exact handler.

## License

MIT. See `LICENSE` for details.
