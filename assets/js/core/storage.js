/* The only application boundary that accesses browser storage. */
(function (root) {
  "use strict";
  function createStorage(providers = {}) {
    const cache = { session: new Map(), persistent: new Map() };
    const pending = { session: new Set(), persistent: new Set() };
    function provider(scope) {
      if (!Object.hasOwn(cache, scope))
        throw new Error("Unknown storage scope: " + scope);
      const supplied = providers[scope];
      return typeof supplied === "function" ? supplied() : supplied;
    }
    function result(value, durable, error = null) {
      return { value, durable, error };
    }
    return {
      read(scope, key) {
        providerScope(scope);
        if (pending[scope].has(key))
          return result(cache[scope].get(key) ?? null, false);
        try {
          const value = provider(scope).getItem(key);
          if (value !== null && typeof value !== "string")
            throw new Error("Storage read must return a string or null.");
          if (value === null) cache[scope].delete(key);
          else cache[scope].set(key, value);
          return result(value, true);
        } catch (error) {
          return result(cache[scope].get(key) ?? null, false, error);
        }
      },
      write(scope, key, value) {
        providerScope(scope);
        if (typeof value !== "string")
          throw new Error("Serialize values before writing storage.");
        cache[scope].set(key, value);
        try {
          provider(scope).setItem(key, value);
          pending[scope].delete(key);
          return result(value, true);
        } catch (error) {
          pending[scope].add(key);
          return result(value, false, error);
        }
      },
      remove(scope, key) {
        providerScope(scope);
        cache[scope].delete(key);
        try {
          provider(scope).removeItem(key);
          pending[scope].delete(key);
          return result(null, true);
        } catch (error) {
          pending[scope].add(key);
          return result(null, false, error);
        }
      },
    };
    function providerScope(scope) {
      if (!Object.hasOwn(cache, scope))
        throw new Error("Unknown storage scope: " + scope);
    }
  }
  const api = { createStorage };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else {
    root.StoragePorts = api;
    // Lazy getters also handle browsers that deny access to the storage objects themselves.
    root.StorageService = createStorage({
      session: () => root.sessionStorage,
      persistent: () => root.localStorage,
    });
  }
})(typeof window === "undefined" ? globalThis : window);
