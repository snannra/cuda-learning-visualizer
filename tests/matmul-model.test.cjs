const test = require("node:test"),
  assert = require("node:assert/strict"),
  M = require("../assets/js/models/matmul.js");
test("extracted matrix model preserves numerical results, padding and unconditional barrier steps", () => {
  for (const n of [4, 6, 8, 16])
    for (const t of [2, 4, 16])
      for (const pattern of ["small", "identity", "ones"]) {
        const { A, B } = M.makeMatrices(n, pattern);
        for (let r = 0; r < n; r++)
          for (let c = 0; c < n; c++) {
            let expected = 0;
            for (let k = 0; k < n; k++) expected += A[r][k] * B[k][c];
            assert.equal(M.dot(A, B, r, c, n), expected);
            if (pattern === "identity") assert.equal(expected, A[r][c]);
            if (pattern === "ones") assert.equal(expected, n);
          }
        const steps = M.makeSteps(n, t, "tiled");
        assert.equal(steps.at(-1).phase, "store");
        assert.equal(
          steps.filter((s) => s.phase === "ready").length,
          Math.ceil(n / t),
        );
        assert.equal(
          steps.filter((s) => s.phase === "release").length,
          Math.ceil(n / t),
        );
        assert.equal(steps.at(-2).count, n);
        for (const mode of ["naive", "cpu"])
          assert.equal(
            M.makeSteps(n, t, mode).filter((s) => s.phase === "mac").length,
            n,
          );
      }
});
