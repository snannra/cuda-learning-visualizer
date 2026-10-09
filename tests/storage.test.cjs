const test = require("node:test"),
  assert = require("node:assert/strict");
const { createStorage } = require("../assets/js/core/storage.js"),
  { createSessionState } = require("../assets/js/core/session-state.js"),
  {
    createNotebookRepository,
  } = require("../assets/js/performance/notebook-store.js");
function memory() {
  const values = new Map();
  return {
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, v),
    removeItem: (k) => values.delete(k),
    values,
  };
}
const repoOptions = {
  id: () => "stable-id",
  now: () => "2026-10-09T00:00:00.000Z",
};
test("storage scopes stay isolated and failed writes serve the latest cached value", () => {
  const session = memory(),
    persistent = memory(),
    storage = createStorage({ session, persistent });
  assert.equal(storage.write("session", "same", "session").durable, true);
  storage.write("persistent", "same", "persistent");
  assert.equal(storage.read("session", "same").value, "session");
  assert.equal(storage.read("persistent", "same").value, "persistent");
  persistent.setItem = () => {
    throw Error("quota");
  };
  assert.equal(storage.write("persistent", "same", "newest").durable, false);
  assert.equal(storage.read("persistent", "same").value, "newest");
  persistent.removeItem = () => {
    throw Error("denied");
  };
  assert.equal(storage.remove("persistent", "same").durable, false);
  assert.equal(storage.read("persistent", "same").value, null);
  assert.throws(() => storage.read("wrong", "key"));
  assert.throws(() => storage.write("session", "key", {}));
});
test("session facade restores existing keys, tolerates corrupt values and unavailable storage", () => {
  const session = memory(),
    storage = createStorage({ session, persistent: memory() });
  session.setItem("diescope.performance.mapping", '{"bx":16}');
  const a = createSessionState(storage);
  assert.equal(a.get("mapping", { bx: 8, by: 8 }).bx, 16);
  a.states.mapping.by = 4;
  a.save("mapping");
  const b = createSessionState(storage);
  assert.deepEqual(b.get("mapping", {}), { bx: 16, by: 4 });
  for (const value of ["{broken}", "[]", '"text"']) {
    session.setItem("diescope.performance.bad", value);
    assert.deepEqual(createSessionState(storage).get("bad", { n: 6 }), {
      n: 6,
    });
  }
  const denied = createStorage({
      session: () => {
        throw Error("blocked");
      },
    }),
    state = createSessionState(denied);
  state.get("memory", { stride: 1 }).stride = 4;
  assert.equal(state.save("memory"), false);
  assert.equal(createSessionState(denied).get("memory", {}).stride, 4);
});
test("notebook repository works through an injected port, preserves schema and existing local keys", () => {
  const persistent = memory(),
    storage = createStorage({ session: memory(), persistent }),
    repo = createNotebookRepository(storage, repoOptions),
    r = repo.create({ title: "Experiment" });
  repo.add(r);
  assert.ok(persistent.values.has("diescope.notebook.v1"));
  assert.equal(createNotebookRepository(storage).load()[0].title, "Experiment");
  assert.throws(() => repo.add(r));
  const before = persistent.getItem(repo.key);
  assert.throws(() => repo.persist([{ ...r, occupancyPercent: 101 }]));
  assert.equal(persistent.getItem(repo.key), before);
  persistent.setItem = () => {
    throw Error("quota");
  };
  repo.add({ ...r, id: "second" });
  assert.equal(repo.load().length, 2);
  assert.match(repo.warning, /only in this tab/);
  assert.equal(JSON.parse(persistent.getItem(repo.key)).experiments.length, 1);
});
test("corrupt stored notebooks are preserved until an explicit save", () => {
  const persistent = memory();
  persistent.setItem("diescope.notebook.v1", "{invalid");
  const repo = createNotebookRepository(
    createStorage({ persistent }),
    repoOptions,
  );
  assert.deepEqual(repo.load(), []);
  assert.match(repo.warning, /could not be read/);
  assert.equal(persistent.getItem(repo.key), "{invalid");
  repo.add(repo.create({ title: "New record" }));
  assert.equal(JSON.parse(persistent.getItem(repo.key)).experiments.length, 1);
});

test("a repository reuses cached records if browser reads become unavailable", () => {
  const persistent = memory();
  const storage = createStorage({ persistent });
  const first = createNotebookRepository(storage, repoOptions);
  first.add(first.create({ title: "Cached record" }));
  storage.read("persistent", first.key);
  persistent.getItem = () => {
    throw Error("blocked read");
  };
  const reopened = createNotebookRepository(storage);
  assert.equal(reopened.load()[0].title, "Cached record");
  assert.match(reopened.warning, /only in this tab/);
});
