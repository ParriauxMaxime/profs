import "@i18n";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import { initWorkspace } from "./db/init";
import { DbProvider } from "./db/provider";
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
