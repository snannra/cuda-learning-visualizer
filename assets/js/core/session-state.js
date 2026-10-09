(function (root) {
  "use strict";
  function createSessionState(storage, prefix = "diescope.performance.") {
    const states = Object.create(null);
    return {
      states,
      get(key, defaults) {
        if (!Object.hasOwn(states, key)) {
          let saved;
          try {
            saved = JSON.parse(
              storage.read("session", prefix + key).value || "null",
            );
            if (!saved || typeof saved !== "object" || Array.isArray(saved))
              saved = null;
          } catch {
            saved = null;
          }
          states[key] = { ...defaults, ...saved };
        }
        return states[key];
      },
      save(key) {
        if (!Object.hasOwn(states, key)) return false;
        return storage.write(
          "session",
          prefix + key,
          JSON.stringify(states[key]),
        ).durable;
      },
    };
  }
  const api = { createSessionState };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SessionState = api;
})(typeof window === "undefined" ? globalThis : window);
