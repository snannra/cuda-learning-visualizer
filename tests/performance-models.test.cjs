const test = require("node:test"),
  assert = require("node:assert/strict");
const M = require("../assets/js/performance/models.js"),
  D = require("../assets/js/performance/diagnosis-data.js");
const base = {
  type: "fp32",
  expression: "base + lane",
  base: 0,
  stride: 1,
  constant: 0,
  matrixWidth: 32,
  offset: 0,
  mask: Array(32).fill(true),
};
test("aligned and misaligned contiguous loads cover the correct bytes and sectors", () => {
  for (const [type, size] of Object.entries(M.typeBytes)) {
    const a = M.memory({ ...base, type });
    assert.equal(a.unique, 32 * size);
    assert.equal(a.sectors.length, size);
    assert.equal(a.efficiency, 1);
    const b = M.memory({ ...base, type, offset: 1 });
    assert.equal(b.sectors.length, size + 1);
  }
  assert.equal(M.memory({ ...base, offset: 4 }).sectors.length, 5);
});
test("stride, reverse, broadcast, masks and crossing-sector lanes", () => {
  assert.equal(
    M.memory({ ...base, expression: "lane * 32" }).sectors.length,
    32,
  );
  assert.equal(M.memory({ ...base, expression: "31-lane" }).sectors.length, 4);
  const broadcast = M.memory({ ...base, expression: "constant" });
  assert.equal(broadcast.useful, 128);
  assert.equal(broadcast.unique, 4);
  assert.equal(broadcast.efficiency, 0.125);
  const masked = M.memory({ ...base, mask: Array(32).fill(false) });
  assert.equal(masked.requests, 0);
  assert.equal(masked.fetched, 0);
  assert.equal(masked.efficiency, 0);
  const partial = M.memory({
    ...base,
    mask: Array.from({ length: 32 }, (_, i) => i < 7),
  });
  assert.equal(partial.unique, 28);
  assert.equal(partial.sectors.length, 1);
  assert.deepEqual(
    M.memory({ ...base, type: "fp64", offset: 28 }).lanes[0].sectors,
    [0, 1],
  );
});
test("custom grammar allows only safe arithmetic and validates final indices", () => {
  assert.equal(
    M.expression("index = base + lane * stride", {
      base: 3,
      lane: 7,
      stride: 4,
    }),
    31,
  );
  assert.equal(M.expression("(lane + 1) % 4", { lane: 7 }), 0);
  for (const expression of [
    "window.alert(1)",
    "constructor",
    "lane / 0",
    "-1",
    "0.5",
    "lane / 2",
    "lane; 1",
    "1e9",
  ])
    assert.throws(() => M.expression(expression, { lane: 3 }));
});
const input = {
  threads: 256,
  registers: 32,
  staticShared: 0,
  dynamicShared: 0,
  outputs: 1,
};
test("Ada resource bounds and register limiting produce expected occupancy", () => {
  const r = M.occupancy(input, M.presets.ada);
  assert.equal(r.blocks, 6);
  assert.equal(r.residentWarps, 48);
  assert.equal(r.occupancy, 1);
  assert.deepEqual(r.limiting, ["threads", "warps"]);
  const pressure = M.occupancy(
    { ...input, threads: 64, registers: 112 },
    M.presets.ada,
  );
  assert.equal(pressure.blocks, 9);
  assert.equal(pressure.occupancy, 0.375);
  assert.deepEqual(pressure.limiting, ["registers"]);
  assert.equal(
    M.occupancy({ ...input, threads: 33, registers: 0 }, M.presets.ada).warps,
    2,
  );
});
test("shared reservation, invalid launches, unused budgets and output estimates", () => {
  const r = M.occupancy({ ...input, dynamicShared: 60 * 1024 }, M.presets.ada);
  assert.equal(r.allocatedShared, 61 * 1024);
  assert.equal(r.blocks, 1);
  assert.deepEqual(r.limiting, ["shared"]);
  for (const invalid of [
    { threads: 1025 },
    { registers: 256 },
    { staticShared: 49 * 1024 },
    { dynamicShared: 100 * 1024 },
  ])
    assert.equal(
      M.occupancy({ ...input, ...invalid }, M.presets.ada).blocks,
      0,
    );
  assert.equal(
    M.occupancy({ ...input, registers: 0 }, M.presets.generic).caps.registers,
    Infinity,
  );
  assert.equal(M.occupancy(input, M.presets.generic).caps.shared, Infinity);
  assert.equal(
    M.occupancy({ ...input, outputs: 8 }, M.presets.ada).estimatedRegisters,
    39,
  );
  assert.throws(() => M.occupancy({ ...input, threads: 0 }, M.presets.ada));
});
test("all synthetic diagnoses are deterministic, bounded and have causal explanations", () => {
  for (let i = 0; i < D.scenarios.length; i++)
    for (const difficulty of ["beginner", "intermediate", "advanced"])
      for (const seed of [0, 1, 100, 4294967295]) {
        const a = D.generate(i, difficulty, seed),
          b = D.generate(i, difficulty, seed);
        assert.deepEqual(a, b);
        for (const key of [
          "achieved",
          "noEligible",
          "dram",
          "l1",
          "l2",
          "compute",
        ])
          assert.ok(a.metrics[key] >= 1 && a.metrics[key] <= 99);
        assert.ok(a.metrics.eligible >= 0);
        assert.ok(a.scenario.reason.length > 100);
        assert.ok(a.scenario.counter.length > 30);
        assert.ok(D.options.some(([key]) => key === a.scenario.next));
        const occupancy = M.occupancy(
          {
            threads: a.scenario.threads,
            registers: a.scenario.registers,
            staticShared: a.scenario.sharedKB * 1024,
            dynamicShared: 0,
            outputs: 1,
          },
          M.presets.ada,
        );
        assert.ok(occupancy.occupancy > 0 && occupancy.occupancy <= 1);
      }
});
