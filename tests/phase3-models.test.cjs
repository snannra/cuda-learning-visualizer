const test = require("node:test"),
  assert = require("node:assert/strict"),
  M = require("../assets/js/performance/phase3-models.js"),
  R = require("../assets/js/performance/notebook-records.js");
const block = {
  n: 8,
  bx: 8,
  by: 8,
  tileK: 4,
  registers: 62,
  arch: "generic",
  outputs: 1,
  tx: 0,
  ty: 0,
  step: 0,
};
test("multiple accumulators match an independent matrix product and reuse improves per output", () => {
  for (const n of [4, 8, 16])
    for (const outputs of [1, 2, 4])
      for (const tx of [0, 1, 3]) {
        const r = M.blocking({ ...block, n, outputs, tx, step: 3 * n + 1 });
        for (let i = 0; i < outputs; i++) {
          let expected = 0;
          const col = tx * outputs + i;
          for (let k = 0; k < n; k++)
            if (col < n) expected += (1 + (k % 4)) * (1 + ((k * 2 + col) % 5));
          assert.equal(r.acc[i], expected);
        }
        assert.equal(r.aLoads, n);
        assert.equal(r.bLoads, n * outputs);
        assert.equal(r.flops, n * outputs * 2);
      }
  const one = M.blocking(block),
    four = M.blocking({ ...block, outputs: 4 });
  assert.equal(
    four.occupancy.estimatedRegisters,
    one.occupancy.estimatedRegisters + 3,
  );
  assert.ok(four.intensity > one.intensity);
  assert.ok(four.shared > one.shared);
  assert.ok(four.occupancy.occupancy <= one.occupancy.occupancy);
  const partial = M.blocking({ ...block, outputs: 4, tx: 2, step: 25 });
  assert.deepEqual(partial.valid, [false, false, false, false]);
  assert.deepEqual(partial.acc, [0, 0, 0, 0]);
  assert.throws(() => M.blocking({ ...block, outputs: 8 }));
});
test("register animation changes accumulators only at accumulation steps", () => {
  assert.deepEqual(M.blocking({ ...block, outputs: 2, step: 2 }).acc, [0, 0]);
  assert.deepEqual(M.blocking({ ...block, outputs: 2, step: 3 }).acc, [1, 2]);
  assert.deepEqual(M.blocking({ ...block, outputs: 2, step: 4 }).acc, [1, 2]);
});
test("pipeline schedules serialize each engine and never overwrite a consumed buffer", () => {
  for (const tiles of [1, 2, 5, 16])
    for (const load of [1, 12, 100])
      for (const compute of [1, 18, 100]) {
        const r = M.pipeline({ tiles, load, compute, issue: 1, tileKB: 8 });
        assert.equal(r.sequential.total, tiles * (1 + load + compute));
        assert.ok(r.overlap.total <= r.sequential.total);
        if (tiles === 1) assert.equal(r.saved, 0);
        for (const plan of [r.sequential, r.overlap])
          for (let i = 0; i < plan.rows.length; i++) {
            const t = plan.rows[i];
            assert.ok(t.computeStart >= t.loadEnd);
            if (i) {
              assert.ok(t.start >= plan.rows[i - 1].loadEnd);
              assert.ok(t.computeStart >= plan.rows[i - 1].end);
            }
            const same = plan.rows
              .slice(0, i)
              .filter((p) => p.buffer === t.buffer)
              .at(-1);
            if (same) assert.ok(t.start >= same.end);
          }
      }
  const r = M.pipeline({
    tiles: 5,
    load: 12,
    compute: 18,
    issue: 1,
    tileKB: 8,
  });
  assert.equal(r.overlap.total, 103);
  assert.deepEqual(
    r.buffersAt(20, r.overlap).map((b) => b.state),
    ["being consumed", "loading"],
  );
  assert.ok(r.buffersAt(103, r.overlap).every((b) => b.state === "empty"));
  assert.throws(() =>
    M.pipeline({ tiles: 0, load: 12, compute: 18, issue: 1, tileKB: 8 }),
  );
});
test("every decision tree branch resolves to an investigation with caveats", () => {
  const seen = new Set();
  function visit(path) {
    const r = M.walkTree(path);
    seen.add(r.key);
    if (r.node.choices)
      for (const choice of r.node.choices) visit([...path, choice[0]]);
    else
      for (const key of ["title", "signal", "next", "counter", "module"])
        assert.ok(r.node[key]);
  }
  visit([]);
  assert.equal(seen.size, Object.keys(M.tree).length);
  assert.equal(M.walkTree(["no", "yes", "no", "short"]).key, "short");
  assert.throws(() => M.walkTree(["invalid"]));
  assert.throws(() => M.walkTree(["unknown", "yes"]));
});
const record = {
  id: "example",
  title: "Tile 16",
  kernel: "FP32 GEMM",
  source: "educational",
  module: "manual",
  timestamp: "2026-10-09T00:00:00.000Z",
  notes: "",
  hypothesis: "Reuse may help",
  blockX: 16,
  blockY: 16,
  tileX: 16,
  tileY: 16,
  registerEstimate: 32,
  sharedBytes: 2048,
  sectorsPerRequest: 4,
  occupancyPercent: 75,
  details: { Reference: "Generic" },
};
test("notebook round trips, preserves unknowns and rejects malformed imports atomically", () => {
  const a = R.validate(record);
  assert.deepEqual(R.decode(JSON.stringify({ version: 1, experiments: [a] })), [
    a,
  ]);
  const b = R.validate({
    ...record,
    id: "second",
    occupancyPercent: 50,
    sectorsPerRequest: null,
  });
  assert.equal(R.delta(a, b, "occupancyPercent"), -25);
  assert.equal(R.delta(a, b, "sectorsPerRequest"), null);
  for (const patch of [
    { source: "measured-by-browser" },
    { title: "" },
    { timestamp: "bad" },
    { occupancyPercent: 101 },
    { blockX: 1.5 },
    { sharedBytes: -1 },
    { notes: "x".repeat(10001) },
  ])
    assert.throws(() => R.validate({ ...record, ...patch }));
  assert.throws(() =>
    R.decode(JSON.stringify({ version: 2, experiments: [record] })),
  );
  assert.throws(() =>
    R.decode(JSON.stringify({ version: 1, experiments: [record, record] })),
  );
  assert.throws(() => R.decode("x".repeat(1048577)));
  // User text remains data; the UI escapes it rather than treating it as markup.
  assert.equal(
    R.validate({ ...record, title: "<img onerror=alert(1)>" }).title,
    "<img onerror=alert(1)>",
  );
});
