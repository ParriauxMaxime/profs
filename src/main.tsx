import "@i18n";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import { initWorkspace } from "./db/init";
import { DbProvider } from "./db/provider";
import { RecoveryShell } from "./modules/recovery/shell";
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

function mount(): ReturnType<typeof createRoot> {
  const root = document.getElementById("root");
  if (!root) throw new Error("Missing #root element");
  return createRoot(root);
}

initWorkspace()
  .then(() => {
    mount().render(
      <StrictMode>
        <DbProvider>
          <App />
        </DbProvider>
      </StrictMode>,
    );
  })
  .catch((error: unknown) => {
    // Without this catch the promise never reaches `render`, React never
    // mounts, and the teacher gets a blank page — with their pupils' names
    // still in IndexedDB and no route to the wipe in Réglages, to the export,
    // or to the workspace switcher, because none of those screens exist until
    // React has mounted. The app is the only copy of the data; `PRIVACY.md`
    // says so. The recovery shell renders without `DbProvider` and without the
    // router, since the database is exactly what just failed.
    console.error("profs: the workspace database would not open", error);
    mount().render(
      <StrictMode>
        <RecoveryShell error={error} />
      </StrictMode>,
    );
  });
