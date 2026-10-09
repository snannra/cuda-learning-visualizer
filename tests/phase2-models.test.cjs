const test = require("node:test"),
  assert = require("node:assert/strict"),
  M = require("../assets/js/performance/phase2-models.js");
test("scheduler respects issue width, dependencies, block-local barriers and completion", () => {
  for (const preset of Object.values(M.presets))
    for (const warps of [1, 4, 7, 16, 32]) {
      const e = M.scheduler({ ...preset, warps, schedulers: 4 });
      let r;
      for (let i = 0; i < 2000; i++) {
        r = e.step();
        assert.ok(r.issued <= 4);
        assert.ok(r.issued <= r.eligible);
        if (r.complete) break;
      }
      assert.ok(r.complete, JSON.stringify({ preset, warps }));
      assert.equal(
        r.issuedTotal,
        e.warps.reduce((n, w) => n + w.program.length, 0),
      );
    }
  const run = (warps) => {
    const e = M.scheduler({ ...M.presets.healthy, warps });
    let r;
    do {
      r = e.step();
    } while (!r.complete);
    return r.emptyCycles / (r.cycle + 1);
  };
  assert.ok(run(32) < run(4), "more independent warps hide latency");
  const e = M.scheduler({
    warps: 4,
    latency: 10,
    schedulers: 4,
    math: 1,
    shared: 2,
  });
  e.step();
  for (let i = 1; i < 10; i++) assert.equal(e.step().issued, 0);
  assert.equal(e.step().issued, 4);
});
test("roofline units, knee, reuse and illustrative point are consistent", () => {
  const c = {
      flops: 1e9,
      bytes: 1e9,
      peak: 20,
      bandwidth: 600,
      attainment: 0.5,
    },
    r = M.roofline(c);
  assert.equal(r.ceiling, 0.6);
  assert.equal(r.throughput, 0.3);
  assert.equal(r.knee, 100 / 3);
  assert.equal(M.roofline({ ...c, bytes: 5e8 }).ceiling, 1.2);
  assert.equal(M.roofline({ ...c, bytes: 1 }).ceiling, 20);
  for (const value of [0, -1, NaN, Infinity])
    assert.throws(() => M.roofline({ ...c, bytes: value }));
});
const base = {
  bx: 16,
  by: 16,
  tw: 16,
  th: 16,
  mw: 64,
  mh: 64,
  ix: 0,
  iy: 0,
  mode: "direct",
  warp: 0,
};
test("physical IDs are x-fastest and transposed mapping preserves coverage but scatters stores", () => {
  const a = M.mapping(base),
    b = M.mapping({ ...base, mode: "transpose" });
  assert.equal(a.threads[16].tx, 0);
  assert.equal(a.threads[16].ty, 1);
  assert.equal(a.threads[32].warp, 1);
  assert.equal(a.holes, 0);
  assert.equal(b.holes, 0);
  assert.equal(a.sectors.length, 4);
  assert.equal(b.sectors.length, 16);
  assert.equal(a.efficiency, 1);
  assert.equal(b.efficiency, 0.25);
});
test("mapping distinguishes physical shape, tile shape, incomplete warps and matrix masks", () => {
  const a = M.mapping({ ...base, bx: 32, by: 8 });
  assert.equal(a.holes, 128);
  assert.equal(a.outsideTile, 128);
  const b = M.mapping({ ...base, bx: 32, by: 8, mode: "linear" });
  assert.equal(b.holes, 0);
  assert.equal(b.outsideTile, 0);
  const edge = M.mapping({ ...base, mw: 17, mh: 17, ix: 1, iy: 1 });
  assert.equal(edge.threads.filter((t) => t.valid).length, 1);
  assert.equal(edge.outsideMatrix, 255);
  assert.equal(edge.active, 1);
  assert.equal(edge.sectors.length, 1);
  const partial = M.mapping({
    ...base,
    bx: 7,
    by: 5,
    tw: 7,
    th: 5,
    mw: 7,
    mh: 5,
    warp: 1,
  });
  assert.equal(partial.active, 3);
  assert.equal(partial.threads.length, 35);
});
