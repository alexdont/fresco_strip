defmodule FrescoStrip.MixProject do
  use Mix.Project

  @version "0.1.0"
  @description "Vertical-image-strip scroll companion to Fresco — for manhwa / long-form / scrolling-feed readers. Native browser scroll, memory windowing, peer-extension contract; no pan/zoom engine. Ships separately from `fresco` so consumers who only need the viewer / canvas stay lightweight."
  @source_url "https://github.com/alexdont/fresco_strip"

  def project do
    [
      app: :fresco_strip,
      version: @version,
      description: @description,
      elixir: "~> 1.18",
      start_permanent: Mix.env() == :prod,
      deps: deps(),
      package: package(),
      docs: docs()
    ]
  end

  def application do
    [extra_applications: [:logger]]
  end

  defp deps do
    [
      {:phoenix_live_view, "~> 1.1"},
      {:phoenix_html, "~> 4.0"},
      {:jason, "~> 1.4"},
      {:ex_doc, "~> 0.39", only: :dev, runtime: false}
    ]
  end

  defp package do
    [
      name: "fresco_strip",
      maintainers: ["Alexander Don"],
      licenses: ["MIT"],
      links: %{"GitHub" => @source_url},
      files: ~w(lib priv mix.exs README.md LICENSE CHANGELOG.md)
    ]
  end

  defp docs do
    [
      name: "FrescoStrip",
      source_ref: "v#{@version}",
      source_url: @source_url,
      main: "FrescoStrip",
      extras: ["README.md", "CHANGELOG.md", "LICENSE"]
    ]
  end
end
