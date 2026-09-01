# profs Gradebook v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `profs`, a local-only teacher gradebook PWA — classes, students, typed grade columns, weighted averages, CSV roster import — installable and fully offline.

**Architecture:** React 19 SPA, all state in IndexedDB via Dexie, one database per workspace. Pure domain logic (`src/domain/gradebook/`) is unit-tested and knows nothing about React or Dexie; pages read the DB through `dexie-react-hooks` live queries. Routing is Chicane, tables are TanStack Table. No server, no network call anywhere in v1.

**Tech Stack:** React 19, TypeScript (strict), Dexie 4 + dexie-react-hooks, @swan-io/chicane, @tanstack/react-table, Tailwind CSS v4, Rspack, Biome, Jest + ts-jest, i18next + react-i18next, zod, react-hook-form.

**Spec:** `docs/superpowers/specs/2026-09-01-profs-gradebook-design.md`

## Global Constraints

- **No network requests.** No fetch, no CDN fonts, no telemetry, no analytics, no external image URLs. If a task seems to need one, stop and flag it.
- **Locale:** i18next with `fr` and `en`. `fr` is the default and the fallback. Every user-visible string goes through `t()`; no hardcoded French in JSX.
- **Identifiers in English.** `class`, `student`, `gradebook`, `column`, `grade`. Only translation values are French. Note `class` is a reserved word — the domain type is `SchoolClass`.
- **Domain constants live in `src/domain/`,** never inline in components, using the `as const` array + derived type pattern (see `open-setlist/src/domain/music.ts`).
- **Navigation uses Chicane `<Link to={...}>`.** Never a raw `<a href>` for internal links — it causes a full page reload.
- **Biome formatting:** 2-space indent, line width 100, double quotes, always semicolons, trailing commas everywhere. Run `yarn format` rather than hand-formatting.
- **IDs** are generated with `crypto.randomUUID()`.
- **Timestamps** are `number` (epoch ms) from `Date.now()`.
- **Validation gate — every task ends green on all four:** `yarn format`, `yarn lint`, `yarn typecheck`, `yarn test`.
- **Reference implementation:** `../open-setlist` is the sibling project this stack comes from. When a pattern is unclear, read the equivalent file there rather than inventing one.

---

## File Structure

```
profs/
├── package.json                  deps + scripts (Task 1)
├── rspack.config.ts              build, aliases, PWA asset copy (Task 1)
├── tsconfig.json                 strict TS, path aliases (Task 1)
├── biome.json                    lint/format (Task 1)
├── jest.config.js                ts-jest, alias mapping (Task 1)
├── postcss.config.mjs            tailwind v4 (Task 1)
├── public/
│   ├── index.html                shell + SW recovery script (Task 1)
│   ├── manifest.json             PWA manifest (Task 14)
│   ├── sw.js                     app-shell service worker (Task 14)
│   └── icons/icon-192.svg        app icon (Task 14)
└── src/
    ├── main.tsx                  bootstrap: i18n, db init, SW, render (Task 1, 5)
    ├── app.tsx                   route → page switch (Task 1, grows per page task)
    ├── router.ts                 Chicane route table (Task 1)
    ├── env.d.ts                  __BASE_PATH__ declaration (Task 1)
    ├── styles/global.css         Tailwind v4 import + design tokens (Task 1)
    ├── i18n/
    │   ├── index.ts              i18next init, fr default (Task 1)
    │   └── locales/{fr,en}.json  translation catalogues (Task 1, grows per task)
    ├── domain/
    │   ├── workspaces.ts         workspace registry in localStorage (Task 5)
    │   └── gradebook/
    │       ├── column.ts         ColumnType enum + Column shape (Task 2)
    │       ├── grade.ts          GradeValue union + zod schemas (Task 2)
    │       ├── grade.test.ts     (Task 2)
    │       ├── average.ts        weighting, student average, class stats (Task 3)
    │       ├── average.test.ts   (Task 3)
    │       ├── csv.ts            delimiter sniff, parse, roster extract (Task 4)
    │       └── csv.test.ts       (Task 4)
    ├── db/
    │   ├── index.ts              Dexie schema, openWorkspaceDb (Task 5)
    │   ├── types.ts              row interfaces (Task 5)
    │   ├── provider.tsx          DbContext + useDb (Task 5)
    │   ├── init.ts               ensure workspace + seed on boot (Task 5, 6)
    │   ├── seed.ts               demo school "Collège Démo" (Task 6)
    │   └── backup.ts             JSON export/import of a workspace (Task 13)
    └── modules/
        ├── design-system/components/
        │   ├── data-table.tsx    ported TanStack table (Task 7)
        │   ├── editable-cell.tsx typed grade cell editor (Task 10)
        │   ├── number-pad.tsx    on-screen numeric keypad (Task 12)
        │   └── column-type-icon.tsx (Task 10)
        ├── shared/components/
        │   ├── admin-layout.tsx  nav shell (Task 1)
        │   └── nav-link.tsx      active-aware Chicane link (Task 1)
        ├── dashboard/page.tsx    classes + gradebooks (Task 7)
        ├── class/page.tsx        roster CRUD (Task 8)
        │   └── components/csv-import.tsx (Task 9)
        ├── gradebook/page.tsx    the grid (Task 10, 11)
        ├── entry/page.tsx        saisie rapide (Task 12)
        └── settings/page.tsx     subjects, periods, backup, wipe (Task 13)
```

---

### Task 1: Project scaffold that boots

**Files:**
- Create: `package.json`, `rspack.config.ts`, `tsconfig.json`, `biome.json`, `jest.config.js`, `postcss.config.mjs`, `.gitignore` (already exists — verify), `public/index.html`, `src/env.d.ts`, `src/main.tsx`, `src/app.tsx`, `src/router.ts`, `src/styles/global.css`, `src/i18n/index.ts`, `src/i18n/locales/fr.json`, `src/i18n/locales/en.json`, `src/modules/shared/components/admin-layout.tsx`, `src/modules/shared/components/nav-link.tsx`, `src/modules/dashboard/page.tsx`
- Test: `src/i18n/locales/locales.test.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `Router` (Chicane router with routes `Home`, `Class`, `Gradebook`, `Entry`, `Settings`), `AdminLayout`, `NavLink`, path aliases `@domain/*`, `@db`, `@db/*`, `@i18n`, `@i18n/*`, and the four-command validation gate.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "profs",
  "version": "0.1.0",
  "private": true,
  "description": "Open-source, local-only gradebook for teachers",
  "scripts": {
    "dev": "rspack serve --mode development",
    "build": "rspack build --mode production",
    "preview": "npx serve dist",
    "format": "biome check --fix .",
    "lint": "biome check .",
    "typecheck": "tsc --noEmit",
    "test": "jest"
  },
  "dependencies": {
    "@dnd-kit/core": "^6.3.1",
    "@dnd-kit/sortable": "^10.0.0",
    "@dnd-kit/utilities": "^3.2.2",
    "@hookform/resolvers": "^5.2.2",
    "@swan-io/chicane": "^3.0.0",
    "@tanstack/react-table": "^8.21.3",
    "dexie": "^4.0.0",
    "dexie-react-hooks": "^1.1.0",
    "i18next": "^25.8.11",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-hook-form": "^7.71.1",
    "react-i18next": "^16.5.4",
    "zod": "^4.3.6"
  },
  "devDependencies": {
    "@biomejs/biome": "^2.4.2",
    "@rspack/cli": "^1.0.0",
    "@rspack/core": "^1.0.0",
    "@rspack/plugin-react-refresh": "^1.0.0",
    "@tailwindcss/postcss": "^4.0.0",
    "@types/jest": "^30.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "fake-indexeddb": "^6.0.0",
    "jest": "^30.2.0",
    "postcss": "^8.5.0",
    "postcss-loader": "^8.1.0",
    "react-refresh": "^0.14.0",
    "tailwindcss": "^4.0.0",
    "ts-jest": "^29.4.6",
    "typescript": "^5.7.0"
  }
}
```

Then run `yarn install`.

- [ ] **Step 2: Create the build configs**

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "baseUrl": ".",
    "paths": {
      "@domain/*": ["src/domain/*"],
      "@db": ["src/db"],
      "@db/*": ["src/db/*"],
      "@i18n": ["src/i18n"],
      "@i18n/*": ["src/i18n/*"]
    }
  },
  "include": ["src"]
}
```

`biome.json`:

```json
{
  "$schema": "https://biomejs.dev/schemas/2.4.2/schema.json",
  "files": {
    "includes": ["src/**", "rspack.config.ts", "postcss.config.mjs"]
  },
  "formatter": {
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true
    }
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "double",
      "semicolons": "always",
      "trailingCommas": "all"
    }
  },
  "css": {
    "parser": {
      "cssModules": true,
      "tailwindDirectives": true
    }
  }
}
```

`jest.config.js`:

```js
/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  moduleNameMapper: {
    "^@domain/(.*)$": "<rootDir>/src/domain/$1",
    "^@db$": "<rootDir>/src/db",
    "^@db/(.*)$": "<rootDir>/src/db/$1",
    "^@i18n$": "<rootDir>/src/i18n",
    "^@i18n/(.*)$": "<rootDir>/src/i18n/$1",
  },
};
```

`postcss.config.mjs`:

```js
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
```

`rspack.config.ts`:

```ts
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
          { from: "public/sw.js", to: "sw.js" },
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
```

Note: `CopyRspackPlugin` references files created in Task 14. Create placeholders now so the build does not fail: `public/manifest.json` with `{}`, `public/sw.js` empty, and `public/icons/.gitkeep`. Task 14 fills them in.

- [ ] **Step 3: Create the HTML shell and env declaration**

`public/index.html`:

```html
<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#111827" />
    <meta name="mobile-web-app-capable" content="yes" />
    <link rel="manifest" href="<%= basePath %>manifest.json" />
    <link rel="icon" href="<%= basePath %>icons/icon-192.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="<%= basePath %>icons/icon-192.svg" />
    <title>profs</title>
  </head>
  <body>
    <div id="root"></div>
    <script>
      // Recovery: if the app JS fails to load (stale SW serving old assets),
      // unregister SW, clear caches, and reload once.
      setTimeout(function () {
        var root = document.getElementById("root");
        if (root && root.children.length === 0 && "serviceWorker" in navigator) {
          navigator.serviceWorker.getRegistrations().then(function (regs) {
            var tasks = regs.map(function (r) { return r.unregister(); });
            if (caches && caches.keys) {
              tasks.push(
                caches.keys().then(function (keys) {
                  return Promise.all(keys.map(function (k) { return caches.delete(k); }));
                })
              );
            }
            Promise.all(tasks).then(function () {
              if (!sessionStorage.getItem("sw-recovery")) {
                sessionStorage.setItem("sw-recovery", "1");
                location.reload();
              }
            });
          });
        }
      }, 3000);
    </script>
  </body>
</html>
```

`src/env.d.ts`:

```ts
declare const __BASE_PATH__: string;

declare module "*.json" {
  const value: Record<string, unknown>;
  export default value;
}
```

- [ ] **Step 4: Create the design tokens stylesheet**

`src/styles/global.css` — light-first, high contrast, dense. Keep it small; it grows with the UI tasks.

```css
@import "tailwindcss";

@theme {
  --color-bg: #ffffff;
  --color-bg-subtle: #f8fafc;
  --color-bg-hover: #f1f5f9;
  --color-border: #e2e8f0;
  --color-text: #0f172a;
  --color-text-muted: #64748b;
  --color-text-faint: #94a3b8;
  --color-accent: #2563eb;
  --color-danger: #dc2626;
  --color-success: #16a34a;
}

button:not(:disabled) {
  cursor: pointer;
}

body {
  background: var(--color-bg);
  color: var(--color-text);
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  margin: 0;
}

.field {
  width: 100%;
  border: 1px solid var(--color-border);
  border-radius: 0.375rem;
  padding: 0.5rem 0.75rem;
  font-size: 1rem;
  background: var(--color-bg);
  color: var(--color-text);
}

.btn {
  border: 1px solid var(--color-border);
  border-radius: 0.375rem;
  padding: 0.5rem 0.875rem;
  font-weight: 500;
  background: var(--color-bg);
}

.btn-primary {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: #ffffff;
}

.btn-danger {
  border-color: var(--color-danger);
  color: var(--color-danger);
}
```

- [ ] **Step 5: Create i18n with `fr` as default**

`src/i18n/index.ts`:

```ts
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import fr from "./locales/fr.json";

export const LOCALES = ["fr", "en"] as const;
export type Locale = (typeof LOCALES)[number];

const STORAGE_KEY = "profs-locale";

export function loadLocale(): Locale {
  const stored = localStorage.getItem(STORAGE_KEY);
  return LOCALES.includes(stored as Locale) ? (stored as Locale) : "fr";
}

export function saveLocale(locale: Locale): void {
  localStorage.setItem(STORAGE_KEY, locale);
  i18n.changeLanguage(locale);
}

i18n.use(initReactI18next).init({
  resources: {
    fr: { translation: fr },
    en: { translation: en },
  },
  lng: loadLocale(),
  fallbackLng: "fr",
  interpolation: { escapeValue: false },
});

export default i18n;
```

`src/i18n/locales/fr.json`:

```json
{
  "app": { "name": "profs", "tagline": "Le carnet de notes qui reste sur votre appareil" },
  "nav": { "dashboard": "Accueil", "settings": "Réglages" },
  "common": {
    "save": "Enregistrer",
    "cancel": "Annuler",
    "delete": "Supprimer",
    "add": "Ajouter",
    "search": "Rechercher",
    "filter": "Filtrer",
    "all": "Tous",
    "noData": "Aucune donnée",
    "noResults": "Aucun résultat"
  }
}
```

`src/i18n/locales/en.json`:

```json
{
  "app": { "name": "profs", "tagline": "The gradebook that stays on your device" },
  "nav": { "dashboard": "Home", "settings": "Settings" },
  "common": {
    "save": "Save",
    "cancel": "Cancel",
    "delete": "Delete",
    "add": "Add",
    "search": "Search",
    "filter": "Filter",
    "all": "All",
    "noData": "No data",
    "noResults": "No results"
  }
}
```

- [ ] **Step 6: Write the failing locale-parity test**

`src/i18n/locales/locales.test.ts`:

```ts
import en from "./en.json";
import fr from "./fr.json";

function flatKeys(obj: unknown, prefix = ""): string[] {
  if (typeof obj !== "object" || obj === null) return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    flatKeys(v, prefix ? `${prefix}.${k}` : k),
  );
}

describe("locale catalogues", () => {
  it("fr and en have exactly the same keys", () => {
    expect(flatKeys(fr).sort()).toEqual(flatKeys(en).sort());
  });

  it("has no empty translation values", () => {
    const values = JSON.stringify(fr) + JSON.stringify(en);
    expect(values).not.toContain('""');
  });
});
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `yarn test src/i18n`
Expected: PASS, 2 tests. (This test guards every later task that adds strings — if it fails now, the catalogues in Step 5 were mistyped.)

- [ ] **Step 8: Create the router**

`src/router.ts`:

```ts
import { createRouter } from "@swan-io/chicane";

const basePath = __BASE_PATH__ === "/" ? "" : __BASE_PATH__.replace(/\/$/, "");

export const Router = createRouter(
  {
    Home: "/",
    Class: "/classes/:classId",
    Gradebook: "/gradebooks/:gradebookId",
    Entry: "/gradebooks/:gradebookId/entry/:columnId",
    Settings: "/settings",
  },
  { basePath },
);
```

- [ ] **Step 9: Create the layout shell**

`src/modules/shared/components/nav-link.tsx`:

```tsx
import { Link } from "@swan-io/chicane";
import type { ReactNode } from "react";

export function NavLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="rounded px-3 py-2 font-medium text-text-muted hover:bg-bg-hover hover:text-text"
      activeClassName="bg-bg-hover text-text"
    >
      {children}
    </Link>
  );
}
```

`src/modules/shared/components/admin-layout.tsx`:

```tsx
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Router } from "../../../router";
import { NavLink } from "./nav-link";

export function AdminLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen">
      <header className="flex items-center gap-2 border-b border-border px-4 py-2">
        <span className="mr-4 font-bold text-lg">{t("app.name")}</span>
        <NavLink to={Router.Home()}>{t("nav.dashboard")}</NavLink>
        <NavLink to={Router.Settings()}>{t("nav.settings")}</NavLink>
      </header>
      <main className="mx-auto max-w-6xl p-4">{children}</main>
    </div>
  );
}
```

- [ ] **Step 10: Create a placeholder dashboard, the app switch, and the entry point**

`src/modules/dashboard/page.tsx`:

```tsx
import { useTranslation } from "react-i18next";

export function DashboardPage() {
  const { t } = useTranslation();
  return <p className="text-text-muted">{t("app.tagline")}</p>;
}
```

`src/app.tsx`:

```tsx
import { DashboardPage } from "./modules/dashboard/page";
import { AdminLayout } from "./modules/shared/components/admin-layout";
import { Router } from "./router";

export function App() {
  const route = Router.useRoute(["Home", "Class", "Gradebook", "Entry", "Settings"]);

  if (!route) {
    Router.replace("Home");
    return null;
  }

  return (
    <AdminLayout>
      <Routes route={route} />
    </AdminLayout>
  );
}

type AppRoute = NonNullable<
  ReturnType<typeof Router.useRoute<"Home" | "Class" | "Gradebook" | "Entry" | "Settings">>
>;

function Routes({ route }: { route: AppRoute }) {
  switch (route.name) {
    case "Home":
      return <DashboardPage />;
    case "Class":
    case "Gradebook":
    case "Entry":
    case "Settings":
      return <p className="text-text-muted">…</p>;
  }
}
```

`src/main.tsx`:

```tsx
import "@i18n";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import "./styles/global.css";

if ("serviceWorker" in navigator) {
  if (process.env.NODE_ENV === "production") {
    navigator.serviceWorker.register(`${__BASE_PATH__}sw.js`);
  } else {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      for (const reg of regs) reg.unregister();
    });
    caches.keys().then((keys) => {
      for (const key of keys) caches.delete(key);
    });
  }
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 11: Run the full validation gate**

```bash
yarn format && yarn lint && yarn typecheck && yarn test
```

Expected: all four pass.

- [ ] **Step 12: Verify the dev server boots**

Run: `yarn dev`, open `http://localhost:3000`.
Expected: header showing "profs / Accueil / Réglages" and the French tagline. Clicking "Réglages" changes the URL to `/settings` with no page reload. Stop the server.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "feat: scaffold profs app shell

React 19 + Rspack + Tailwind v4 + Biome + Jest, Chicane router, i18next
with fr as default locale. Locale parity test guards future strings."
```

---

### Task 2: Column types and grade values

**Files:**
- Create: `src/domain/gradebook/column.ts`, `src/domain/gradebook/grade.ts`
- Test: `src/domain/gradebook/grade.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `COLUMN_TYPES`, `type ColumnType = "numeric" | "letter" | "icon" | "checkbox" | "text" | "attendance"`
  - `ATTENDANCE_VALUES`, `type AttendanceValue = "present" | "absent" | "late" | "excused"`
  - `type GradeValue` — discriminated union on `type`
  - `gradeValueSchema: z.ZodType<GradeValue>`
  - `parseGradeValue(type: ColumnType, raw: unknown): GradeValue | null`
  - `isNumericColumn(type: ColumnType): boolean`
  - `formatGradeValue(value: GradeValue, max?: number): string`

- [ ] **Step 1: Write the failing test**

`src/domain/gradebook/grade.test.ts`:

```ts
import { formatGradeValue, gradeValueSchema, parseGradeValue } from "./grade";

describe("parseGradeValue", () => {
  it("parses a numeric grade from a string", () => {
    expect(parseGradeValue("numeric", "14.5")).toEqual({ type: "numeric", value: 14.5 });
  });

  it("accepts a comma decimal separator", () => {
    expect(parseGradeValue("numeric", "11,5")).toEqual({ type: "numeric", value: 11.5 });
  });

  it("rejects a non-numeric string for a numeric column", () => {
    expect(parseGradeValue("numeric", "abs")).toBeNull();
  });

  it("rejects a negative numeric grade", () => {
    expect(parseGradeValue("numeric", "-3")).toBeNull();
  });

  it("treats an empty string as no value", () => {
    expect(parseGradeValue("numeric", "")).toBeNull();
    expect(parseGradeValue("text", "   ")).toBeNull();
  });

  it("parses a checkbox value", () => {
    expect(parseGradeValue("checkbox", true)).toEqual({ type: "checkbox", value: true });
  });

  it("parses a known attendance value", () => {
    expect(parseGradeValue("attendance", "absent")).toEqual({
      type: "attendance",
      value: "absent",
    });
  });

  it("rejects an unknown attendance value", () => {
    expect(parseGradeValue("attendance", "sick")).toBeNull();
  });

  it("uppercases a letter grade and trims it", () => {
    expect(parseGradeValue("letter", " a+ ")).toEqual({ type: "letter", value: "A+" });
  });
});

describe("gradeValueSchema", () => {
  it("accepts a well-formed value", () => {
    expect(gradeValueSchema.safeParse({ type: "numeric", value: 12 }).success).toBe(true);
  });

  it("rejects a mismatched payload", () => {
    expect(gradeValueSchema.safeParse({ type: "numeric", value: "12" }).success).toBe(false);
  });
});

describe("formatGradeValue", () => {
  it("shows a numeric grade against its max", () => {
    expect(formatGradeValue({ type: "numeric", value: 14.5 }, 20)).toBe("14,5/20");
  });

  it("drops a trailing zero decimal", () => {
    expect(formatGradeValue({ type: "numeric", value: 14 }, 20)).toBe("14/20");
  });

  it("renders a checkbox as a mark", () => {
    expect(formatGradeValue({ type: "checkbox", value: true })).toBe("✓");
    expect(formatGradeValue({ type: "checkbox", value: false })).toBe("✗");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test src/domain/gradebook/grade.test.ts`
Expected: FAIL — `Cannot find module './grade'`.

- [ ] **Step 3: Write `column.ts`**

```ts
/**
 * Column types for a gradebook.
 *
 * A column is one assessment or one tracked attribute. Its type decides what a
 * cell may hold, how the cell is edited, and whether the column takes part in
 * average computation (only `numeric` does).
 */

