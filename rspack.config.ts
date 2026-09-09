import path from "node:path";
import { defineConfig } from "@rspack/cli";
import { rspack } from "@rspack/core";
import RefreshPlugin from "@rspack/plugin-react-refresh";

export default defineConfig((_env, argv) => {
  const isDev = argv.mode === "development" || process.env.NODE_ENV === "development";

  // Everything below the app itself — the manifest's `id`, the canonical URL,
  // the Open Graph image, the sitemap — has to be written as an ABSOLUTE URL,
  // and the deployment lives at a subpath (`/profs/`) rather than at an
  // origin root. So the two halves are separated: CI supplies `BASE_PATH` from
  // the repository name and the origin is a constant, because a workflow
  // cannot spell it — `github.repository_owner` is `ParriauxMaxime`, while the
  // Pages host is lower-cased.
  //
  // Override `SITE_ORIGIN` if the site ever moves to a custom domain. A local
  // build keeps the production origin on purpose: a canonical pointing at
  // localhost is worse than one pointing at the real site.
  const basePath = process.env.BASE_PATH || "/";
  const siteOrigin = (process.env.SITE_ORIGIN || "https://parriauxmaxime.github.io").replace(
    /\/$/,
    "",
  );
  const siteUrl = `${siteOrigin}${basePath}`;

  return {
    mode: isDev ? "development" : "production",
    entry: { main: "./src/main.tsx" },
    output: {
      filename: isDev ? "assets/[name].js" : "assets/[name].[contenthash:8].js",
      cssFilename: isDev ? "assets/[name].css" : "assets/[name].[contenthash:8].css",
      publicPath: basePath,
      clean: true,
    },
    resolve: {
      extensions: [".ts", ".tsx", ".js", ".jsx"],
      alias: {
        "@domain": path.resolve(__dirname, "src/domain"),
        "@db": path.resolve(__dirname, "src/db"),
        "@i18n": path.resolve(__dirname, "src/i18n"),
      },
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: {
            loader: "builtin:swc-loader",
            options: {
              jsc: {
                parser: { syntax: "typescript", tsx: true },
                transform: {
                  react: { runtime: "automatic", development: isDev, refresh: isDev },
                },
              },
            },
          },
        },
        {
          // Fonts are bundled, never fetched: PRIVACY.md promises no network
          // request of any kind, which rules out Google Fonts and every CDN.
          // Hashed so a future version cannot be served from a stale cache.
          test: /\.woff2$/,
          type: "asset/resource",
          generator: {
            filename: isDev ? "assets/[name][ext]" : "assets/[name].[contenthash:8][ext]",
          },
        },
        {
          test: /\.css$/,
          use: ["postcss-loader"],
          type: "css/auto",
        },
      ],
    },
    plugins: [
      new rspack.HtmlRspackPlugin({
        template: "./public/index.html",
        templateParameters: { basePath, siteUrl },
      }),
      new rspack.CopyRspackPlugin({
        patterns: [
          {
            from: "public/manifest.json",
            to: "manifest.json",
            // `id` is the one manifest member that CANNOT be relative: the
            // spec resolves it against the ORIGIN, not against the manifest
            // URL, so a relative "./" would resolve to "/" — the same identity
            // for every project this account publishes to
            // parriauxmaxime.github.io. Two installed PWAs sharing an id is
            // exactly the collision `id` exists to prevent, so it is stamped
            // with the base path here. `start_url` and `scope` stay relative
            // because those two ARE resolved against the manifest URL.
            transform: (content: Buffer) =>
              content.toString().replaceAll("__BASE_PATH__", basePath),
          },
          {
            from: "public/sitemap.xml",
            to: "sitemap.xml",
            transform: (content: Buffer) =>
              content
                .toString()
                .replaceAll("__SITE_URL__", siteUrl)
                .replaceAll("__LASTMOD__", new Date().toISOString().slice(0, 10)),
          },
          {
            from: "public/sw.js",
            to: "sw.js",
            // The cache name carries a build stamp. Without one it never
            // changes, so `activate` — which only drops caches under a
            // different name — keeps every superseded hashed asset forever.
            // That storage competes with the pupil photos in IndexedDB on the
            // same device quota. CI passes the commit sha; a local build gets
            // the build time, which is enough to make each build distinct.
            transform: (content: Buffer) =>
              content
                .toString()
                .replace("__BUILD_ID__", process.env.BUILD_ID || String(Date.now())),
          },
          { from: "public/icons", to: "icons" },
          // Chrome shows its rich install dialog — the one with a description
          // and images, rather than a bare "install?" — only when the manifest
          // carries screenshots. These are real captures of the running app,
          // and they are fetched by the browser at install time rather than on
          // every load, so their weight is not on the boot path.
          { from: "public/screenshots", to: "screenshots" },
        ],
      }),
      new rspack.DefinePlugin({
        __BASE_PATH__: JSON.stringify(basePath),
      }),
      isDev && new RefreshPlugin(),
    ].filter(Boolean),
    experiments: { css: true },
    devServer: { port: 3000, hot: true, historyApiFallback: true },
  };
});
