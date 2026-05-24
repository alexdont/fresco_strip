defmodule FrescoStrip do
  @moduledoc """
  Vertical-image-strip scroll companion to [Fresco](https://hex.pm/packages/fresco).

  Use `FrescoStrip.viewer/1` for content read by **scrolling continuously**
  through a stack of full-width images — manhwa, long-form web comics,
  IG-style feeds, documentation snapshots. For deep-zoom imagery or
  paged layouts, reach for `Fresco.viewer` / `Fresco.canvas` from the
  `fresco` package instead.

  ## Annotations out of the box

  [Etcher](https://hex.pm/packages/etcher) (>= 0.4.12) draws shapes
  on each page of a strip with the same UX surface as canvas mode —
  per-page SVG overlays, hit-testing scoped to the right page,
  hover tooltips, undo / redo, color picker, multi-select. Drop in
  `<Etcher.layer fresco_id="reader" />` alongside the strip and the
  annotation toolbar appears. Etcher detects the strip handle at
  runtime via `"scrollTo" in handle` — no per-package configuration.
  Shapes get an extra `image_idx` field identifying which page they
  live on; the `etcher:annotations-changed` payload round-trips
  through the strip's `:extensions` map (see "Attaching annotation
  tools" in `FrescoStrip.viewer`).

  ## Why a separate package?

  Strip mode used to ship inside `fresco` as `Fresco.scroll_strip`. It
  was extracted to keep `fresco` lightweight for the common
  viewer / canvas consumer (lightboxes, paged readers, document
  viewers, lookbooks) who never needed the strip's memory-windowing /
  per-image-overlay machinery. Two packages, two release cadences,
  two distinct API surfaces — share only the `window.Fresco`
  handle-registry contract so peer libraries (Etcher annotations,
  ML overlays, comment threads) can find any handle regardless of
  which package mounted it.

  ## Compatibility

  - Drop-in replacement for `Fresco.scroll_strip` from `fresco <= 0.5.9`
    (rename: `<Fresco.scroll_strip>` → `<FrescoStrip.viewer>`; component
    attributes + event surface + handle methods are unchanged).
  - Etcher 0.4.12+ supports `FrescoStrip.viewer` automatically — it
    detects the handle shape at runtime and routes through its
    existing strip-renderer.
  - Co-installable with `fresco` of any 0.5.x / 0.6.x version. Both
    packages contribute to the same `window.Fresco.viewerRegistry`
    global; whichever loads first creates the registry, the second
    piggy-backs.

  ## Quick start

      # mix.exs
      defp deps do
        [
          {:fresco, "~> 0.6.0"},
          {:fresco_strip, "~> 0.1.0"}
        ]
      end

      # assets/js/app.js
      import "../../deps/fresco/priv/static/fresco.js"
      import "../../deps/fresco_strip/priv/static/fresco_strip.js"

      # template
      <FrescoStrip.viewer
        id="reader"
        sources={[
          %{url: "/img/page-01.jpg", width: 720, height: 9200},
          %{url: "/img/page-02.jpg", width: 720, height: 8800}
        ]}
        class="w-full h-lvh"
      />

  See `FrescoStrip.viewer/1` for the full attribute list, handle API,
  and the extension contract for peer libraries.
  """

  # Convenience delegate so consumers can write `<FrescoStrip.viewer ...>`
  # without aliasing `FrescoStrip.Viewer` themselves. Mirrors the
  # `defdelegate viewer(assigns), to: Fresco.Viewer` pattern from the
  # `fresco` package.
  defdelegate viewer(assigns), to: FrescoStrip.Viewer
end
