import path from "node:path";
import { defineConfig } from "@rspack/cli";
import { rspack } from "@rspack/core";
import RefreshPlugin from "@rspack/plugin-react-refresh";

export default defineConfig((_env, argv) => {
  const isDev = argv.mode === "development" || process.env.NODE_ENV === "development";

  return {
    mode: isDev ? "development" : "production",
    entry: { main: "./src/main.tsx" },
    output: {
      filename: isDev ? "assets/[name].js" : "assets/[name].[contenthash:8].js",
      cssFilename: isDev ? "assets/[name].css" : "assets/[name].[contenthash:8].css",
      publicPath: process.env.BASE_PATH || "/",
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
        templateParameters: { basePath: process.env.BASE_PATH || "/" },
      }),
      new rspack.CopyRspackPlugin({
        patterns: [
          { from: "public/manifest.json", to: "manifest.json" },
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
        ],
      }),
      new rspack.DefinePlugin({
        __BASE_PATH__: JSON.stringify(process.env.BASE_PATH || "/"),
      }),
      isDev && new RefreshPlugin(),
    ].filter(Boolean),
    experiments: { css: true },
    devServer: { port: 3000, hot: true, historyApiFallback: true },
  };
});
