/* Dependency-free Chrome DevTools driver; usable locally or in CI. */
module.exports = async function (options = {}) {
  const endpoint =
    options.endpoint ||
    process.env.VISUALIZER_CDP_URL ||
    "http://127.0.0.1:9230";
  const base = new URL(
    options.base || process.env.VISUALIZER_BASE_URL || "http://127.0.0.1:8001/",
  );
  if (!base.pathname.endsWith("/"))
    throw Error("VISUALIZER_BASE_URL must end with a slash.");
  const tabs = await (await fetch(endpoint + "/json")).json(),
    tab = tabs.find((t) => t.type === "page");
  if (!tab) throw Error("Chrome has no page target.");
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let id = 0;
  const pending = new Map(),
    errors = [],
    responseErrors = [],
    requests = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.method === "Runtime.exceptionThrown") errors.push(m.params);
    if (m.method === "Network.requestWillBeSent")
      requests.set(m.params.requestId, m.params.request.url);
    if (
      m.method === "Network.responseReceived" &&
      m.params.response.status >= 400 &&
      m.params.response.url.startsWith(base.origin)
    )
      responseErrors.push(m.params.response);
    if (
      m.method === "Network.loadingFailed" &&
      !m.params.canceled &&
      requests.get(m.params.requestId)?.startsWith(base.origin)
    )
      responseErrors.push(m.params);
    if (pending.has(m.id)) {
      const p = pending.get(m.id);
      clearTimeout(p.timer);
      pending.delete(m.id);
      if (m.error) p.reject(Error(JSON.stringify(m.error)));
      else p.resolve(m);
    }
  };
  ws.onclose = () => {
    for (const p of pending.values()) {
      clearTimeout(p.timer);
      p.reject(Error("Chrome connection closed."));
    }
    pending.clear();
  };
  const call = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const i = ++id,
        timer = setTimeout(() => {
          pending.delete(i);
          reject(Error("CDP timeout: " + method));
        }, 15000);
      pending.set(i, { resolve, reject, timer });
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  const run = async (expression) => {
    const r = await call("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.result.exceptionDetails)
      throw Error(JSON.stringify(r.result.exceptionDetails));
    return r.result.result.value;
  };
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  await call("Runtime.enable");
  await call("Page.enable");
  await call("Network.enable");
  await call("Network.setCacheDisabled", { cacheDisabled: true });
  return {
    call,
    run,
    errors,
    responseErrors,
    base: base.href,
    close: () => ws.close(),
    delay,
    open: async (path) => {
      const target = new URL(path, base).href;
      await call("Page.navigate", { url: target });
      const deadline = Date.now() + 10000;
      while (Date.now() < deadline) {
        try {
          if (
            await run(
              `location.href===${JSON.stringify(target)}&&document.readyState==='complete'`,
            )
          ) {
            await delay(100);
            return;
          }
        } catch {}
        await delay(40);
      }
      throw Error("Page did not load: " + target);
    },
  };
};
