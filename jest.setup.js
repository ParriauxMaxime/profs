// Pinned so the calendar tests mean something. Under UTC there are no
// daylight-saving transitions, so a naive `ms + n * 86_400_000` produces
// output identical to a calendar walk and every DST assertion passes
// vacuously. Europe/Paris is also the honest zone for this app.
process.env.TZ = "Europe/Paris";

// jsdom is not used (testEnvironment: "node"), but the workspace registry lives
// in localStorage. Give the node environment a minimal in-memory implementation.
if (!("localStorage" in globalThis)) {
  const store = new Map();
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      get length() {
        return store.size;
      },
      clear: () => store.clear(),
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      key: (index) => Array.from(store.keys())[index] ?? null,
      removeItem: (key) => void store.delete(key),
      setItem: (key, value) => void store.set(key, String(value)),
    },
  });
}
