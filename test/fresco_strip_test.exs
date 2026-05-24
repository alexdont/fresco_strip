defmodule FrescoStripTest do
  use ExUnit.Case, async: true
  import Phoenix.LiveViewTest

  describe "FrescoStrip.viewer/1" do
    @one_src [%{url: "/img/p1.jpg", width: 720, height: 9000}]

    test "renders one <img> per source inside the strip container" do
      html =
        render_component(&FrescoStrip.viewer/1,
          id: "test-strip",
          sources: [
            %{url: "/img/p1.jpg", width: 720, height: 9000},
            %{url: "/img/p2.jpg", width: 720, height: 8500}
          ]
        )

      assert html =~ ~s(id="test-strip")
      assert html =~ ~s(phx-hook="FrescoScrollStrip")
      assert html =~ ~s(src="/img/p1.jpg")
      assert html =~ ~s(src="/img/p2.jpg")
      # data-image-idx threaded so the JS hook can hit-test + scroll-to.
      assert html =~ ~s(data-image-idx="0")
      assert html =~ ~s(data-image-idx="1")
    end

    test "inlines aspect-ratio per source so eviction doesn't collapse the slot" do
      html = render_component(&FrescoStrip.viewer/1, id: "s", sources: @one_src)
      # Critical: aspect-ratio in inline style prevents layout shift when
      # the JS hook removes src to evict the image (memory windowing).
      assert html =~ "aspect-ratio: 720 / 9000"
    end

    test "loading=lazy + decoding=async on every <img> for cheap mount" do
      html = render_component(&FrescoStrip.viewer/1, id: "s", sources: @one_src)
      assert html =~ ~s(loading="lazy")
      assert html =~ ~s(decoding="async")
    end

    test "window_before / window_after defaults plumbed to data attrs" do
      html = render_component(&FrescoStrip.viewer/1, id: "s", sources: @one_src)
      assert html =~ ~s(data-window-before="1")
      assert html =~ ~s(data-window-after="3")
    end

    test "snap_to_image=:off (default) emits no scroll-snap modifier class" do
      html = render_component(&FrescoStrip.viewer/1, id: "s", sources: @one_src)
      refute html =~ "fresco-strip--snap-mandatory"
      refute html =~ "fresco-strip--snap-proximity"
      assert html =~ ~s(data-snap="off")
    end

    test "snap_to_image=:mandatory adds the mandatory modifier class" do
      html =
        render_component(&FrescoStrip.viewer/1,
          id: "s",
          sources: @one_src,
          snap_to_image: :mandatory
        )

      assert html =~ "fresco-strip--snap-mandatory"
      assert html =~ ~s(data-snap="mandatory")
    end

    test "gap_px > 0 emits margin-bottom between images (except the last)" do
      html =
        render_component(&FrescoStrip.viewer/1,
          id: "s",
          sources: [
            %{url: "/img/p1.jpg", width: 720, height: 9000},
            %{url: "/img/p2.jpg", width: 720, height: 9000}
          ],
          gap_px: 16
        )

      assert html =~ "margin-bottom: 16px"
      assert html =~ ~s(data-gap-px="16")
    end

    test "sources are JSON-encoded onto data-sources for client-side use" do
      html = render_component(&FrescoStrip.viewer/1, id: "s", sources: @one_src)
      assert html =~ ~s(data-sources=)
      assert html =~ ~s(/img/p1.jpg)
    end

    test "extensions defaults to %{} → data-extensions attr is omitted" do
      html = render_component(&FrescoStrip.viewer/1, id: "s", sources: @one_src)
      refute html =~ "data-extensions"
    end

    test "extensions renders JSON-encoded data-extensions on the host" do
      html =
        render_component(&FrescoStrip.viewer/1,
          id: "s",
          sources: @one_src,
          extensions: %{
            "etcher" => %{
              "version" => "1",
              "annotations" => [%{"uuid" => "01HXY", "image_idx" => 0}]
            }
          }
        )

      assert html =~ "data-extensions="
      assert html =~ "etcher"
      assert html =~ "annotations"
      assert html =~ "01HXY"
    end

    test "multiple extension keys round-trip through data-extensions" do
      html =
        render_component(&FrescoStrip.viewer/1,
          id: "s",
          sources: @one_src,
          extensions: %{
            "etcher" => %{"annotations" => []},
            "ml-overlay" => %{"regions" => []}
          }
        )

      assert html =~ "etcher"
      assert html =~ "ml-overlay"
    end

    test "raises ArgumentError on empty :sources" do
      assert_raise ArgumentError, ~r/non-empty :sources/, fn ->
        render_component(&FrescoStrip.viewer/1, id: "s", sources: [])
      end
    end

    test "raises ArgumentError when a source is missing :width" do
      assert_raise ArgumentError, ~r/require :url \(string\), :width/, fn ->
        render_component(&FrescoStrip.viewer/1,
          id: "s",
          sources: [%{url: "/img/p1.jpg", height: 9000}]
        )
      end
    end

    test "view_tracking attrs default to omitted (strip)" do
      html = render_component(&FrescoStrip.viewer/1, id: "s", sources: @one_src)
      refute html =~ "data-view-tracking"
      refute html =~ "data-view-settle-ms"
    end

    test "view_tracking=true renders strip data attrs" do
      html =
        render_component(&FrescoStrip.viewer/1,
          id: "s",
          sources: @one_src,
          view_tracking: true,
          view_settle_ms: 200
        )

      assert html =~ ~s(data-view-tracking="true")
      assert html =~ ~s(data-view-settle-ms="200")
    end

    test "raises ArgumentError when a source is missing :url" do
      assert_raise ArgumentError, ~r/require :url \(string\)/, fn ->
        render_component(&FrescoStrip.viewer/1,
          id: "s",
          sources: [%{width: 720, height: 9000}]
        )
      end
    end
  end
end
