/* Pure educational models; no hardware measurements or timing claims. */
(function (root) {
  "use strict";
  const presets = {
    healthy: { warps: 32, latency: 12, shared: 3, math: 12, barriers: false },
    global: { warps: 16, latency: 60, shared: 3, math: 4, barriers: false },
    registers: { warps: 4, latency: 12, shared: 3, math: 12, barriers: false },
    barrier: { warps: 16, latency: 18, shared: 3, math: 4, barriers: true },
    shared: { warps: 16, latency: 12, shared: 20, math: 3, barriers: false },
  };
  function scheduler(config) {
    const c = { ...presets.healthy, ...config },
      count = Math.max(1, Math.min(64, Math.floor(c.warps))),
      schedulers = Math.max(1, Math.min(4, Math.floor(c.schedulers || 4)));
    const warps = Array.from({ length: count }, (_, id) => {
      let program = [];
      for (let repeat = 0; repeat < 3; repeat++) {
        program.push("global");
        for (let k = 0; k < c.math + (c.barriers ? id % 4 : 0); k++)
          program.push("alu");
        program.push("shared");
        if (c.barriers) program.push("barrier");
      }
      return {
        id,
        block: Math.floor(id / 4),
        program,
        pc: 0,
        ready: 0,
        wait: "",
        generation: 0,
        barrier: false,
        done: false,
      };
    });
    let cycle = 0,
      issuedTotal = 0,
      emptyCycles = 0;
    const cursors = Array(schedulers).fill(-1),
      history = [];
    function step() {
      for (const w of warps)
        if (!w.barrier && w.ready <= cycle && w.pc >= w.program.length)
          w.done = true;
      for (let b = 0; b < Math.ceil(count / 4); b++) {
        const group = warps.filter((w) => w.block === b);
        if (
          group.every((w) => w.barrier) &&
          new Set(group.map((w) => w.generation)).size === 1
        )
          for (const w of group) {
            w.barrier = false;
            w.generation++;
            w.ready = cycle;
          }
      }
      for (const w of warps)
        if (!w.barrier && w.ready <= cycle && w.pc >= w.program.length)
          w.done = true;
      const states = warps.map((w) =>
        w.done
          ? "completed"
          : w.barrier
            ? "barrier"
            : w.ready > cycle
              ? w.wait
              : "eligible",
      );
      const eligible = states.filter((s) => s === "eligible").length;
      let issued = 0;
      for (let s = 0; s < schedulers; s++) {
        const candidates = warps.filter(
          (w) => w.id % schedulers === s && states[w.id] === "eligible",
        );
        const w = candidates.find((w) => w.id > cursors[s]) || candidates[0];
        if (!w) continue;
        cursors[s] = w.id;
        const op = w.program[w.pc++];
        states[w.id] = "issuing";
        issued++;
        if (op === "barrier") {
          w.barrier = true;
          w.ready = cycle + 1;
        } else {
          w.ready =
            cycle +
            (op === "global" ? c.latency : op === "shared" ? c.shared : 1);
          w.wait =
            op === "global"
              ? "long scoreboard"
              : op === "shared"
                ? "short scoreboard"
                : "eligible";
        }
      }
      issuedTotal += issued;
      if (!eligible) emptyCycles++;
      const snapshot = {
        cycle,
        states,
        eligible,
        issued,
        active: warps.filter((w) => !w.done).length,
        issuedTotal,
        emptyCycles,
        complete: warps.every((w) => w.done),
      };
      history.push(snapshot);
      cycle++;
      return snapshot;
    }
    return { step, history, warps, config: c };
  }
  function roofline({ flops, bytes, peak, bandwidth, attainment = 0.65 }) {
    if (
      ![flops, bytes, peak, bandwidth].every((n) => Number.isFinite(n) && n > 0)
    )
      throw Error("All workload and device values must be positive.");
    const intensity = flops / bytes,
      bandwidthBound = (intensity * bandwidth) / 1000,
      ceiling = Math.min(peak, bandwidthBound);
    return {
      intensity,
      bandwidthBound,
      ceiling,
      knee: (peak * 1000) / bandwidth,
      throughput: ceiling * attainment,
      regime: bandwidthBound < peak ? "Bandwidth ceiling" : "Compute ceiling",
    };
  }
  function mapping(c) {
    const threads = [];
    const coverage = new Set(),
      sectors = new Set();
    let outsideTile = 0,
      outsideMatrix = 0,
      active = 0;
    for (let tid = 0; tid < c.bx * c.by; tid++) {
      const tx = tid % c.bx,
        ty = Math.floor(tid / c.bx);
      let x = tx,
        y = ty;
      if (c.mode === "linear") {
        x = tid % c.tw;
        y = Math.floor(tid / c.tw);
      } else if (c.mode === "transpose") {
        x = ty;
        y = tx;
      }
      const col = c.ix * c.tw + x,
        row = c.iy * c.th + y,
        tileValid = x < c.tw && y < c.th,
        valid = tileValid && col < c.mw && row < c.mh;
      if (tileValid) coverage.add(y * c.tw + x);
      else outsideTile++;
      if (tileValid && !valid) outsideMatrix++;
      const address = (row * c.mw + col) * 4,
        warp = Math.floor(tid / 32),
        lane = tid % 32;
      if (valid && warp === c.warp) {
        active++;
        sectors.add(Math.floor(address / 32));
      }
      threads.push({
        tid,
        tx,
        ty,
        x,
        y,
        col,
        row,
        address,
        warp,
        lane,
        tileValid,
        valid,
      });
    }
    return {
      threads,
      coverage,
      holes: c.tw * c.th - coverage.size,
      outsideTile,
      outsideMatrix,
      active,
      sectors: [...sectors].sort((a, b) => a - b),
      efficiency: sectors.size ? (active * 4) / (sectors.size * 32) : 0,
    };
  }
  const api = { presets, scheduler, roofline, mapping };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Phase2Models = api;
})(typeof window === "undefined" ? globalThis : window);
