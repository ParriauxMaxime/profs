# Deployment

`profs` deploys to GitHub Pages via `.github/workflows/ci.yml`. This is a
purely static hosting deploy: Pages serves the built app shell (HTML, JS,
CSS, icons) and nothing else. No data leaves the user's device — the app
still has no backend and makes no network request of any kind. Deploying it
does not change that: everything the app does with a class's names and
grades still happens entirely in the browser's IndexedDB, on the user's own
machine.

## One-time setup

The workflow needs Pages configured to deploy via Actions rather than from a
branch. In the repository on GitHub:

1. **Settings → Pages → Build and deployment → Source**, set it to
   **GitHub Actions** (not "Deploy from a branch").

This is the step people miss. Without it, the `deploy` job fails with a
permissions error, because the `actions/deploy-pages` action has nothing to
publish to.

The first successful run creates the `github-pages` **environment**
automatically — you don't need to create it by hand. Subsequent runs deploy
into that environment.

Once deployed, the app is available at:

```
https://<owner>.github.io/<repo>/
```

For this repository, `<repo>` is `profs`, so the app is served under a
sub-path (`/profs/`), not at the domain root.

## How the pipeline is structured

`install` restores dependencies and caches `node_modules` (keyed on
`yarn.lock`). Four jobs — `typecheck`, `lint`, `test`, `build` — restore that
cache and run in parallel. `deploy` needs all four and only runs after every
one is green.

Permissions are scoped as narrowly as the job needs:

- `contents: read` at the top level — the workflow only needs to check out
  code, never to push.
- `pages: write` and `id-token: write` on the `deploy` job only — these let
  it publish the artifact and mint the OIDC token Pages deployment requires.
  No other job gets them.

The `build` job sets `BASE_PATH: /${{ github.event.repository.name }}/` so
the production build knows it will be served under `/profs/` rather than at
`/`. `rspack.config.ts` reads that variable for the asset `publicPath`, the
Chicane router's base path, and a `__BASE_PATH__` define consumed by
`src/main.tsx` (service worker registration URL) and `src/router.ts`. The
manifest and service worker use paths relative to their own file, so they
need no build-time substitution — they resolve correctly under any base path
as-is.

After building, the workflow copies `dist/index.html` to `dist/404.html`.
GitHub Pages has no server-side routing, so a hard refresh on a deep link
like `/profs/gradebooks/<id>/entry/<columnId>` requests a path Pages doesn't
have a file for; Pages serves `404.html` for any unknown path, and since it's
a copy of `index.html`, the SPA boots normally and the router (which reads
the actual URL) takes it from there.

## Testing a sub-path build locally

Before trusting a change to the base-path plumbing, build and serve it the
same way Pages will:

```bash
BASE_PATH=/profs/ yarn build
yarn preview
```

`yarn preview` serves `dist/` as a static root, so this doesn't reproduce the
`/profs/` sub-path itself — but it does let you confirm that `dist/index.html`
references `/profs/assets/...` and `/profs/manifest.json` rather than
root-relative paths, which is the part most likely to break.

## Troubleshooting

**Blank page after deploy.** Almost always a base path problem: assets are
being requested from `/` instead of `/profs/`. Check `dist/index.html`'s
`<script>`/`<link>` tags — they should read `/profs/assets/...`, not
`/assets/...`. If they don't, `BASE_PATH` wasn't set for that build.

**404 on refresh at a deep link.** Confirm `dist/404.html` exists and is a
copy of `dist/index.html`. If the `cp` step is missing or ran before the
build, Pages will show its own 404 for anything but the app root.

**Stale content after a deploy.** The service worker caches aggressively.
`CACHE` in `public/sw.js` is an unversioned string (`"profs-v1"`), which is a
known issue: a deploy that doesn't change that string won't force clients to
drop their old cache on its own. The app has a recovery script in
`public/index.html` that unregisters the service worker and clears caches if
the root element stays empty for three seconds, which handles the worst case
(app fails to boot at all), but it won't help someone looking at a
merely-outdated screen. Bumping `CACHE` is the fix when this becomes a
practical problem; it hasn't been made part of this pipeline.
