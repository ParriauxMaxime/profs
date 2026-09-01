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
