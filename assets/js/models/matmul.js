(function (root) {
  "use strict";
  /* Pure model also exported for numerical verification with Node. */
  function makeMatrices(n, pattern) {
    const A = Array.from({ length: n }, (_, r) =>
      Array.from({ length: n }, (_, c) =>
        pattern === "ones" ? 1 : ((r + c * 2) % 5) + 1,
      ),
    );
    const B = Array.from({ length: n }, (_, r) =>
      Array.from({ length: n }, (_, c) =>
        pattern === "identity"
          ? +(r === c)
          : pattern === "ones"
            ? 1
            : ((r * 2 + c) % 5) + 1,
      ),
    );
    return { A, B };
  }
  function makeSteps(n, t, mode) {
    const steps = [{ phase: "init", tile: 0, k: 0, count: 0 }];
    if (mode === "tiled") {
      for (let tile = 0; tile < Math.ceil(n / t); tile++) {
        steps.push(
          { phase: "load", tile, k: 0, count: tile * t },
          { phase: "ready", tile, k: 0, count: tile * t },
        );
        for (let k = 0; k < t; k++)
          steps.push({
            phase: "mac",
            tile,
            k,
            count: Math.min(n, tile * t + k + 1),
          });
        steps.push({
          phase: "release",
          tile,
          k: t - 1,
          count: Math.min(n, (tile + 1) * t),
        });
      }
    } else
      for (let k = 0; k < n; k++)
        steps.push({ phase: "mac", tile: Math.floor(k / t), k, count: k + 1 });
    steps.push({
      phase: "store",
      tile: Math.ceil(n / t) - 1,
      k: t - 1,
      count: n,
    });
    return steps;
  }
  function dot(A, B, r, c, count) {
    let sum = 0;
    for (let k = 0; k < Math.min(count, A.length); k++)
      sum += A[r][k] * B[k][c];
    return sum;
  }

  const api = { makeMatrices, makeSteps, dot };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.MatmulModel = api;
})(typeof window === "undefined" ? globalThis : window);