export const COLUMN_TYPES = [
  "numeric",
  "letter",
  "icon",
  "checkbox",
  "text",
  "attendance",
] as const;

export type ColumnType = (typeof COLUMN_TYPES)[number];

export const ATTENDANCE_VALUES = ["present", "absent", "late", "excused"] as const;

export type AttendanceValue = (typeof ATTENDANCE_VALUES)[number];

/** Only numeric columns contribute to averages. */
export function isNumericColumn(type: ColumnType): boolean {
  return type === "numeric";
}
```

- [ ] **Step 4: Write `grade.ts`**

```ts
import { z } from "zod";
import { ATTENDANCE_VALUES, type ColumnType } from "./column";

export type GradeValue =
  | { type: "numeric"; value: number }
  | { type: "letter"; value: string }
  | { type: "icon"; value: string }
  | { type: "checkbox"; value: boolean }
  | { type: "text"; value: string }
  | { type: "attendance"; value: (typeof ATTENDANCE_VALUES)[number] };

export const gradeValueSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("numeric"), value: z.number().min(0) }),
  z.object({ type: z.literal("letter"), value: z.string().min(1) }),
  z.object({ type: z.literal("icon"), value: z.string().min(1) }),
  z.object({ type: z.literal("checkbox"), value: z.boolean() }),
  z.object({ type: z.literal("text"), value: z.string().min(1) }),
  z.object({ type: z.literal("attendance"), value: z.enum(ATTENDANCE_VALUES) }),
]) satisfies z.ZodType<GradeValue>;

/**
 * Turn raw editor input into a validated GradeValue.
 * Returns null when the input is empty or invalid — the caller deletes the cell.
 */
export function parseGradeValue(type: ColumnType, raw: unknown): GradeValue | null {
  if (type === "checkbox") {
    return typeof raw === "boolean" ? { type, value: raw } : null;
  }

  const text = typeof raw === "string" ? raw.trim() : String(raw ?? "").trim();
  if (text === "") return null;

  switch (type) {
    case "numeric": {
      // French keyboards and Excel exports both produce "11,5".
      const parsed = Number(text.replace(",", "."));
      if (!Number.isFinite(parsed) || parsed < 0) return null;
      return { type, value: parsed };
    }
    case "letter":
      return { type, value: text.toUpperCase() };
    case "icon":
    case "text":
      return { type, value: text };
    case "attendance": {
      const candidate = ATTENDANCE_VALUES.find((v) => v === text);
      return candidate ? { type, value: candidate } : null;
    }
  }
}

/** Display form for a cell. `max` only matters for numeric columns. */
export function formatGradeValue(value: GradeValue, max?: number): string {
  switch (value.type) {
    case "numeric": {
      const shown = String(Number(value.value.toFixed(2))).replace(".", ",");
      return max === undefined ? shown : `${shown}/${max}`;
    }
    case "checkbox":
      return value.value ? "✓" : "✗";
    case "attendance":
    case "letter":
    case "icon":
    case "text":
      return value.value;
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `yarn test src/domain/gradebook/grade.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 6: Run the validation gate and commit**

```bash
yarn format && yarn lint && yarn typecheck && yarn test
git add -A
git commit -m "feat(domain): typed gradebook columns and grade values

Six column types, a zod-validated discriminated union for cell values,
and parsing that accepts French comma decimals."
```

---

### Task 3: Averages and class statistics

**Files:**
- Create: `src/domain/gradebook/average.ts`
- Test: `src/domain/gradebook/average.test.ts`

**Interfaces:**
- Consumes: `ColumnType`, `isNumericColumn` from `./column`; `GradeValue` from `./grade`.
- Produces:
  - `interface AverageColumn { id: string; type: ColumnType; weight: number; max: number; periodId: string }`
  - `interface AverageGrade { columnId: string; value: GradeValue }`
  - `studentAverage(grades: AverageGrade[], columns: AverageColumn[], periodId?: string): number | null` — returns a mark out of 20, or `null` when nothing counts
  - `interface ClassStats { count: number; min: number; max: number; mean: number; median: number }`
  - `classStats(values: number[]): ClassStats | null`

Averages are always normalised to /20 regardless of each column's own `max`, so a
/100 test and a /20 test can be averaged together. Weights are per column.

- [ ] **Step 1: Write the failing test**

`src/domain/gradebook/average.test.ts`:

```ts
import { type AverageColumn, type AverageGrade, classStats, studentAverage } from "./average";

function col(over: Partial<AverageColumn> & { id: string }): AverageColumn {
  return { type: "numeric", weight: 1, max: 20, periodId: "p1", ...over };
}

describe("studentAverage", () => {
  it("returns null when the student has no grades", () => {
    expect(studentAverage([], [col({ id: "c1" })])).toBeNull();
  });

  it("averages two equally weighted marks", () => {
    const columns = [col({ id: "c1" }), col({ id: "c2" })];
    const grades: AverageGrade[] = [
      { columnId: "c1", value: { type: "numeric", value: 10 } },
      { columnId: "c2", value: { type: "numeric", value: 16 } },
    ];
    expect(studentAverage(grades, columns)).toBe(13);
  });

  it("applies column weights", () => {
    const columns = [col({ id: "c1", weight: 1 }), col({ id: "c2", weight: 3 })];
    const grades: AverageGrade[] = [
      { columnId: "c1", value: { type: "numeric", value: 8 } },
      { columnId: "c2", value: { type: "numeric", value: 16 } },
    ];
    // (8*1 + 16*3) / 4 = 14
    expect(studentAverage(grades, columns)).toBe(14);
  });

  it("normalises a /100 column to /20 before averaging", () => {
    const columns = [col({ id: "c1", max: 100 }), col({ id: "c2", max: 20 })];
    const grades: AverageGrade[] = [
      { columnId: "c1", value: { type: "numeric", value: 80 } }, // = 16/20
      { columnId: "c2", value: { type: "numeric", value: 10 } },
    ];
    expect(studentAverage(grades, columns)).toBe(13);
  });

  it("ignores non-numeric columns", () => {
    const columns = [col({ id: "c1" }), col({ id: "c2", type: "text" })];
    const grades: AverageGrade[] = [
      { columnId: "c1", value: { type: "numeric", value: 12 } },
      { columnId: "c2", value: { type: "text", value: "bon travail" } },
    ];
    expect(studentAverage(grades, columns)).toBe(12);
  });

  it("ignores missing cells rather than counting them as zero", () => {
    const columns = [col({ id: "c1" }), col({ id: "c2" })];
    const grades: AverageGrade[] = [{ columnId: "c1", value: { type: "numeric", value: 12 } }];
    expect(studentAverage(grades, columns)).toBe(12);
  });

  it("restricts to one period when a periodId is given", () => {
    const columns = [col({ id: "c1", periodId: "p1" }), col({ id: "c2", periodId: "p2" })];
    const grades: AverageGrade[] = [
      { columnId: "c1", value: { type: "numeric", value: 10 } },
      { columnId: "c2", value: { type: "numeric", value: 20 } },
    ];
    expect(studentAverage(grades, columns, "p1")).toBe(10);
  });

  it("ignores a grade referencing an unknown column", () => {
    const grades: AverageGrade[] = [{ columnId: "ghost", value: { type: "numeric", value: 20 } }];
    expect(studentAverage(grades, [col({ id: "c1" })])).toBeNull();
  });

  it("ignores columns with a zero or negative weight", () => {
    const columns = [col({ id: "c1", weight: 0 }), col({ id: "c2", weight: 2 })];
    const grades: AverageGrade[] = [
      { columnId: "c1", value: { type: "numeric", value: 0 } },
      { columnId: "c2", value: { type: "numeric", value: 15 } },
    ];
    expect(studentAverage(grades, columns)).toBe(15);
  });

  it("rounds to two decimals", () => {
    const columns = [col({ id: "c1" }), col({ id: "c2" }), col({ id: "c3" })];
    const grades: AverageGrade[] = [
      { columnId: "c1", value: { type: "numeric", value: 10 } },
      { columnId: "c2", value: { type: "numeric", value: 11 } },
      { columnId: "c3", value: { type: "numeric", value: 13 } },
    ];
    expect(studentAverage(grades, columns)).toBe(11.33);
  });
});

describe("classStats", () => {
  it("returns null for an empty class", () => {
    expect(classStats([])).toBeNull();
  });

  it("computes min, max, mean and median for an odd count", () => {
    expect(classStats([10, 14, 6])).toEqual({
      count: 3,
      min: 6,
      max: 14,
      mean: 10,
      median: 10,
    });
  });

  it("takes the midpoint of the two middle values for an even count", () => {
    expect(classStats([10, 14, 6, 12])).toEqual({
      count: 4,
      min: 6,
      max: 14,
      mean: 10.5,
      median: 11,
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test src/domain/gradebook/average.test.ts`
Expected: FAIL — `Cannot find module './average'`.

- [ ] **Step 3: Write `average.ts`**

```ts
import { type ColumnType, isNumericColumn } from "./column";
import type { GradeValue } from "./grade";

/** The slice of a Column this module needs — keeps the maths free of DB types. */
export interface AverageColumn {
  id: string;
  type: ColumnType;
  weight: number;
  max: number;
  periodId: string;
}

export interface AverageGrade {
  columnId: string;
  value: GradeValue;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Weighted average of a student's numeric grades, expressed out of 20.
 *
 * Every numeric column is normalised by its own `max` first, so a /100 test and
 * a /20 test can sit in the same gradebook. Empty cells are skipped, never
 * counted as zero. Returns null when nothing countable exists.
 */
export function studentAverage(
  grades: AverageGrade[],
  columns: AverageColumn[],
  periodId?: string,
): number | null {
  const byId = new Map(columns.map((c) => [c.id, c]));

  let weighted = 0;
  let totalWeight = 0;

  for (const grade of grades) {
    const column = byId.get(grade.columnId);
    if (!column) continue;
    if (periodId !== undefined && column.periodId !== periodId) continue;
    if (!isNumericColumn(column.type)) continue;
    if (column.weight <= 0) continue;
    if (grade.value.type !== "numeric") continue;
    if (column.max <= 0) continue;

    const outOf20 = (grade.value.value / column.max) * 20;
    weighted += outOf20 * column.weight;
    totalWeight += column.weight;
  }

  if (totalWeight === 0) return null;
  return round2(weighted / totalWeight);
}

export interface ClassStats {
  count: number;
  min: number;
  max: number;
  mean: number;
  median: number;
}

/** Descriptive statistics over a set of averages. Null for an empty set. */
export function classStats(values: number[]): ClassStats | null {
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];

  return {
    count: sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: round2(sorted.reduce((sum, v) => sum + v, 0) / sorted.length),
    median: round2(median),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn test src/domain/gradebook/average.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Run the validation gate and commit**

```bash
yarn format && yarn lint && yarn typecheck && yarn test
git add -A
git commit -m "feat(domain): weighted averages and class statistics

Averages normalise every numeric column to /20 by its own max, apply per
column weights, and skip empty cells rather than scoring them zero."
```

---

### Task 4: CSV roster parsing

**Files:**
- Create: `src/domain/gradebook/csv.ts`
- Test: `src/domain/gradebook/csv.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `type Delimiter = "," | ";" | "\t"`
  - `sniffDelimiter(text: string): Delimiter`
  - `parseCsv(text: string, delimiter: Delimiter): string[][]`
  - `interface RosterMapping { lastName: number; firstName: number; skipFirstRow: boolean }`
  - `interface RosterRow { firstName: string; lastName: string }`
  - `extractRoster(rows: string[][], mapping: RosterMapping): RosterRow[]`
  - `findDuplicates(incoming: RosterRow[], existing: RosterRow[]): number[]` — indices into `incoming`

- [ ] **Step 1: Write the failing test**

`src/domain/gradebook/csv.test.ts`:

```ts
import { extractRoster, findDuplicates, parseCsv, sniffDelimiter } from "./csv";

describe("sniffDelimiter", () => {
  it("detects semicolons, as French Excel exports them", () => {
    expect(sniffDelimiter("Nom;Prénom\nDupont;Marie")).toBe(";");
  });

  it("detects commas", () => {
    expect(sniffDelimiter("Nom,Prénom\nDupont,Marie")).toBe(",");
  });

  it("detects tabs, as a spreadsheet paste produces them", () => {
    expect(sniffDelimiter("Nom\tPrénom\nDupont\tMarie")).toBe("\t");
  });

  it("picks the delimiter that yields the most consistent column count", () => {
    // Commas appear inside a field, semicolons are the real separator.
    expect(sniffDelimiter("Nom;Remarque\nDupont;bon, sérieux\nMartin;lent, appliqué")).toBe(";");
  });

  it("falls back to a comma for a single-column file", () => {
    expect(sniffDelimiter("Dupont\nMartin")).toBe(",");
  });
});

describe("parseCsv", () => {
  it("splits rows and fields", () => {
    expect(parseCsv("a;b\nc;d", ";")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("keeps a delimiter inside a quoted field", () => {
    expect(parseCsv('a;"b;c"', ";")).toEqual([["a", "b;c"]]);
  });

  it("unescapes a doubled quote inside a quoted field", () => {
    expect(parseCsv('a;"say ""hi"""', ";")).toEqual([["a", 'say "hi"']]);
  });

  it("handles CRLF line endings", () => {
    expect(parseCsv("a;b\r\nc;d", ";")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("skips blank lines", () => {
    expect(parseCsv("a;b\n\nc;d\n", ";")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("trims surrounding whitespace on unquoted fields", () => {
    expect(parseCsv(" a ; b ", ";")).toEqual([["a", "b"]]);
  });
});

describe("extractRoster", () => {
  const rows = [
    ["Nom", "Prénom", "Classe"],
    ["Dupont", "Marie", "3B"],
    ["Nguyen", "Léa", "3B"],
  ];

  it("maps the named columns and skips the header", () => {
    expect(extractRoster(rows, { lastName: 0, firstName: 1, skipFirstRow: true })).toEqual([
      { lastName: "Dupont", firstName: "Marie" },
      { lastName: "Nguyen", firstName: "Léa" },
    ]);
  });

  it("keeps the first row when it is data, not a header", () => {
    const result = extractRoster(rows, { lastName: 0, firstName: 1, skipFirstRow: false });
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ lastName: "Nom", firstName: "Prénom" });
  });

  it("drops rows where both names are empty", () => {
    const withBlank = [["Dupont", "Marie"], ["", ""], ["Nguyen", "Léa"]];
    expect(
      extractRoster(withBlank, { lastName: 0, firstName: 1, skipFirstRow: false }),
    ).toHaveLength(2);
  });

  it("keeps a row with only a last name", () => {
    const partial = [["Dupont", ""]];
    expect(extractRoster(partial, { lastName: 0, firstName: 1, skipFirstRow: false })).toEqual([
      { lastName: "Dupont", firstName: "" },
    ]);
  });

  it("tolerates a row shorter than the mapping", () => {
    const short = [["Dupont"]];
    expect(extractRoster(short, { lastName: 0, firstName: 1, skipFirstRow: false })).toEqual([
      { lastName: "Dupont", firstName: "" },
    ]);
  });
});

describe("findDuplicates", () => {
  const existing = [{ lastName: "Dupont", firstName: "Marie" }];

  it("flags an incoming row already present, ignoring case and accents", () => {
    const incoming = [
      { lastName: "DUPONT", firstName: "marie" },
      { lastName: "Nguyen", firstName: "Léa" },
    ];
    expect(findDuplicates(incoming, existing)).toEqual([0]);
  });

  it("flags a duplicate inside the incoming batch itself", () => {
    const incoming = [
      { lastName: "Nguyen", firstName: "Léa" },
      { lastName: "Nguyen", firstName: "Léa" },
    ];
    expect(findDuplicates(incoming, [])).toEqual([1]);
  });

  it("returns an empty list when everything is new", () => {
    expect(findDuplicates([{ lastName: "Nguyen", firstName: "Léa" }], existing)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test src/domain/gradebook/csv.test.ts`
Expected: FAIL — `Cannot find module './csv'`.

- [ ] **Step 3: Write `csv.ts`**

```ts
/**
 * CSV roster import.
 *
 * Teachers paste a class list out of a spreadsheet or export one from the
 * school's system. French Excel writes `;`, a paste writes tabs, an export
 * from an English tool writes `,` — so the delimiter is sniffed rather than
 * configured.
 */

export type Delimiter = "," | ";" | "\t";

const DELIMITERS: Delimiter[] = [";", ",", "\t"];

/**
 * Pick the delimiter that splits the sample into the most columns while
 * staying consistent across lines. A comma inside a remark field would win on
 * raw count alone, so consistency is the tie-breaker.
 */
export function sniffDelimiter(text: string): Delimiter {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "").slice(0, 10);
  if (lines.length === 0) return ",";

  let best: { delimiter: Delimiter; columns: number } = { delimiter: ",", columns: 1 };

  for (const delimiter of DELIMITERS) {
    const counts = lines.map((line) => parseLine(line, delimiter).length);
    const consistent = counts.every((c) => c === counts[0]);
    if (!consistent) continue;
    if (counts[0] > best.columns) {
      best = { delimiter, columns: counts[0] };
    }
  }

  return best.delimiter;
}

function parseLine(line: string, delimiter: Delimiter): string[] {
  const fields: string[] = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      fields.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  fields.push(current.trim());
  return fields;
}

export function parseCsv(text: string, delimiter: Delimiter): string[][] {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "")
    .map((line) => parseLine(line, delimiter));
}

export interface RosterMapping {
  lastName: number;
  firstName: number;
  skipFirstRow: boolean;
}

export interface RosterRow {
  firstName: string;
  lastName: string;
}

export function extractRoster(rows: string[][], mapping: RosterMapping): RosterRow[] {
  const body = mapping.skipFirstRow ? rows.slice(1) : rows;

  return body
    .map((row) => ({
      lastName: (row[mapping.lastName] ?? "").trim(),
      firstName: (row[mapping.firstName] ?? "").trim(),
    }))
    .filter((row) => row.lastName !== "" || row.firstName !== "");
}

/** Case- and accent-insensitive identity key for duplicate detection. */
function identity(row: RosterRow): string {
  return `${row.lastName} ${row.firstName}`
    .toLocaleLowerCase("fr")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Indices in `incoming` that collide with `existing` or with an earlier row of
 * the same batch. Two students can legitimately share a name, so the caller
 * shows these to the teacher instead of merging them.
 */
export function findDuplicates(incoming: RosterRow[], existing: RosterRow[]): number[] {
  const seen = new Set(existing.map(identity));
  const duplicates: number[] = [];

  incoming.forEach((row, index) => {
    const key = identity(row);
    if (seen.has(key)) {
      duplicates.push(index);
    } else {
      seen.add(key);
    }
  });

  return duplicates;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn test src/domain/gradebook/csv.test.ts`
Expected: PASS, 17 tests.

- [ ] **Step 5: Run the validation gate and commit**

```bash
yarn format && yarn lint && yarn typecheck && yarn test
git add -A
git commit -m "feat(domain): CSV roster parsing

Sniffs ; , and tab delimiters by column consistency, parses quoted
fields, and flags duplicate students instead of merging them."
```

---

### Task 5: Dexie schema, workspace registry, and DB provider

**Files:**
- Create: `src/db/types.ts`, `src/db/index.ts`, `src/db/provider.tsx`, `src/db/init.ts`, `src/domain/workspaces.ts`
- Modify: `src/main.tsx` (wrap `App` in `DbProvider`, await init before render)
- Test: `src/db/index.test.ts`

**Interfaces:**
- Consumes: `ColumnType` from `@domain/gradebook/column`, `GradeValue` from `@domain/gradebook/grade`.
- Produces:
  - `src/db/types.ts`: `SchoolClass`, `Student`, `Subject`, `Gradebook`, `Period`, `GradeColumn`, `Grade`
  - `src/db/index.ts`: `type AppDatabase`, `openWorkspaceDb(workspaceId: string): AppDatabase`, `gradeKey(gradebookId, columnId, studentId): [string, string, string]`
  - `src/db/provider.tsx`: `DbProvider`, `useDb(): AppDatabase`
  - `src/db/init.ts`: `initWorkspace(): Promise<string>` (returns the active workspace id)
  - `src/domain/workspaces.ts`: `interface Workspace { id: string; name: string; year: string }`, `listWorkspaces()`, `addWorkspace(name, year)`, `activeWorkspaceId()`, `setActiveWorkspaceId(id)`, `ensureDefaultWorkspace(): Workspace`, `useActiveWorkspaceId(): string`

The workspace registry lives in `localStorage` (not IndexedDB) because it must be
readable synchronously before any database is opened — the same trick
`open-setlist/src/domain/profiles.ts` uses for profiles.

- [ ] **Step 1: Write the failing test**

`src/db/index.test.ts`:

```ts
import "fake-indexeddb/auto";
import { gradeKey, openWorkspaceDb } from ".";

describe("openWorkspaceDb", () => {
  it("names the database after the workspace", () => {
    const db = openWorkspaceDb("ws-1");
    expect(db.name).toBe("profs-ws-1");
    db.close();
  });

  it("stores and reads back a student", async () => {
    const db = openWorkspaceDb("ws-students");
    await db.students.add({
      id: "s1",
      classId: "c1",
      firstName: "Marie",
      lastName: "Dupont",
      createdAt: 1,
      updatedAt: 1,
    });
    const found = await db.students.where("classId").equals("c1").toArray();
    expect(found.map((s) => s.lastName)).toEqual(["Dupont"]);
    db.close();
  });

  it("upserts a grade on its compound key rather than duplicating it", async () => {
    const db = openWorkspaceDb("ws-grades");
    const base = { gradebookId: "g1", columnId: "col1", studentId: "s1", updatedAt: 1 };
    await db.grades.put({ ...base, value: { type: "numeric", value: 12 } });
    await db.grades.put({ ...base, value: { type: "numeric", value: 15 }, updatedAt: 2 });

    const all = await db.grades.toArray();
    expect(all).toHaveLength(1);
    expect(all[0].value).toEqual({ type: "numeric", value: 15 });
    db.close();
  });

  it("finds a grade by its compound key", async () => {
    const db = openWorkspaceDb("ws-key");
    await db.grades.put({
      gradebookId: "g1",
      columnId: "col1",
      studentId: "s1",
      value: { type: "numeric", value: 9 },
      updatedAt: 1,
    });
    const found = await db.grades.get(gradeKey("g1", "col1", "s1"));
    expect(found?.value).toEqual({ type: "numeric", value: 9 });
    db.close();
  });

  it("queries every grade of one gradebook", async () => {
    const db = openWorkspaceDb("ws-bulk");
    await db.grades.bulkPut([
      { gradebookId: "g1", columnId: "c1", studentId: "s1", value: { type: "numeric", value: 1 }, updatedAt: 1 },
      { gradebookId: "g1", columnId: "c1", studentId: "s2", value: { type: "numeric", value: 2 }, updatedAt: 1 },
      { gradebookId: "g2", columnId: "c9", studentId: "s1", value: { type: "numeric", value: 3 }, updatedAt: 1 },
    ]);
    const found = await db.grades.where("gradebookId").equals("g1").toArray();
    expect(found).toHaveLength(2);
    db.close();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test src/db`
Expected: FAIL — `Cannot find module '.'` (the `src/db` directory has no `index.ts` yet).

- [ ] **Step 3: Write `src/db/types.ts`**

```ts
import type { ColumnType } from "@domain/gradebook/column";
import type { GradeValue } from "@domain/gradebook/grade";

/** A teaching group: "3°B". `class` is reserved, hence SchoolClass. */
export interface SchoolClass {
  id: string;
  name: string;
  level?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Student {
  id: string;
  classId: string;
  firstName: string;
  lastName: string;
  photo?: Blob;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Subject {
  id: string;
  name: string;
  color: string;
  createdAt: number;
  updatedAt: number;
}

/** One class taught in one subject. Owns its periods and columns. */
export interface Gradebook {
  id: string;
  classId: string;
  subjectId: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

/** A trimestre or semestre. Belongs to a gradebook, not the workspace. */
export interface Period {
  id: string;
  gradebookId: string;
  name: string;
  order: number;
}

/** One assessment column. `max` only meaningful when type is "numeric". */
export interface GradeColumn {
  id: string;
  gradebookId: string;
  periodId: string;
  type: ColumnType;
  label: string;
  weight: number;
  max: number;
  order: number;
  date?: number;
}

/** One cell. Keyed by [gradebookId+columnId+studentId]. */
export interface Grade {
  gradebookId: string;
  columnId: string;
  studentId: string;
  value: GradeValue;
  note?: string;
  updatedAt: number;
}
```

- [ ] **Step 4: Write `src/db/index.ts`**

```ts
import Dexie, { type EntityTable, type Table } from "dexie";
import type { Gradebook, Grade, GradeColumn, Period, SchoolClass, Student, Subject } from "./types";

export type {
  Gradebook,
  Grade,
  GradeColumn,
  Period,
  SchoolClass,
  Student,
  Subject,
} from "./types";

export type AppDatabase = Dexie & {
  classes: EntityTable<SchoolClass, "id">;
  students: EntityTable<Student, "id">;
  subjects: EntityTable<Subject, "id">;
  gradebooks: EntityTable<Gradebook, "id">;
  periods: EntityTable<Period, "id">;
  columns: EntityTable<GradeColumn, "id">;
  grades: Table<Grade, [string, string, string]>;
};

/** The compound primary key of a cell. */
export function gradeKey(
  gradebookId: string,
  columnId: string,
  studentId: string,
): [string, string, string] {
  return [gradebookId, columnId, studentId];
}

export function openWorkspaceDb(workspaceId: string): AppDatabase {
  const db = new Dexie(`profs-${workspaceId}`) as AppDatabase;
  db.version(1).stores({
    classes: "id, name",
    students: "id, classId, lastName",
    subjects: "id, name",
    gradebooks: "id, classId, subjectId",
    periods: "id, gradebookId, order",
    columns: "id, gradebookId, periodId, order",
    grades: "[gradebookId+columnId+studentId], gradebookId, columnId, studentId",
  });
  return db;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `yarn test src/db`
Expected: PASS, 5 tests.

- [ ] **Step 6: Write the workspace registry**

`src/domain/workspaces.ts`:

```ts
import { useSyncExternalStore } from "react";

/**
 * A workspace is one school/year. Its data lives in its own IndexedDB database.
 * The registry itself is in localStorage so it can be read synchronously,
 * before any database is opened.
 */
export interface Workspace {
  id: string;
  name: string;
  year: string;
}

const LIST_KEY = "profs-workspaces";
const ACTIVE_KEY = "profs-active-workspace";

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function listWorkspaces(): Workspace[] {
  const raw = localStorage.getItem(LIST_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Workspace[]) : [];
  } catch {
    return [];
  }
}

function writeWorkspaces(workspaces: Workspace[]): void {
  localStorage.setItem(LIST_KEY, JSON.stringify(workspaces));
  emit();
}

export function addWorkspace(name: string, year: string): Workspace {
  const workspace: Workspace = { id: crypto.randomUUID(), name, year };
  writeWorkspaces([...listWorkspaces(), workspace]);
  return workspace;
}

export function activeWorkspaceId(): string | null {
  const id = localStorage.getItem(ACTIVE_KEY);
  return id && listWorkspaces().some((w) => w.id === id) ? id : null;
}

export function setActiveWorkspaceId(id: string): void {
  localStorage.setItem(ACTIVE_KEY, id);
  emit();
}

/** Create "Mon établissement" on first run. Idempotent. */
export function ensureDefaultWorkspace(): Workspace {
  const existing = listWorkspaces();
  const active = activeWorkspaceId();
  if (active) {
    const found = existing.find((w) => w.id === active);
    if (found) return found;
  }
  if (existing.length > 0) {
    setActiveWorkspaceId(existing[0].id);
    return existing[0];
  }

  const year = new Date().getFullYear();
  const workspace = addWorkspace("Mon établissement", `${year}-${year + 1}`);
  setActiveWorkspaceId(workspace.id);
  return workspace;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useActiveWorkspaceId(): string {
  return useSyncExternalStore(
    subscribe,
    () => activeWorkspaceId() ?? ensureDefaultWorkspace().id,
  );
}
```

- [ ] **Step 7: Write the provider and boot init**

`src/db/provider.tsx`:

```tsx
import { useActiveWorkspaceId } from "@domain/workspaces";
import { createContext, type ReactNode, useContext, useMemo } from "react";
import { type AppDatabase, openWorkspaceDb } from ".";

const DbContext = createContext<AppDatabase>(null as unknown as AppDatabase);

export function DbProvider({ children }: { children: ReactNode }) {
  const workspaceId = useActiveWorkspaceId();
  const db = useMemo(() => openWorkspaceDb(workspaceId), [workspaceId]);
  return <DbContext.Provider value={db}>{children}</DbContext.Provider>;
}

export function useDb(): AppDatabase {
  return useContext(DbContext);
}
```

`src/db/init.ts` — Task 6 adds the seed call here:

```ts
import { ensureDefaultWorkspace } from "@domain/workspaces";
import { openWorkspaceDb } from ".";

/** Run once on startup, before the first render. Returns the active workspace id. */
export async function initWorkspace(): Promise<string> {
  const workspace = ensureDefaultWorkspace();
  const db = openWorkspaceDb(workspace.id);
  await db.open();
  db.close();
  return workspace.id;
}
```

- [ ] **Step 8: Wire the provider into `src/main.tsx`**

Replace the render block at the bottom of `src/main.tsx` with:

```tsx
import { initWorkspace } from "./db/init";
import { DbProvider } from "./db/provider";

initWorkspace().then(() => {
  const root = document.getElementById("root");
  if (!root) throw new Error("Missing #root element");

  createRoot(root).render(
    <StrictMode>
      <DbProvider>
        <App />
      </DbProvider>
    </StrictMode>,
  );
});
```

Keep the existing `import "@i18n";`, the service-worker block, and the stylesheet import above it. Remove the old non-wrapped `createRoot` call so there is exactly one.

- [ ] **Step 9: Verify in the browser**

Run: `yarn dev`, open `http://localhost:3000`, open DevTools → Application → IndexedDB.
Expected: a database named `profs-<uuid>` exists with the seven object stores. The page still renders the header and tagline. Stop the server.

- [ ] **Step 10: Run the validation gate and commit**

```bash
yarn format && yarn lint && yarn typecheck && yarn test
git add -A
git commit -m "feat(db): Dexie schema, workspace registry and provider

One database per workspace; grades keyed on
[gradebookId+columnId+studentId] so a cell edit is a single-row write."
```

---

### Task 6: Seed the demo school

**Files:**
- Create: `src/db/seed.ts`
- Modify: `src/db/init.ts` (call `seedIfEmpty`)
- Test: `src/db/seed.test.ts`

**Interfaces:**
- Consumes: `AppDatabase`, `openWorkspaceDb` from `@db`; row types from `@db/types`.
- Produces: `seedIfEmpty(db: AppDatabase): Promise<boolean>` — returns `true` when it wrote data, `false` when the database already had classes.

- [ ] **Step 1: Write the failing test**

`src/db/seed.test.ts`:

```ts
import "fake-indexeddb/auto";
import { openWorkspaceDb } from ".";
import { seedIfEmpty } from "./seed";

describe("seedIfEmpty", () => {
  it("creates the demo school on an empty database", async () => {
    const db = openWorkspaceDb("seed-empty");
    const seeded = await seedIfEmpty(db);

    expect(seeded).toBe(true);
    expect(await db.classes.count()).toBe(2);
    expect(await db.subjects.count()).toBe(2);
    expect(await db.gradebooks.count()).toBe(2);
    expect(await db.students.count()).toBe(46);
    db.close();
  });

  it("gives every gradebook three periods and at least five columns", async () => {
    const db = openWorkspaceDb("seed-shape");
    await seedIfEmpty(db);

    for (const gradebook of await db.gradebooks.toArray()) {
      const periods = await db.periods.where("gradebookId").equals(gradebook.id).toArray();
      const columns = await db.columns.where("gradebookId").equals(gradebook.id).toArray();
      expect(periods).toHaveLength(3);
      expect(columns.length).toBeGreaterThanOrEqual(5);
      for (const column of columns) {
        expect(periods.some((p) => p.id === column.periodId)).toBe(true);
      }
    }
    db.close();
  });

  it("writes grades that reference real students and columns", async () => {
    const db = openWorkspaceDb("seed-grades");
    await seedIfEmpty(db);

    const grades = await db.grades.toArray();
    expect(grades.length).toBeGreaterThan(0);

    const studentIds = new Set((await db.students.toArray()).map((s) => s.id));
    const columnIds = new Set((await db.columns.toArray()).map((c) => c.id));
    for (const grade of grades) {
      expect(studentIds.has(grade.studentId)).toBe(true);
      expect(columnIds.has(grade.columnId)).toBe(true);
    }
    db.close();
  });

  it("does nothing on a database that already has classes", async () => {
    const db = openWorkspaceDb("seed-twice");
    await seedIfEmpty(db);
    const before = await db.students.count();

    const seededAgain = await seedIfEmpty(db);

    expect(seededAgain).toBe(false);
    expect(await db.students.count()).toBe(before);
    db.close();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test src/db/seed.test.ts`
Expected: FAIL — `Cannot find module './seed'`.

- [ ] **Step 3: Write `src/db/seed.ts`**

```ts
import type { AppDatabase } from ".";
import type { Gradebook, Grade, GradeColumn, Period, Student } from "./types";

/**
 * Demo data so a first-time visitor sees a working gradebook instead of an
 * empty shell. Runs only when the database has no classes.
 */

const LAST_NAMES = [
  "Bernard", "Dubois", "Durand", "Fontaine", "Garnier", "Girard", "Lambert",
  "Leroy", "Martin", "Mercier", "Moreau", "Morel", "Nguyen", "Petit", "Robert",
  "Rousseau", "Roux", "Simon", "Thomas", "Vincent", "Blanc", "Chevalier",
  "Faure", "Perrin",
];

const FIRST_NAMES = [
  "Adam", "Alice", "Camille", "Chloé", "Élise", "Emma", "Gabriel", "Hugo",
  "Inès", "Jade", "Jules", "Léa", "Léo", "Louis", "Lucas", "Maël", "Manon",
  "Marie", "Nathan", "Noah", "Rania", "Sacha", "Théo", "Zoé",
];

const PERIOD_NAMES = ["Trimestre 1", "Trimestre 2", "Trimestre 3"];

/** Deterministic pseudo-random so the demo looks the same on every device. */
function makeRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

export async function seedIfEmpty(db: AppDatabase): Promise<boolean> {
  if ((await db.classes.count()) > 0) return false;

  const now = Date.now();
  const random = makeRandom(20260901);
  const id = () => crypto.randomUUID();

  const classes = [
    { id: id(), name: "3°B", level: "3e", createdAt: now, updatedAt: now },
    { id: id(), name: "5°A", level: "5e", createdAt: now, updatedAt: now },
  ];
  const sizes = [24, 22];

  const subjects = [
    { id: id(), name: "Mathématiques", color: "#2563eb", createdAt: now, updatedAt: now },
    { id: id(), name: "Français", color: "#16a34a", createdAt: now, updatedAt: now },
  ];

  const students: Student[] = [];
  classes.forEach((schoolClass, classIndex) => {
    for (let i = 0; i < sizes[classIndex]; i++) {
      students.push({
        id: id(),
        classId: schoolClass.id,
        lastName: LAST_NAMES[(i + classIndex * 7) % LAST_NAMES.length],
        firstName: FIRST_NAMES[(i * 5 + classIndex * 3) % FIRST_NAMES.length],
        createdAt: now,
        updatedAt: now,
      });
    }
  });

  const gradebooks: Gradebook[] = classes.map((schoolClass, index) => ({
    id: id(),
    classId: schoolClass.id,
    subjectId: subjects[index].id,
    name: `${subjects[index].name} — ${schoolClass.name}`,
    createdAt: now,
    updatedAt: now,
  }));

  const periods: Period[] = [];
  const columns: GradeColumn[] = [];
  const grades: Grade[] = [];

  for (const gradebook of gradebooks) {
    const gradebookPeriods = PERIOD_NAMES.map((name, order) => ({
      id: id(),
      gradebookId: gradebook.id,
      name,
      order,
    }));
    periods.push(...gradebookPeriods);

    // Six columns, all in Trimestre 1, exercising five of the six column types.
    const firstPeriod = gradebookPeriods[0];
    const specs: Array<Pick<GradeColumn, "type" | "label" | "weight" | "max">> = [
      { type: "numeric", label: "DS 1", weight: 2, max: 20 },
      { type: "numeric", label: "DS 2", weight: 2, max: 20 },
      { type: "numeric", label: "Interro", weight: 1, max: 10 },
      { type: "checkbox", label: "Devoir rendu", weight: 1, max: 20 },
      { type: "attendance", label: "Présence", weight: 1, max: 20 },
      { type: "text", label: "Appréciation", weight: 1, max: 20 },
    ];

    const gradebookColumns = specs.map((spec, order) => ({
      id: id(),
      gradebookId: gradebook.id,
      periodId: firstPeriod.id,
      order,
      date: now - (specs.length - order) * 7 * 24 * 60 * 60 * 1000,
      ...spec,
    }));
    columns.push(...gradebookColumns);

    const gradebookStudents = students.filter((s) => s.classId === gradebook.classId);
    for (const student of gradebookStudents) {
      for (const column of gradebookColumns) {
        // Leave roughly one cell in six empty, as a real gradebook has holes.
        if (random() < 0.17) continue;

        if (column.type === "numeric") {
          const mark = Math.round(random() * column.max * 2) / 2;
          grades.push({
            gradebookId: gradebook.id,
            columnId: column.id,
            studentId: student.id,
            value: { type: "numeric", value: mark },
            updatedAt: now,
          });
        } else if (column.type === "checkbox") {
          grades.push({
            gradebookId: gradebook.id,
            columnId: column.id,
            studentId: student.id,
            value: { type: "checkbox", value: random() > 0.2 },
            updatedAt: now,
          });
        } else if (column.type === "attendance") {
          const roll = random();
          const value = roll > 0.9 ? "absent" : roll > 0.82 ? "late" : "present";
          grades.push({
            gradebookId: gradebook.id,
            columnId: column.id,
            studentId: student.id,
            value: { type: "attendance", value },
            updatedAt: now,
          });
        } else if (column.type === "text" && random() > 0.6) {
          grades.push({
            gradebookId: gradebook.id,
            columnId: column.id,
            studentId: student.id,
            value: { type: "text", value: "Travail sérieux, continuez." },
            updatedAt: now,
          });
        }
      }
    }
  }

  await db.transaction(
    "rw",
    [db.classes, db.students, db.subjects, db.gradebooks, db.periods, db.columns, db.grades],
    async () => {
      await db.classes.bulkAdd(classes);
      await db.subjects.bulkAdd(subjects);
      await db.students.bulkAdd(students);
      await db.gradebooks.bulkAdd(gradebooks);
      await db.periods.bulkAdd(periods);
      await db.columns.bulkAdd(columns);
      await db.grades.bulkPut(grades);
    },
  );

  return true;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn test src/db/seed.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Call the seed at boot**

In `src/db/init.ts`, replace the body of `initWorkspace` with:

```ts
import { ensureDefaultWorkspace } from "@domain/workspaces";
import { openWorkspaceDb } from ".";
import { seedIfEmpty } from "./seed";

/** Run once on startup, before the first render. Returns the active workspace id. */
export async function initWorkspace(): Promise<string> {
  const workspace = ensureDefaultWorkspace();
  const db = openWorkspaceDb(workspace.id);
  await seedIfEmpty(db);
  db.close();
  return workspace.id;
}
```

- [ ] **Step 6: Verify in the browser**

Run: `yarn dev`, open the app, DevTools → Application → IndexedDB → `profs-<uuid>`.
Expected: `classes` has 2 rows, `students` 46, `grades` several hundred. Reload the page — counts stay the same (the seed does not re-run). Stop the server.

- [ ] **Step 7: Run the validation gate and commit**

```bash
yarn format && yarn lint && yarn typecheck && yarn test
git add -A
git commit -m "feat(db): seed a demo school on first run

Collège Démo: 3°B and 5°A, Maths and Français gradebooks, three
trimestres, six mixed-type columns, deterministic pseudo-random grades."
```

---

### Task 7: Dashboard — classes and gradebooks

**Files:**
- Create: `src/modules/design-system/components/data-table.tsx`, `src/domain/search.ts`
- Modify: `src/modules/dashboard/page.tsx`, `src/app.tsx`, `src/i18n/locales/fr.json`, `src/i18n/locales/en.json`
- Test: `src/domain/search.test.ts`

**Interfaces:**
- Consumes: `useDb` from `@db/provider`; `Router` from `../../router`.
- Produces: `DataTable<T>` (props: `columns`, `data`, `getRowHref?`, `emptyMessage?`, `globalSearchFields?`, `searchPlaceholder?`, and a new `pinFirstColumn?: boolean`), `fuzzyMatchAny(values, query)`.

`DataTable` is ported from `../open-setlist/src/modules/design-system/components/data-table.tsx`.
Copy that file verbatim, then apply the two changes in Step 3.

- [ ] **Step 1: Write the failing test for the search helper**

`src/domain/search.test.ts`:

```ts
import { fuzzyMatchAny } from "./search";

describe("fuzzyMatchAny", () => {
  it("matches a case-insensitive substring", () => {
    expect(fuzzyMatchAny(["Mathématiques"], "math")).toBe(true);
  });

  it("ignores accents in both the value and the query", () => {
    expect(fuzzyMatchAny(["Mathématiques"], "mathematiques")).toBe(true);
    expect(fuzzyMatchAny(["Mathematiques"], "mathé")).toBe(true);
  });

  it("returns false when nothing matches", () => {
    expect(fuzzyMatchAny(["Français"], "physique")).toBe(false);
  });

  it("skips undefined values", () => {
    expect(fuzzyMatchAny([undefined, "3°B"], "3")).toBe(true);
  });

  it("matches everything on an empty query", () => {
    expect(fuzzyMatchAny(["anything"], "")).toBe(true);
  });
});
```

- [ ] **Step 2: Write `src/domain/search.ts` and run the test**

```ts
/** Accent- and case-insensitive substring search, for list filters. */
function fold(value: string): string {
  return value
    .toLocaleLowerCase("fr")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

export function fuzzyMatchAny(values: (string | undefined)[], query: string): boolean {
  if (query.trim() === "") return true;
  const needle = fold(query);
  return values.some((value) => value !== undefined && fold(value).includes(needle));
}
```

Run: `yarn test src/domain/search.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 3: Port `DataTable` with a pinned-first-column option**

Copy `../open-setlist/src/modules/design-system/components/data-table.tsx` to
`src/modules/design-system/components/data-table.tsx` unchanged, then make exactly
these two edits:

1. Add `pinFirstColumn?: boolean;` to `DataTableProps<T>` and to the destructured
   props.
2. Wrap the `<table>` in a scroll container and pin the first cell of each row
   when the flag is set. Replace the `<table className="w-full text-base md:text-sm">`
   opening tag with:

```tsx
<div className={pinFirstColumn ? "overflow-x-auto" : undefined}>
  <table className="w-full text-base md:text-sm">
```

close the new `</div>` after `</table>`, and add this class expression to the
first `<th>` and first `<td>` of each row (index `0`):

```tsx
pinFirstColumn && ci === 0 ? "sticky left-0 z-10 bg-bg" : ""
```

For the header cells the index variable does not exist yet — change
`hg.headers.map((header) => (` to `hg.headers.map((header, hi) => (` and use `hi`.

- [ ] **Step 4: Build the dashboard page**

`src/modules/dashboard/page.tsx`:

```tsx
import { useDb } from "@db/provider";
import { Link } from "@swan-io/chicane";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";
import { Router } from "../../router";

export function DashboardPage() {
  const { t } = useTranslation();
  const db = useDb();

  const data = useLiveQuery(async () => {
    const [classes, subjects, gradebooks, students] = await Promise.all([
      db.classes.toArray(),
      db.subjects.toArray(),
      db.gradebooks.toArray(),
      db.students.toArray(),
    ]);
    return { classes, subjects, gradebooks, students };
  }, [db]);

  if (!data) return <p className="text-text-muted">{t("common.loading")}</p>;

  const subjectName = (id: string) => data.subjects.find((s) => s.id === id)?.name ?? "";
  const className = (id: string) => data.classes.find((c) => c.id === id)?.name ?? "";
  const headcount = (classId: string) =>
    data.students.filter((s) => s.classId === classId).length;

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="font-semibold text-lg">{t("dashboard.classes")}</h2>
        {data.classes.length === 0 ? (
          <p className="text-text-muted">{t("dashboard.noClasses")}</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {data.classes.map((schoolClass) => (
              <li key={schoolClass.id}>
                <Link
                  to={Router.Class({ classId: schoolClass.id })}
                  className="block rounded border border-border p-3 hover:bg-bg-hover"
                >
                  <span className="font-medium">{schoolClass.name}</span>
                  <span className="ml-2 text-sm text-text-muted">
                    {t("dashboard.studentCount", { count: headcount(schoolClass.id) })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold text-lg">{t("dashboard.gradebooks")}</h2>
        {data.gradebooks.length === 0 ? (
          <p className="text-text-muted">{t("dashboard.noGradebooks")}</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {data.gradebooks.map((gradebook) => (
              <li key={gradebook.id}>
                <Link
                  to={Router.Gradebook({ gradebookId: gradebook.id })}
                  className="block rounded border border-border p-3 hover:bg-bg-hover"
                >
                  <span className="font-medium">{subjectName(gradebook.subjectId)}</span>
                  <span className="ml-2 text-sm text-text-muted">
                    {className(gradebook.classId)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 5: Add the translation keys**

Add to `src/i18n/locales/fr.json`:

```json
{
  "common": { "loading": "Chargement…" },
  "dashboard": {
    "classes": "Mes classes",
    "gradebooks": "Mes carnets de notes",
    "noClasses": "Aucune classe pour l'instant",
    "noGradebooks": "Aucun carnet de notes pour l'instant",
    "studentCount": "{{count}} élève",
    "studentCount_other": "{{count}} élèves"
  }
}
```

Merge `common.loading` into the existing `common` object rather than creating a
second one. Mirror in `en.json`:

```json
{
  "common": { "loading": "Loading…" },
  "dashboard": {
    "classes": "My classes",
    "gradebooks": "My gradebooks",
    "noClasses": "No classes yet",
    "noGradebooks": "No gradebooks yet",
    "studentCount": "{{count}} student",
    "studentCount_other": "{{count}} students"
  }
}
```

Note: the parity test compares key sets, and `studentCount_other` exists in both,
so it passes.

- [ ] **Step 6: Verify in the browser**

Run: `yarn dev`, open `http://localhost:3000`.
Expected: "Mes classes" lists 3°B (24 élèves) and 5°A (22 élèves); "Mes carnets de notes" lists Mathématiques 3°B and Français 5°A. Clicking a class navigates to `/classes/<id>` without a reload. Stop the server.

- [ ] **Step 7: Run the validation gate and commit**

```bash
yarn format && yarn lint && yarn typecheck && yarn test
git add -A
git commit -m "feat(dashboard): list classes and gradebooks

Ports DataTable from open-setlist with a pinned-first-column option for
the grid, and adds accent-insensitive search."
```

---

### Task 8: Class page — roster CRUD

**Files:**
- Create: `src/modules/class/page.tsx`, `src/modules/class/components/student-form.tsx`
- Modify: `src/app.tsx` (route `Class` → `ClassPage`), `src/i18n/locales/{fr,en}.json`

**Interfaces:**
- Consumes: `useDb`, `DataTable`, `Router`, `Student` type from `@db`.
- Produces: `ClassPage({ classId }: { classId: string })`, `StudentForm` (props: `classId`, `student?`, `onDone`).

- [ ] **Step 1: Write the student form**

`src/modules/class/components/student-form.tsx`:

```tsx
import { useDb } from "@db/provider";
import type { Student } from "@db";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

const schema = z.object({
  lastName: z.string().trim().min(1),
  firstName: z.string().trim(),
  notes: z.string().trim(),
});

type FormValues = z.infer<typeof schema>;

export function StudentForm({
  classId,
  student,
  onDone,
}: {
  classId: string;
  student?: Student;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const db = useDb();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      lastName: student?.lastName ?? "",
      firstName: student?.firstName ?? "",
      notes: student?.notes ?? "",
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    const now = Date.now();
    if (student) {
      await db.students.update(student.id, { ...values, updatedAt: now });
    } else {
      await db.students.add({
        id: crypto.randomUUID(),
        classId,
        lastName: values.lastName,
        firstName: values.firstName,
        notes: values.notes,
        createdAt: now,
        updatedAt: now,
      });
    }
    onDone();
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded border border-border p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-sm text-text-muted">{t("student.lastName")}</span>
          <input className="field" {...register("lastName")} />
          {errors.lastName && (
            <span className="text-danger text-sm">{t("student.lastNameRequired")}</span>
          )}
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-text-muted">{t("student.firstName")}</span>
          <input className="field" {...register("firstName")} />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-text-muted">{t("student.notes")}</span>
        <textarea className="field" rows={2} {...register("notes")} />
      </label>
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
          {t("common.save")}
        </button>
        <button type="button" className="btn" onClick={onDone}>
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Write the class page**

`src/modules/class/page.tsx`:

```tsx
import type { Student } from "@db";
import { useDb } from "@db/provider";
import { createColumnHelper } from "@tanstack/react-table";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { DataTable } from "../design-system/components/data-table";
import { StudentForm } from "./components/student-form";

const helper = createColumnHelper<Student>();

export function ClassPage({ classId }: { classId: string }) {
  const { t } = useTranslation();
  const db = useDb();
  const [editing, setEditing] = useState<Student | "new" | null>(null);

  const schoolClass = useLiveQuery(() => db.classes.get(classId), [db, classId]);
  const students = useLiveQuery(
    () => db.students.where("classId").equals(classId).sortBy("lastName"),
    [db, classId],
  );

  const columns = useMemo(
    () => [
      helper.accessor("lastName", { header: () => t("student.lastName") }),
      helper.accessor("firstName", { header: () => t("student.firstName") }),
      helper.display({
        id: "actions",
        header: () => "",
        cell: (info) => (
          <div className="flex gap-2">
            <button type="button" className="btn" onClick={() => setEditing(info.row.original)}>
              {t("common.edit")}
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={async () => {
                const student = info.row.original;
                await db.transaction("rw", [db.students, db.grades], async () => {
                  await db.grades.where("studentId").equals(student.id).delete();
                  await db.students.delete(student.id);
                });
              }}
            >
              {t("common.delete")}
            </button>
          </div>
        ),
      }),
    ],
    [t, db],
  );

  if (!schoolClass || !students) return <p className="text-text-muted">{t("common.loading")}</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-lg">{schoolClass.name}</h2>
        <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>
          {t("class.addStudent")}
        </button>
      </div>

      {editing === "new" && <StudentForm classId={classId} onDone={() => setEditing(null)} />}
      {editing && editing !== "new" && (
        <StudentForm classId={classId} student={editing} onDone={() => setEditing(null)} />
      )}

      <DataTable
        columns={columns}
        data={students}
        globalSearchFields={["lastName", "firstName"]}
        emptyMessage={t("class.noStudents")}
      />
    </div>
  );
}
```

Note the delete path removes the student's grades in the same transaction — an
orphaned grade would silently distort a later average.

- [ ] **Step 3: Route to the page**

In `src/app.tsx`, import `ClassPage` and replace the `case "Class":` arm:

```tsx
    case "Class":
      return <ClassPage classId={route.params.classId} />;
```

- [ ] **Step 4: Add translation keys**

`fr.json` (merge into the existing objects):

```json
{
  "common": { "edit": "Modifier" },
  "student": {
    "lastName": "Nom",
    "firstName": "Prénom",
    "notes": "Remarques",
    "lastNameRequired": "Le nom est obligatoire"
  },
  "class": {
    "addStudent": "Ajouter un élève",
    "noStudents": "Aucun élève dans cette classe"
  }
}
```

`en.json`:

```json
{
  "common": { "edit": "Edit" },
  "student": {
    "lastName": "Last name",
    "firstName": "First name",
    "notes": "Notes",
    "lastNameRequired": "Last name is required"
  },
  "class": {
    "addStudent": "Add student",
    "noStudents": "No students in this class"
  }
}
```

- [ ] **Step 5: Verify in the browser**

Run: `yarn dev`, click 3°B from the dashboard.
Expected: 24 students sorted by last name; search filters live; "Ajouter un élève" adds a row that appears immediately; edit renames a student; delete removes them. Reload — changes persist. Stop the server.

- [ ] **Step 6: Run the validation gate and commit**

```bash
yarn format && yarn lint && yarn typecheck && yarn test
git add -A
git commit -m "feat(class): roster listing and student CRUD

Deleting a student removes their grades in the same transaction so no
orphaned cell can distort an average."
```

---

### Task 9: CSV roster import UI

**Files:**
- Create: `src/modules/class/components/csv-import.tsx`
- Modify: `src/modules/class/page.tsx` (mount the importer), `src/i18n/locales/{fr,en}.json`

**Interfaces:**
- Consumes: `sniffDelimiter`, `parseCsv`, `extractRoster`, `findDuplicates`, `RosterRow` from `@domain/gradebook/csv`; `useDb`.
- Produces: `CsvImport({ classId, existing, onDone }: { classId: string; existing: RosterRow[]; onDone: () => void })`.

Flow: paste or choose a file → sniffed delimiter and column mapping shown and
overridable → preview table with duplicates flagged → confirm imports the
non-excluded rows in one `bulkAdd`.

- [ ] **Step 1: Write the importer component**

`src/modules/class/components/csv-import.tsx`:

```tsx
import {
  type Delimiter,
  extractRoster,
  findDuplicates,
  parseCsv,
  type RosterRow,
  sniffDelimiter,
} from "@domain/gradebook/csv";
import { useDb } from "@db/provider";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

const DELIMITER_LABELS: Record<Delimiter, string> = {
  ";": "point-virgule ( ; )",
  ",": "virgule ( , )",
  "\t": "tabulation",
};

export function CsvImport({
  classId,
  existing,
  onDone,
}: {
  classId: string;
  existing: RosterRow[];
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const db = useDb();

  const [text, setText] = useState("");
  const [delimiter, setDelimiter] = useState<Delimiter | null>(null);
  const [lastNameCol, setLastNameCol] = useState(0);
  const [firstNameCol, setFirstNameCol] = useState(1);
  const [skipFirstRow, setSkipFirstRow] = useState(true);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());

  const effectiveDelimiter = delimiter ?? (text ? sniffDelimiter(text) : ",");

  const rows = useMemo(
    () => (text.trim() === "" ? [] : parseCsv(text, effectiveDelimiter)),
    [text, effectiveDelimiter],
  );

  const roster = useMemo(
    () => extractRoster(rows, { lastName: lastNameCol, firstName: firstNameCol, skipFirstRow }),
    [rows, lastNameCol, firstNameCol, skipFirstRow],
  );

  const duplicates = useMemo(() => new Set(findDuplicates(roster, existing)), [roster, existing]);

  const columnCount = rows[0]?.length ?? 0;
  const columnOptions = Array.from({ length: columnCount }, (_, i) => i);

  async function onFile(file: File): Promise<void> {
    setText(await file.text());
    setDelimiter(null);
    setExcluded(new Set());
  }

  async function onImport(): Promise<void> {
    const now = Date.now();
    const toAdd = roster
      .filter((_, index) => !excluded.has(index))
      .map((row) => ({
        id: crypto.randomUUID(),
        classId,
        lastName: row.lastName,
        firstName: row.firstName,
        createdAt: now,
        updatedAt: now,
      }));
    await db.students.bulkAdd(toAdd);
    onDone();
  }

  return (
    <div className="flex flex-col gap-3 rounded border border-border p-3">
      <h3 className="font-medium">{t("csv.title")}</h3>

      <textarea
        className="field font-mono text-sm"
        rows={5}
        placeholder={t("csv.pastePlaceholder")}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setDelimiter(null);
          setExcluded(new Set());
        }}
      />

      <input
        type="file"
        accept=".csv,.txt,text/csv,text/plain"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void onFile(file);
        }}
      />

      {rows.length > 0 && (
        <>
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-sm text-text-muted">{t("csv.delimiter")}</span>
              <select
                className="field"
                value={effectiveDelimiter}
                onChange={(e) => setDelimiter(e.target.value as Delimiter)}
              >
                {(Object.keys(DELIMITER_LABELS) as Delimiter[]).map((d) => (
                  <option key={d} value={d}>
                    {DELIMITER_LABELS[d]}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm text-text-muted">{t("csv.lastNameColumn")}</span>
              <select
                className="field"
                value={lastNameCol}
                onChange={(e) => setLastNameCol(Number(e.target.value))}
              >
                {columnOptions.map((i) => (
                  <option key={i} value={i}>
                    {t("csv.columnN", { n: i + 1 })} — {rows[0][i]}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm text-text-muted">{t("csv.firstNameColumn")}</span>
              <select
                className="field"
                value={firstNameCol}
                onChange={(e) => setFirstNameCol(Number(e.target.value))}
              >
                {columnOptions.map((i) => (
                  <option key={i} value={i}>
                    {t("csv.columnN", { n: i + 1 })} — {rows[0][i]}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-2 self-end">
              <input
                type="checkbox"
                checked={skipFirstRow}
                onChange={(e) => setSkipFirstRow(e.target.checked)}
              />
              <span className="text-sm">{t("csv.skipHeader")}</span>
            </label>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-border border-b text-left">
                <th className="px-2 py-1" />
                <th className="px-2 py-1">{t("student.lastName")}</th>
                <th className="px-2 py-1">{t("student.firstName")}</th>
                <th className="px-2 py-1">{t("csv.status")}</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((row, index) => (
                <tr key={`${row.lastName}-${row.firstName}-${index}`} className="border-border/50 border-b">
                  <td className="px-2 py-1">
                    <input
                      type="checkbox"
                      checked={!excluded.has(index)}
                      onChange={(e) => {
                        const next = new Set(excluded);
                        if (e.target.checked) next.delete(index);
                        else next.add(index);
                        setExcluded(next);
                      }}
                    />
                  </td>
                  <td className="px-2 py-1">{row.lastName}</td>
                  <td className="px-2 py-1">{row.firstName}</td>
                  <td className="px-2 py-1">
                    {duplicates.has(index) ? (
                      <span className="text-danger">{t("csv.duplicate")}</span>
                    ) : (
                      <span className="text-success">{t("csv.new")}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="text-sm text-text-muted">
            {t("csv.summary", {
              count: roster.length - excluded.size,
              duplicates: duplicates.size,
            })}
          </p>
        </>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          className="btn btn-primary"
          disabled={roster.length === 0 || roster.length === excluded.size}
          onClick={() => void onImport()}
        >
          {t("csv.import")}
        </button>
        <button type="button" className="btn" onClick={onDone}>
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );
}
```

Duplicates are pre-checked for import, not auto-excluded — the teacher decides,
because two students really can share a name. Unticking a row excludes it.

- [ ] **Step 2: Mount the importer on the class page**

In `src/modules/class/page.tsx`, add `const [importing, setImporting] = useState(false);`,
add a second header button, and render the component:

```tsx
        <button type="button" className="btn" onClick={() => setImporting(true)}>
          {t("class.importCsv")}
        </button>
```

```tsx
      {importing && (
        <CsvImport
          classId={classId}
          existing={students.map((s) => ({ lastName: s.lastName, firstName: s.firstName }))}
          onDone={() => setImporting(false)}
        />
      )}
```

Place the render block directly above the `<DataTable>` and import `CsvImport`
from `./components/csv-import`.

- [ ] **Step 3: Add translation keys**

`fr.json`:

```json
{
  "class": { "importCsv": "Importer un CSV" },
  "csv": {
    "title": "Importer une liste d'élèves",
    "pastePlaceholder": "Collez ici votre liste (Nom;Prénom)",
    "delimiter": "Séparateur",
    "lastNameColumn": "Colonne du nom",
    "firstNameColumn": "Colonne du prénom",
    "columnN": "Colonne {{n}}",
    "skipHeader": "La première ligne est un en-tête",
    "status": "État",
    "duplicate": "Doublon",
    "new": "Nouveau",
    "summary": "{{count}} élève(s) à importer, {{duplicates}} doublon(s) détecté(s)",
    "import": "Importer"
  }
}
```

`en.json`:

```json
{
  "class": { "importCsv": "Import CSV" },
  "csv": {
    "title": "Import a student list",
    "pastePlaceholder": "Paste your list here (Last name;First name)",
    "delimiter": "Delimiter",
    "lastNameColumn": "Last name column",
    "firstNameColumn": "First name column",
    "columnN": "Column {{n}}",
    "skipHeader": "First row is a header",
    "status": "Status",
    "duplicate": "Duplicate",
    "new": "New",
    "summary": "{{count}} student(s) to import, {{duplicates}} duplicate(s) found",
    "import": "Import"
  }
}
```

The `DELIMITER_LABELS` map in Step 1 holds French text outside `t()`. Replace its
values with `t("csv.delimiterSemicolon")`, `t("csv.delimiterComma")`,
`t("csv.delimiterTab")` by moving the map inside the component, and add those three
keys to both catalogues: `"Point-virgule ( ; )"` / `"Semicolon ( ; )"`,
`"Virgule ( , )"` / `"Comma ( , )"`, `"Tabulation"` / `"Tab"`.

- [ ] **Step 4: Verify in the browser**

Run: `yarn dev`, open 3°B, click "Importer un CSV", paste:

```
Nom;Prénom
Dupont;Marie
Bernard;Adam
Nguyen;Léa
```

Expected: delimiter detected as semicolon; header row skipped; three rows previewed; any name already in 3°B flagged "Doublon". Importing adds the ticked rows to the table immediately. Stop the server.

- [ ] **Step 5: Run the validation gate and commit**

```bash
yarn format && yarn lint && yarn typecheck && yarn test
git add -A
git commit -m "feat(class): CSV roster import with mapping and duplicate preview

Delimiter sniffed and overridable, column mapping chosen by the teacher,
duplicates flagged but never merged silently."
```

---

### Task 10: The gradebook grid

**Files:**
- Create: `src/modules/gradebook/page.tsx`, `src/modules/design-system/components/editable-cell.tsx`, `src/modules/design-system/components/column-type-icon.tsx`, `src/modules/gradebook/components/column-form.tsx`
- Modify: `src/app.tsx`, `src/i18n/locales/{fr,en}.json`

**Interfaces:**
- Consumes: `useDb`, `gradeKey`, `parseGradeValue`, `formatGradeValue`, `COLUMN_TYPES`, `ATTENDANCE_VALUES`, `Router`.
- Produces:
  - `EditableCell` — props `{ type: ColumnType; max: number; value: GradeValue | undefined; onChange: (next: GradeValue | null) => void }`
  - `ColumnTypeIcon` — props `{ type: ColumnType }`
  - `ColumnForm` — props `{ gradebookId: string; periodId: string; column?: GradeColumn; onDone: () => void }`
  - `GradebookPage` — props `{ gradebookId: string }`

- [ ] **Step 1: Write the column type icon**

`src/modules/design-system/components/column-type-icon.tsx`:

```tsx
import type { ColumnType } from "@domain/gradebook/column";

const GLYPHS: Record<ColumnType, string> = {
  numeric: "#",
  letter: "A",
  icon: "★",
  checkbox: "☑",
  text: "¶",
  attendance: "◷",
};

export function ColumnTypeIcon({ type }: { type: ColumnType }) {
  return (
    <span aria-hidden="true" className="text-text-faint">
      {GLYPHS[type]}
    </span>
  );
}
```

- [ ] **Step 2: Write the editable cell**

`src/modules/design-system/components/editable-cell.tsx`:

```tsx
import { ATTENDANCE_VALUES, type ColumnType } from "@domain/gradebook/column";
import { formatGradeValue, type GradeValue, parseGradeValue } from "@domain/gradebook/grade";
import { useEffect, useRef, useState } from "react";

/**
 * One grid cell. Click (or focus + Enter) turns it into the editor its column
 * type calls for. Escape cancels, Enter and blur commit. `onChange(null)`
 * means "clear this cell".
 */
export function EditableCell({
  type,
  max,
  value,
  onChange,
}: {
  type: ColumnType;
  max: number;
  value: GradeValue | undefined;
  onChange: (next: GradeValue | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  if (type === "checkbox") {
    const checked = value?.type === "checkbox" ? value.value : false;
    return (
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange({ type: "checkbox", value: e.target.checked })}
      />
    );
  }

  if (type === "attendance") {
    const current = value?.type === "attendance" ? value.value : "";
    return (
      <select
        className="w-full bg-transparent"
        value={current}
        onChange={(e) => onChange(parseGradeValue("attendance", e.target.value))}
      >
        <option value="">—</option>
        {ATTENDANCE_VALUES.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    );
  }

  if (!editing) {
    return (
      <button
        type="button"
        className="w-full text-left tabular-nums"
        onClick={() => {
          setDraft(value === undefined ? "" : rawText(value));
          setEditing(true);
        }}
      >
        {value === undefined ? (
          <span className="text-text-faint">—</span>
        ) : (
          formatGradeValue(value, type === "numeric" ? max : undefined)
        )}
      </button>
    );
  }

  const commit = () => {
    onChange(parseGradeValue(type, draft));
    setEditing(false);
  };

  return (
    <input
      ref={inputRef}
      className="w-full bg-transparent tabular-nums outline-none"
      inputMode={type === "numeric" ? "decimal" : "text"}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setEditing(false);
      }}
    />
  );
}

/** The editable text behind a stored value — no "/20" suffix, no ✓/✗. */
function rawText(value: GradeValue): string {
  switch (value.type) {
    case "numeric":
      return String(value.value).replace(".", ",");
    case "checkbox":
      return value.value ? "true" : "false";
    default:
      return value.value;
  }
}
```

- [ ] **Step 3: Write the column form**

`src/modules/gradebook/components/column-form.tsx`:

```tsx
import { COLUMN_TYPES, type ColumnType } from "@domain/gradebook/column";
import type { GradeColumn } from "@db";
import { useDb } from "@db/provider";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export function ColumnForm({
  gradebookId,
  periodId,
  column,
  onDone,
}: {
  gradebookId: string;
  periodId: string;
  column?: GradeColumn;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const db = useDb();
  const [label, setLabel] = useState(column?.label ?? "");
  const [type, setType] = useState<ColumnType>(column?.type ?? "numeric");
  const [weight, setWeight] = useState(String(column?.weight ?? 1));
  const [max, setMax] = useState(String(column?.max ?? 20));

  async function save(): Promise<void> {
    const parsedWeight = Number(weight.replace(",", ".")) || 1;
    const parsedMax = Number(max.replace(",", ".")) || 20;

    if (column) {
      await db.columns.update(column.id, { label, type, weight: parsedWeight, max: parsedMax });
    } else {
      const siblings = await db.columns.where("gradebookId").equals(gradebookId).count();
      await db.columns.add({
        id: crypto.randomUUID(),
        gradebookId,
        periodId,
        type,
        label: label || t("gradebook.untitledColumn"),
        weight: parsedWeight,
        max: parsedMax,
        order: siblings,
        date: Date.now(),
      });
    }
    onDone();
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded border border-border p-3">
      <label className="flex flex-col gap-1">
        <span className="text-sm text-text-muted">{t("gradebook.columnLabel")}</span>
        <input className="field" value={label} onChange={(e) => setLabel(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-text-muted">{t("gradebook.columnType")}</span>
        <select
          className="field"
          value={type}
          onChange={(e) => setType(e.target.value as ColumnType)}
        >
          {COLUMN_TYPES.map((value) => (
            <option key={value} value={value}>
              {t(`gradebook.type.${value}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-text-muted">{t("gradebook.weight")}</span>
        <input
          className="field"
          inputMode="decimal"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
        />
      </label>
      {type === "numeric" && (
        <label className="flex flex-col gap-1">
          <span className="text-sm text-text-muted">{t("gradebook.max")}</span>
          <input
            className="field"
            inputMode="decimal"
            value={max}
            onChange={(e) => setMax(e.target.value)}
          />
        </label>
      )}
      <button type="button" className="btn btn-primary" onClick={() => void save()}>
        {t("common.save")}
      </button>
      <button type="button" className="btn" onClick={onDone}>
        {t("common.cancel")}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Write the gradebook page**

`src/modules/gradebook/page.tsx`:

```tsx
import type { Grade, GradeColumn, Student } from "@db";
import { gradeKey } from "@db";
import { useDb } from "@db/provider";
import type { GradeValue } from "@domain/gradebook/grade";
import { Link } from "@swan-io/chicane";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Router } from "../../router";
import { ColumnTypeIcon } from "../design-system/components/column-type-icon";
import { EditableCell } from "../design-system/components/editable-cell";
import { ColumnForm } from "./components/column-form";

export function GradebookPage({ gradebookId }: { gradebookId: string }) {
  const { t } = useTranslation();
  const db = useDb();
  const [periodId, setPeriodId] = useState<string | null>(null);
  const [addingColumn, setAddingColumn] = useState(false);

  const data = useLiveQuery(async () => {
    const gradebook = await db.gradebooks.get(gradebookId);
    if (!gradebook) return null;
    const [periods, columns, students, grades] = await Promise.all([
      db.periods.where("gradebookId").equals(gradebookId).sortBy("order"),
      db.columns.where("gradebookId").equals(gradebookId).sortBy("order"),
      db.students.where("classId").equals(gradebook.classId).sortBy("lastName"),
      db.grades.where("gradebookId").equals(gradebookId).toArray(),
    ]);
    return { gradebook, periods, columns, students, grades };
  }, [db, gradebookId]);

  if (data === undefined) return <p className="text-text-muted">{t("common.loading")}</p>;
  if (data === null) return <p className="text-text-muted">{t("gradebook.notFound")}</p>;

  const activePeriodId = periodId ?? data.periods[0]?.id ?? "";
  const columns = data.columns.filter((c) => c.periodId === activePeriodId);
  const gradeMap = new Map<string, Grade>(
    data.grades.map((g) => [`${g.columnId}|${g.studentId}`, g]),
  );

  async function writeGrade(
    column: GradeColumn,
    student: Student,
    next: GradeValue | null,
  ): Promise<void> {
    if (next === null) {
      await db.grades.delete(gradeKey(gradebookId, column.id, student.id));
      return;
    }
    await db.grades.put({
      gradebookId,
      columnId: column.id,
      studentId: student.id,
      value: next,
      updatedAt: Date.now(),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-lg">{data.gradebook.name}</h2>
        <div className="flex items-center gap-2">
          <select
            className="field"
            value={activePeriodId}
            onChange={(e) => setPeriodId(e.target.value)}
          >
            {data.periods.map((period) => (
              <option key={period.id} value={period.id}>
                {period.name}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-primary" onClick={() => setAddingColumn(true)}>
            {t("gradebook.addColumn")}
          </button>
        </div>
      </div>

      {addingColumn && (
        <ColumnForm
          gradebookId={gradebookId}
          periodId={activePeriodId}
          onDone={() => setAddingColumn(false)}
        />
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-border border-b text-left">
              <th className="sticky left-0 z-10 bg-bg px-3 py-2">{t("student.lastName")}</th>
              {columns.map((column) => (
                <th key={column.id} className="min-w-24 px-3 py-2 text-center font-medium">
                  <Link
                    to={Router.Entry({ gradebookId, columnId: column.id })}
                    className="flex flex-col items-center hover:text-accent"
                  >
                    <span className="flex items-center gap-1">
                      <ColumnTypeIcon type={column.type} />
                      {column.label}
                    </span>
                    <span className="text-text-faint text-xs">
                      {t("gradebook.coef", { weight: column.weight })}
                    </span>
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.students.map((student) => (
              <tr key={student.id} className="border-border/50 border-b">
                <td className="sticky left-0 z-10 whitespace-nowrap bg-bg px-3 py-2">
                  {student.lastName} {student.firstName}
                </td>
                {columns.map((column) => (
                  <td key={column.id} className="px-3 py-2 text-center">
                    <EditableCell
                      type={column.type}
                      max={column.max}
                      value={gradeMap.get(`${column.id}|${student.id}`)?.value}
                      onChange={(next) => void writeGrade(column, student, next)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {columns.length === 0 && <p className="text-text-muted">{t("gradebook.noColumns")}</p>}
    </div>
  );
}
```

- [ ] **Step 5: Route to the page and add keys**

In `src/app.tsx`:

```tsx
    case "Gradebook":
      return <GradebookPage gradebookId={route.params.gradebookId} />;
```

`fr.json`:

```json
{
  "gradebook": {
    "addColumn": "Ajouter une colonne",
    "columnLabel": "Intitulé",
    "columnType": "Type",
    "weight": "Coefficient",
    "max": "Barème",
    "coef": "coef {{weight}}",
    "noColumns": "Aucune colonne pour cette période",
    "notFound": "Carnet introuvable",
    "untitledColumn": "Sans titre",
    "type": {
      "numeric": "Note chiffrée",
      "letter": "Lettre",
      "icon": "Icône",
      "checkbox": "Case à cocher",
      "text": "Texte",
      "attendance": "Présence"
    }
  }
}
```

`en.json`:

```json
{
  "gradebook": {
    "addColumn": "Add column",
    "columnLabel": "Label",
    "columnType": "Type",
    "weight": "Weight",
    "max": "Out of",
    "coef": "×{{weight}}",
    "noColumns": "No columns in this period",
    "notFound": "Gradebook not found",
    "untitledColumn": "Untitled",
    "type": {
      "numeric": "Numeric grade",
      "letter": "Letter",
      "icon": "Icon",
      "checkbox": "Checkbox",
      "text": "Text",
      "attendance": "Attendance"
    }
  }
}
```

- [ ] **Step 6: Verify in the browser, desktop and mobile**

Run: `yarn dev`, open Mathématiques 3°B.
Expected desktop: 24 rows, six columns, seeded grades visible as `14,5/20`. Clicking a numeric cell turns it into an input; typing `11,5` and pressing Enter persists it (reload to confirm). Escape cancels. Clearing a cell and pressing Enter shows `—`. The checkbox and attendance columns edit in place.
Expected mobile (DevTools device toolbar, iPhone SE 375px): the name column stays pinned while the grade columns scroll horizontally; the page itself does not scroll sideways. Stop the server.

- [ ] **Step 7: Run the validation gate and commit**

```bash
yarn format && yarn lint && yarn typecheck && yarn test
git add -A
git commit -m "feat(gradebook): editable grid with pinned name column

Per-type cell editors, period switcher, column creation, and column
headers that link to the fast-entry route."
```

---

### Task 11: Averages and class statistics in the grid

**Files:**
- Modify: `src/modules/gradebook/page.tsx`, `src/i18n/locales/{fr,en}.json`

**Interfaces:**
- Consumes: `studentAverage`, `classStats`, `AverageColumn`, `AverageGrade` from `@domain/gradebook/average`.
- Produces: no new exported symbols — the grid gains a trailing "Moyenne" column and a statistics strip.

- [ ] **Step 1: Compute the averages in the page**

In `src/modules/gradebook/page.tsx`, after `gradeMap` is built, add:

```tsx
  const averageColumns: AverageColumn[] = data.columns.map((c) => ({
    id: c.id,
    type: c.type,
    weight: c.weight,
    max: c.max,
    periodId: c.periodId,
  }));

  const gradesByStudent = new Map<string, AverageGrade[]>();
  for (const grade of data.grades) {
    const list = gradesByStudent.get(grade.studentId) ?? [];
    list.push({ columnId: grade.columnId, value: grade.value });
    gradesByStudent.set(grade.studentId, list);
  }

  const averages = new Map<string, number | null>(
    data.students.map((student) => [
      student.id,
      studentAverage(gradesByStudent.get(student.id) ?? [], averageColumns, activePeriodId),
    ]),
  );

  const stats = classStats(
    [...averages.values()].filter((value): value is number => value !== null),
  );
```

Import `classStats`, `studentAverage`, and the two types from `@domain/gradebook/average`.

- [ ] **Step 2: Render the average column**

Add a trailing header cell after the `columns.map(...)` inside `<thead>`:

```tsx
              <th className="min-w-20 px-3 py-2 text-center font-medium">
                {t("gradebook.average")}
              </th>
```

and a trailing body cell after the `columns.map(...)` inside each `<tr>`:

```tsx
                <td className="px-3 py-2 text-center font-medium tabular-nums">
                  {averages.get(student.id) === null || averages.get(student.id) === undefined ? (
                    <span className="text-text-faint">—</span>
                  ) : (
                    `${String(averages.get(student.id)).replace(".", ",")}/20`
                  )}
                </td>
```

- [ ] **Step 3: Render the class statistics strip**

Directly below the closing `</table>`'s wrapper `</div>`, add:

```tsx
      {stats && (
        <dl className="flex flex-wrap gap-6 rounded border border-border p-3 text-sm">
          <div>
            <dt className="text-text-muted">{t("gradebook.stats.mean")}</dt>
            <dd className="font-medium tabular-nums">{String(stats.mean).replace(".", ",")}</dd>
          </div>
          <div>
            <dt className="text-text-muted">{t("gradebook.stats.median")}</dt>
            <dd className="font-medium tabular-nums">{String(stats.median).replace(".", ",")}</dd>
          </div>
          <div>
            <dt className="text-text-muted">{t("gradebook.stats.min")}</dt>
            <dd className="font-medium tabular-nums">{String(stats.min).replace(".", ",")}</dd>
          </div>
          <div>
            <dt className="text-text-muted">{t("gradebook.stats.max")}</dt>
            <dd className="font-medium tabular-nums">{String(stats.max).replace(".", ",")}</dd>
          </div>
          <div>
            <dt className="text-text-muted">{t("gradebook.stats.count")}</dt>
            <dd className="font-medium tabular-nums">{stats.count}</dd>
          </div>
        </dl>
      )}
```

- [ ] **Step 4: Add translation keys**

`fr.json` under `gradebook`:

```json
{
  "average": "Moyenne",
  "stats": {
    "mean": "Moyenne de classe",
    "median": "Médiane",
    "min": "Minimum",
    "max": "Maximum",
    "count": "Élèves notés"
  }
}
```

`en.json` under `gradebook`:

```json
{
  "average": "Average",
  "stats": {
    "mean": "Class average",
    "median": "Median",
    "min": "Lowest",
    "max": "Highest",
    "count": "Students graded"
  }
}
```

- [ ] **Step 5: Verify the arithmetic against the UI**

Run: `yarn dev`, open Mathématiques 3°B.
Expected: every student shows an average out of 20 in the last column; a student with no numeric grade shows `—`. Pick one student, hand-compute their average from the visible marks (remember DS 1 and DS 2 are coefficient 2, Interro is coefficient 1 out of 10, so an 8/10 counts as 16/20) and confirm the displayed figure matches. Editing one mark updates both the row average and the statistics strip immediately. Switching period recomputes. Stop the server.

- [ ] **Step 6: Run the validation gate and commit**

```bash
yarn format && yarn lint && yarn typecheck && yarn test
git add -A
git commit -m "feat(gradebook): per-student averages and class statistics

Averages are computed on read from the tested domain functions, scoped
to the active period, and refresh live as cells change."
```

---

### Task 12: Fast entry mode (saisie rapide)

**Files:**
- Create: `src/modules/entry/page.tsx`, `src/modules/design-system/components/number-pad.tsx`
- Modify: `src/app.tsx`, `src/i18n/locales/{fr,en}.json`

**Interfaces:**
- Consumes: `useDb`, `gradeKey`, `parseGradeValue`, `formatGradeValue`, `Router`.
- Produces: `NumberPad` — props `{ onDigit: (d: string) => void; onDecimal: () => void; onBackspace: () => void; onNext: () => void }`; `EntryPage` — props `{ gradebookId: string; columnId: string }`.

- [ ] **Step 1: Write the number pad**

`src/modules/design-system/components/number-pad.tsx`:

```tsx
import { useTranslation } from "react-i18next";

const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

/** Thumb-sized keypad for grading on a phone without the OS keyboard. */
export function NumberPad({
  onDigit,
  onDecimal,
  onBackspace,
  onNext,
}: {
  onDigit: (digit: string) => void;
  onDecimal: () => void;
  onBackspace: () => void;
  onNext: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-3 gap-2">
      {DIGITS.slice(0, 9).map((digit) => (
        <button key={digit} type="button" className="btn py-4 text-lg" onClick={() => onDigit(digit)}>
          {digit}
        </button>
      ))}
      <button type="button" className="btn py-4 text-lg" onClick={onDecimal}>
        ,
      </button>
      <button type="button" className="btn py-4 text-lg" onClick={() => onDigit("0")}>
        0
      </button>
      <button type="button" className="btn py-4 text-lg" onClick={onBackspace}>
        ⌫
      </button>
      <button
        type="button"
        className="btn btn-primary col-span-3 py-4 text-lg"
        onClick={onNext}
      >
        {t("entry.next")}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Write the entry page**

`src/modules/entry/page.tsx`:

```tsx
import type { Grade } from "@db";
import { gradeKey } from "@db";
import { useDb } from "@db/provider";
import { formatGradeValue, parseGradeValue } from "@domain/gradebook/grade";
import { Link } from "@swan-io/chicane";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Router } from "../../router";
import { NumberPad } from "../design-system/components/number-pad";

export function EntryPage({
  gradebookId,
  columnId,
}: {
  gradebookId: string;
  columnId: string;
}) {
  const { t } = useTranslation();
  const db = useDb();
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState<string | null>(null);

  const data = useLiveQuery(async () => {
    const column = await db.columns.get(columnId);
    if (!column) return null;
    const gradebook = await db.gradebooks.get(gradebookId);
    if (!gradebook) return null;
    const [students, grades] = await Promise.all([
      db.students.where("classId").equals(gradebook.classId).sortBy("lastName"),
      db.grades.where("columnId").equals(columnId).toArray(),
    ]);
    return { column, students, grades };
  }, [db, gradebookId, columnId]);

  if (data === undefined) return <p className="text-text-muted">{t("common.loading")}</p>;
  if (data === null) return <p className="text-text-muted">{t("gradebook.notFound")}</p>;

  const { column, students } = data;
  const byStudent = new Map<string, Grade>(data.grades.map((g) => [g.studentId, g]));
  const current = students[index];

  async function commit(): Promise<void> {
    if (!current || draft === null) return;
    const parsed = parseGradeValue(column.type, draft);
    if (parsed === null) {
      await db.grades.delete(gradeKey(gradebookId, columnId, current.id));
    } else {
      await db.grades.put({
        gradebookId,
        columnId,
        studentId: current.id,
        value: parsed,
        updatedAt: Date.now(),
      });
    }
    setDraft(null);
  }

  async function next(): Promise<void> {
    await commit();
    setIndex((i) => Math.min(i + 1, students.length - 1));
  }

  const stored = current ? byStudent.get(current.id)?.value : undefined;
  const shown =
    draft !== null
      ? draft
      : stored === undefined
        ? ""
        : formatGradeValue(stored, column.type === "numeric" ? column.max : undefined);

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-4">
      <div className="flex items-center justify-between">
        <Link to={Router.Gradebook({ gradebookId })} className="text-accent">
          ← {t("entry.backToGrid")}
        </Link>
        <span className="text-sm text-text-muted">
          {index + 1}/{students.length}
        </span>
      </div>

      <div className="rounded border border-border p-3 text-center">
        <p className="font-medium">{column.label}</p>
        <p className="text-sm text-text-muted">
          {t("gradebook.coef", { weight: column.weight })} — /{column.max}
        </p>
      </div>

      {current ? (
        <>
          <div className="rounded border border-border p-4 text-center">
            <p className="font-semibold text-lg">
              {current.lastName} {current.firstName}
            </p>
            <p className="mt-2 font-bold text-3xl tabular-nums">
              {shown === "" ? <span className="text-text-faint">—</span> : shown}
            </p>
          </div>

          <NumberPad
            onDigit={(digit) => setDraft((d) => (d ?? "") + digit)}
            onDecimal={() => setDraft((d) => ((d ?? "").includes(",") ? d : `${d ?? ""},`))}
            onBackspace={() => setDraft((d) => (d ?? "").slice(0, -1))}
            onNext={() => void next()}
          />

          <ul className="flex flex-col gap-1 text-sm">
            {students.map((student, i) => (
              <li key={student.id}>
                <button
                  type="button"
                  className={[
                    "flex w-full justify-between rounded px-2 py-1 text-left",
                    i === index ? "bg-bg-hover font-medium" : "",
                  ].join(" ")}
                  onClick={() => {
                    void commit();
                    setIndex(i);
                  }}
                >
                  <span>
                    {student.lastName} {student.firstName}
                  </span>
                  <span className="tabular-nums text-text-muted">
                    {(() => {
                      const value = byStudent.get(student.id)?.value;
                      return value === undefined ? "—" : formatGradeValue(value);
                    })()}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-text-muted">{t("class.noStudents")}</p>
      )}
    </div>
  );
}
```

The number pad is for numeric columns, which is what fast entry is for; other
column types still show the roster list and their stored values, and are edited
from the grid.

- [ ] **Step 3: Route to the page and add keys**

In `src/app.tsx`:

```tsx
    case "Entry":
      return (
        <EntryPage gradebookId={route.params.gradebookId} columnId={route.params.columnId} />
      );
```

`fr.json`:

```json
{
  "entry": { "next": "Suivant", "backToGrid": "Retour au tableau" }
}
```

`en.json`:

```json
{
  "entry": { "next": "Next", "backToGrid": "Back to grid" }
}
```

- [ ] **Step 4: Verify on a phone viewport**

Run: `yarn dev`, DevTools device toolbar at iPhone SE (375px), open Mathématiques 3°B and tap the "DS 1" header.
Expected: entry screen at `/gradebooks/<id>/entry/<col>`; typing `1` `4` `,` `5` then "Suivant" stores 14,5 and advances to the next student; the roster list below shows the stored value and highlights the current student; tapping a name jumps to them; "Retour au tableau" returns to the grid with the new mark visible; the browser back button also returns. Stop the server.

- [ ] **Step 5: Run the validation gate and commit**

```bash
yarn format && yarn lint && yarn typecheck && yarn test
git add -A
git commit -m "feat(entry): column-at-a-time fast grading on mobile

A route, not a modal, so it deep-links from a column header and the back
button behaves."
```

---

### Task 13: Settings — subjects, periods, backup, wipe

**Files:**
- Create: `src/modules/settings/page.tsx`, `src/db/backup.ts`
- Modify: `src/app.tsx`, `src/i18n/locales/{fr,en}.json`
- Test: `src/db/backup.test.ts`

**Interfaces:**
- Consumes: `AppDatabase`, `openWorkspaceDb`, row types; `LOCALES`, `loadLocale`, `saveLocale` from `@i18n`.
- Produces:
  - `exportWorkspace(db: AppDatabase): Promise<WorkspaceBackup>`
  - `importWorkspace(db: AppDatabase, backup: unknown): Promise<void>` — replaces all content, throws on a malformed payload
  - `interface WorkspaceBackup { version: 1; exportedAt: number; classes: SchoolClass[]; students: Student[]; subjects: Subject[]; gradebooks: Gradebook[]; periods: Period[]; columns: GradeColumn[]; grades: Grade[] }`
  - `SettingsPage()`

Student photos are `Blob`s and do not survive `JSON.stringify`. v1 exports
everything except photos, and the UI says so.

- [ ] **Step 1: Write the failing test**

`src/db/backup.test.ts`:

```ts
import "fake-indexeddb/auto";
import { openWorkspaceDb } from ".";
import { exportWorkspace, importWorkspace } from "./backup";
import { seedIfEmpty } from "./seed";

describe("workspace backup", () => {
  it("round-trips a seeded workspace into an empty one", async () => {
    const source = openWorkspaceDb("backup-source");
    await seedIfEmpty(source);
    const backup = await exportWorkspace(source);

    const target = openWorkspaceDb("backup-target");
    await importWorkspace(target, JSON.parse(JSON.stringify(backup)));

    expect(await target.classes.count()).toBe(await source.classes.count());
    expect(await target.students.count()).toBe(await source.students.count());
    expect(await target.grades.count()).toBe(await source.grades.count());
    source.close();
    target.close();
  });

  it("replaces existing content rather than merging into it", async () => {
    const source = openWorkspaceDb("backup-replace-source");
    await seedIfEmpty(source);
    const backup = await exportWorkspace(source);

    const target = openWorkspaceDb("backup-replace-target");
    await seedIfEmpty(target);
    await importWorkspace(target, JSON.parse(JSON.stringify(backup)));

    expect(await target.classes.count()).toBe(2);
    source.close();
    target.close();
  });

  it("rejects a payload that is not a backup", async () => {
    const db = openWorkspaceDb("backup-bad");
    await expect(importWorkspace(db, { hello: "world" })).rejects.toThrow();
    db.close();
  });

  it("rejects a backup from a future version", async () => {
    const db = openWorkspaceDb("backup-future");
    await expect(
      importWorkspace(db, {
        version: 2,
        exportedAt: 0,
        classes: [],
        students: [],
        subjects: [],
        gradebooks: [],
        periods: [],
        columns: [],
        grades: [],
      }),
    ).rejects.toThrow();
    db.close();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test src/db/backup.test.ts`
Expected: FAIL — `Cannot find module './backup'`.

- [ ] **Step 3: Write `src/db/backup.ts`**

```ts
import { z } from "zod";
import type { AppDatabase } from ".";
import type { Gradebook, Grade, GradeColumn, Period, SchoolClass, Student, Subject } from "./types";

export interface WorkspaceBackup {
  version: 1;
  exportedAt: number;
  classes: SchoolClass[];
  students: Student[];
  subjects: Subject[];
  gradebooks: Gradebook[];
  periods: Period[];
  columns: GradeColumn[];
  grades: Grade[];
}

/**
 * Shape check only — the rows themselves are trusted, since a backup can only
 * come from this app. A wrong shape must fail loudly rather than half-import.
 */
const backupSchema = z.object({
  version: z.literal(1),
  exportedAt: z.number(),
  classes: z.array(z.object({ id: z.string() }).loose()),
  students: z.array(z.object({ id: z.string() }).loose()),
  subjects: z.array(z.object({ id: z.string() }).loose()),
  gradebooks: z.array(z.object({ id: z.string() }).loose()),
  periods: z.array(z.object({ id: z.string() }).loose()),
  columns: z.array(z.object({ id: z.string() }).loose()),
  grades: z.array(z.object({ gradebookId: z.string() }).loose()),
});

/** Photos are Blobs and are not included — JSON cannot carry them. */
export async function exportWorkspace(db: AppDatabase): Promise<WorkspaceBackup> {
  const [classes, students, subjects, gradebooks, periods, columns, grades] = await Promise.all([
    db.classes.toArray(),
    db.students.toArray(),
    db.subjects.toArray(),
    db.gradebooks.toArray(),
    db.periods.toArray(),
    db.columns.toArray(),
    db.grades.toArray(),
  ]);

  return {
    version: 1,
    exportedAt: Date.now(),
    classes,
    students: students.map(({ photo: _photo, ...rest }) => rest),
    subjects,
    gradebooks,
    periods,
    columns,
    grades,
  };
}

/** Destructive: clears every table, then writes the backup's rows. */
export async function importWorkspace(db: AppDatabase, backup: unknown): Promise<void> {
  const parsed = backupSchema.safeParse(backup);
  if (!parsed.success) {
    throw new Error("Invalid backup file");
  }
  const data = parsed.data as unknown as WorkspaceBackup;

  const tables = [
    db.classes,
    db.students,
    db.subjects,
    db.gradebooks,
    db.periods,
    db.columns,
    db.grades,
  ];

  await db.transaction("rw", tables, async () => {
    for (const table of tables) await table.clear();
    await db.classes.bulkAdd(data.classes);
    await db.students.bulkAdd(data.students);
    await db.subjects.bulkAdd(data.subjects);
    await db.gradebooks.bulkAdd(data.gradebooks);
    await db.periods.bulkAdd(data.periods);
    await db.columns.bulkAdd(data.columns);
    await db.grades.bulkPut(data.grades);
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn test src/db/backup.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the settings page**

`src/modules/settings/page.tsx`:

```tsx
import { exportWorkspace, importWorkspace } from "@db/backup";
import { useDb } from "@db/provider";
import { type Locale, LOCALES, loadLocale, saveLocale } from "@i18n";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export function SettingsPage() {
  const { t } = useTranslation();
  const db = useDb();
  const [confirmingWipe, setConfirmingWipe] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subjects = useLiveQuery(() => db.subjects.toArray(), [db]);

  async function onExport(): Promise<void> {
    const backup = await exportWorkspace(db);
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `profs-${stamp}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function onImport(file: File): Promise<void> {
    setError(null);
    try {
      await importWorkspace(db, JSON.parse(await file.text()));
    } catch {
      setError(t("settings.importFailed"));
    }
  }

  async function onWipe(): Promise<void> {
    await db.transaction(
      "rw",
      [db.classes, db.students, db.subjects, db.gradebooks, db.periods, db.columns, db.grades],
      async () => {
        for (const table of [
          db.classes,
          db.students,
          db.subjects,
          db.gradebooks,
          db.periods,
          db.columns,
          db.grades,
        ]) {
          await table.clear();
        }
      },
    );
    setConfirmingWipe(false);
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        <h2 className="font-semibold text-lg">{t("settings.language")}</h2>
        <select
          className="field max-w-xs"
          value={loadLocale()}
          onChange={(e) => saveLocale(e.target.value as Locale)}
        >
          {LOCALES.map((locale) => (
            <option key={locale} value={locale}>
              {t(`settings.locale.${locale}`)}
            </option>
          ))}
        </select>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold text-lg">{t("settings.subjects")}</h2>
        <ul className="flex flex-wrap gap-2">
          {(subjects ?? []).map((subject) => (
            <li
              key={subject.id}
              className="rounded border border-border px-2 py-1 text-sm"
              style={{ borderLeft: `4px solid ${subject.color}` }}
            >
              {subject.name}
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold text-lg">{t("settings.backup")}</h2>
        <p className="text-sm text-text-muted">{t("settings.backupHelp")}</p>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn" onClick={() => void onExport()}>
            {t("settings.export")}
          </button>
          <input
            type="file"
            accept="application/json,.json"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onImport(file);
            }}
          />
        </div>
        {error && <p className="text-danger text-sm">{error}</p>}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold text-danger text-lg">{t("settings.dangerZone")}</h2>
        <p className="text-sm text-text-muted">{t("settings.wipeHelp")}</p>
        {confirmingWipe ? (
          <div className="flex gap-2">
            <button type="button" className="btn btn-danger" onClick={() => void onWipe()}>
              {t("settings.wipeConfirm")}
            </button>
            <button type="button" className="btn" onClick={() => setConfirmingWipe(false)}>
              {t("common.cancel")}
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-danger self-start"
            onClick={() => setConfirmingWipe(true)}
          >
            {t("settings.wipe")}
          </button>
        )}
      </section>
    </div>
  );
}
```

The wipe is a two-step in-page confirmation, never `window.confirm` — a modal
dialog blocks the page and is untestable.

- [ ] **Step 6: Route to the page and add keys**

In `src/app.tsx`:

```tsx
    case "Settings":
      return <SettingsPage />;
```

`fr.json`:

```json
{
  "settings": {
    "language": "Langue",
    "locale": { "fr": "Français", "en": "Anglais" },
    "subjects": "Matières",
    "backup": "Sauvegarde",
    "backupHelp": "Exportez vos données en JSON pour les transférer sur un autre appareil. Les photos des élèves ne sont pas incluses.",
    "export": "Exporter",
    "importFailed": "Fichier de sauvegarde invalide",
    "dangerZone": "Zone dangereuse",
    "wipeHelp": "Supprime définitivement toutes les données de cet espace de travail sur cet appareil.",
    "wipe": "Supprimer toutes les données",
    "wipeConfirm": "Oui, tout supprimer"
  }
}
```

`en.json`:

```json
{
  "settings": {
    "language": "Language",
    "locale": { "fr": "French", "en": "English" },
    "subjects": "Subjects",
    "backup": "Backup",
    "backupHelp": "Export your data as JSON to move it to another device. Student photos are not included.",
    "export": "Export",
    "importFailed": "Invalid backup file",
    "dangerZone": "Danger zone",
    "wipeHelp": "Permanently deletes every piece of data in this workspace on this device.",
    "wipe": "Delete all data",
    "wipeConfirm": "Yes, delete everything"
  }
}
```

- [ ] **Step 7: Verify the cross-device round trip**

Run: `yarn dev`, open Réglages.
Expected: switching the language to Anglais retranslates the UI immediately and survives a reload. "Exporter" downloads `profs-YYYY-MM-DD.json`. Choosing that file in the import input replaces the data with itself — counts on the dashboard stay identical. Editing a grade, exporting, wiping, then importing restores the edited grade. Selecting a non-backup JSON file shows "Fichier de sauvegarde invalide" and changes nothing. Stop the server.

- [ ] **Step 8: Run the validation gate and commit**

```bash
yarn format && yarn lint && yarn typecheck && yarn test
git add -A
git commit -m "feat(settings): language, JSON backup, and data wipe

Export/import is the v1 cross-device path; the wipe is an in-page
two-step confirmation, never a blocking window.confirm."
```

---

### Task 14: PWA assets, privacy documentation, release check

**Files:**
- Create: `public/icons/icon-192.svg`, `README.md`, `PRIVACY.md`, `LICENSE`
- Modify: `public/manifest.json`, `public/sw.js`

**Interfaces:**
- Consumes: the built `dist/` output.
- Produces: an installable, offline-capable build.

- [ ] **Step 1: Write the app icon**

`public/icons/icon-192.svg` — a flat mark, no external font:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192" width="192" height="192">
  <rect width="192" height="192" rx="32" fill="#2563eb" />
  <rect x="40" y="44" width="112" height="20" rx="6" fill="#ffffff" />
  <rect x="40" y="86" width="112" height="20" rx="6" fill="#ffffff" opacity="0.75" />
  <rect x="40" y="128" width="68" height="20" rx="6" fill="#ffffff" opacity="0.5" />
</svg>
```

- [ ] **Step 2: Write the manifest**

`public/manifest.json`:

```json
{
  "name": "profs",
  "short_name": "profs",
  "description": "Carnet de notes local et open source pour enseignants",
  "start_url": ".",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#111827",
  "lang": "fr",
  "icons": [
    {
      "src": "icons/icon-192.svg",
      "sizes": "any",
      "type": "image/svg+xml",
      "purpose": "any maskable"
    }
  ]
}
```

- [ ] **Step 3: Write the service worker**

`public/sw.js` — app-shell precache with a network-first HTML strategy so a new
deploy is picked up, and cache-first for hashed assets:

```js
const CACHE = "profs-v1";
const SHELL = ["./", "./index.html", "./manifest.json", "./icons/icon-192.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const isNavigation = request.mode === "navigate";

  if (isNavigation) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put("./index.html", copy));
          return response;
        })
        .catch(() => caches.match("./index.html").then((hit) => hit || Response.error())),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ||
        fetch(request).then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
          return response;
        }),
    ),
  );
});
```

- [ ] **Step 4: Write the documentation**

`PRIVACY.md`:

```markdown
# Privacy

profs holds grades and names of students, some of them minors. It is built so
that this data never leaves the device it was entered on.

## What the app does

- Every piece of data — classes, students, grades, notes — is stored in your
  browser's IndexedDB, on your device.
- The app makes **no network requests**. No API, no analytics, no telemetry, no
  crash reporting, no fonts or scripts loaded from a CDN. After the first load
  it works with the network switched off, and nothing changes when it comes
  back.
- There is no account, no login, no identifier of any kind.

## Moving data between devices

Réglages → Sauvegarde exports a JSON file. You move that file yourself, by
whatever means you trust, and import it on the other device. Nobody else handles
it. Student photos are not included in the export.

## Deleting data

Réglages → Zone dangereuse → "Supprimer toutes les données" erases the whole
workspace from the device. Clearing the site data in your browser has the same
effect. Neither is recoverable — export first if you want a copy.

## GDPR / RGPD

Because no data is transmitted or stored anywhere but the teacher's own device,
the app introduces no processor and no transfer. The teacher remains responsible
for the device itself: lock it, and export backups only to storage they control.
```

`README.md`:

```markdown
# profs

An open-source gradebook for teachers. Classes, students, grades, averages —
in your browser, on your device, offline.

`profs` is a local-only alternative to iDoceo. There is no server, no account,
and no subscription.

## Features (v1)

- **Classes and students** — rosters with CSV import (semicolon, comma, or tab)
- **Gradebooks** — one per class and subject, split into terms
- **Typed columns** — numeric marks with any scale, letters, icons, checkboxes,
  free text, attendance
- **Weighted averages** — every numeric column normalised to /20 by its own
  scale, with class statistics
- **Fast entry** — a phone-sized keypad for grading a whole class in class
- **Backup** — JSON export and import to move data between your devices
- **Offline** — installable PWA, works with no network at all

## Privacy

Your data never leaves your device. See [PRIVACY.md](PRIVACY.md).

## Development

```bash
yarn install
yarn dev        # http://localhost:3000
yarn build      # production build into dist/
yarn test       # unit tests
yarn lint       # biome
yarn typecheck  # tsc --noEmit
```

## Stack

React 19, TypeScript, Dexie (IndexedDB), Chicane, TanStack Table, Tailwind CSS
v4, Rspack, Biome, Jest.

## Licence

MIT — see [LICENSE](LICENSE).
```

`LICENSE` — the standard MIT text, `Copyright (c) 2026 Maxime Parriaux`.

- [ ] **Step 5: Verify the production build installs and runs offline**

```bash
yarn build && yarn preview
```

Open the served URL in Chrome, then:
- DevTools → Application → Manifest: name `profs`, icon renders, no errors.
- DevTools → Application → Service Workers: activated and running.
- DevTools → Network → check "Offline", reload: the app still loads, the
  dashboard still lists the classes, and a grade edit still saves.
- DevTools → Network with the throttle back on, filter by "All": confirm **no
  request to any third-party origin** appears at any point.
- Install the app (address-bar install button) and confirm it opens in a
  standalone window.

Stop the preview server.

- [ ] **Step 6: Run the validation gate and commit**

```bash
yarn format && yarn lint && yarn typecheck && yarn test
git add -A
git commit -m "feat: PWA assets, README, privacy policy and MIT licence

App-shell service worker with network-first navigation, installable
manifest, and the privacy posture written down."
git push
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| Stack, bootstrap from open-setlist, i18n fr default | 1 |
| Column types, `Grade.value` discriminated union, zod | 2 |
| Averages computed on read, weighting, class stats | 3, 11 |
| CSV roster import, delimiter sniffing, duplicates flagged | 4, 9 |
| Data model, per-workspace DB, compound grade key | 5 |
| Seed "Collège Démo" | 6 |
| Route `/` dashboard | 7 |
| Route `/classes/:classId`, roster | 8 |
| Route `/gradebooks/:id`, pinned column, editable cells | 10 |
| Route `/gradebooks/:id/entry/:columnId`, number pad | 12 |
| Route `/settings`, JSON export/import, wipe | 13 |
| PWA manifest, service worker, no CORS worker | 14 |
| RGPD: no telemetry, no CDN, PRIVACY.md | 14 (verified in Step 5) |
| Validation gate on every task | all |
| Non-goals (sync module, PDF reports, student page) | not planned — correct |

No gaps.

**Type consistency:** `AverageColumn`/`AverageGrade` (Task 3) are the shapes Task
11 builds; `GradeColumn` is the DB row name throughout (never `Column`, which
collides with TanStack's export); `SchoolClass` avoids the reserved word in every
task; `gradeKey` is used identically in Tasks 5, 10, and 12; `parseGradeValue` and
`formatGradeValue` keep their Task 2 signatures in Tasks 10 and 12.

**Known deliberate deviation:** the spec's data model lists `Workspace` as a table;
the plan puts the registry in `localStorage` (Task 5) because it must be read
before any database opens — the same reason open-setlist keeps profiles there.
