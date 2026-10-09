/* Deterministic teaching models, not compiler output or device timing. */
(function (root) {
  "use strict";
  const P =
    typeof module !== "undefined" && module.exports
      ? require("./models.js")
      : root.PerformanceModels;
  function blocking(c) {
    for (const [k, min, max] of [
      ["n", 4, 16],
      ["bx", 1, 32],
      ["by", 1, 32],
      ["tileK", 1, 16],
      ["registers", 0, 240],
      ["tx", 0, 31],
      ["ty", 0, 31],
      ["step", 0, 49],
    ])
      if (!Number.isInteger(c[k]) || c[k] < min || c[k] > max)
        throw Error("Invalid register-blocking configuration.");
    if (
      ![1, 2, 4].includes(c.outputs) ||
      c.bx * c.by > 1024 ||
      c.tx >= c.bx ||
      c.ty >= c.by ||
      !P.presets[c.arch]
    )
      throw Error("Invalid block, outputs, or reference architecture.");
    const A = (r, k) => 1 + ((r + k) % 4),
      B = (k, col) => 1 + ((k * 2 + col) % 5),
      cols = Array.from({ length: c.outputs }, (_, i) => c.tx * c.outputs + i),
      row = c.ty;
    const events = [{ phase: "initialize", k: 0 }];
    for (let k = 0; k < c.n; k++)
      events.push(
        { phase: "load A", k },
        { phase: "load B", k },
        { phase: "accumulate", k },
      );
    events.push({ phase: "store outputs", k: c.n - 1 });
    const step = Math.min(c.step, events.length - 1),
      event = events[step],
      acc = cols.map(() => 0);
    for (let i = 1; i <= step; i++)
      if (events[i].phase === "accumulate")
        for (let o = 0; o < cols.length; o++)
          if (row < c.n && cols[o] < c.n)
            acc[o] += A(row, events[i].k) * B(events[i].k, cols[o]);
    const shared = 4 * c.tileK * (c.by + c.bx * c.outputs),
      occupancy = P.occupancy(
        {
          threads: c.bx * c.by,
          registers: c.registers,
          staticShared: shared,
          dynamicShared: 0,
          outputs: c.outputs,
        },
        P.presets[c.arch],
      );
    return {
      events,
      step,
      event,
      acc,
      cols,
      row,
      A,
      B,
      shared,
      occupancy,
      aLoads: c.n,
      bLoads: c.n * c.outputs,
      flops: 2 * c.n * c.outputs,
      intensity: c.outputs / (2 * (1 + c.outputs)),
      valid: cols.map((col) => row < c.n && col < c.n),
    };
  }
  function pipeline(c) {
    for (const [k, min, max] of [
      ["tiles", 1, 16],
      ["load", 1, 100],
      ["compute", 1, 100],
      ["issue", 1, 10],
      ["tileKB", 1, 48],
    ])
      if (!Number.isInteger(c[k]) || c[k] < min || c[k] > max)
        throw Error(
          "Pipeline values must be integers within the displayed bounds.",
        );
    function schedule(buffers) {
      const rows = [];
      let loadFree = 0,
        computeFree = 0;
      const bufferFree = Array(buffers).fill(0);
      for (let tile = 0; tile < c.tiles; tile++) {
        const buffer = tile % buffers,
          start = Math.max(loadFree, bufferFree[buffer]),
          loadEnd = start + c.issue + c.load,
          computeStart = Math.max(loadEnd, computeFree),
          end = computeStart + c.compute;
        rows.push({
          tile,
          buffer,
          start,
          issueEnd: start + c.issue,
          loadEnd,
          computeStart,
          end,
        });
        loadFree = loadEnd;
        computeFree = end;
        bufferFree[buffer] = end;
      }
      return { rows, total: computeFree, sharedKB: buffers * c.tileKB };
    }
    const sequential = schedule(1),
      overlap = schedule(2);
    function buffersAt(time, plan) {
      return Array.from(
        { length: plan === sequential ? 1 : 2 },
        (_, buffer) => {
          const r = plan.rows.find(
            (r) => r.buffer === buffer && time >= r.start && time < r.end,
          );
          return !r
            ? { buffer, state: "empty", tile: null }
            : {
                buffer,
                tile: r.tile,
                state:
                  time < r.loadEnd
                    ? "loading"
                    : time < r.computeStart
                      ? "ready"
                      : "being consumed",
              };
        },
      );
    }
    return {
      sequential,
      overlap,
      saved: sequential.total - overlap.total,
      ratio: sequential.total / overlap.total,
      buffersAt,
    };
  }
  const tree = {
    start: {
      question:
        "Kernel is slower than expected. Is DRAM bandwidth near its sustainable peak?",
      context:
        "Use a matching workload and device reference; there is no universal percentage threshold.",
      choices: [
        ["yes", "Near peak", "coalescing"],
        ["no", "Below peak", "eligible"],
        ["unknown", "Not measured", "measure"],
      ],
    },
    coalescing: {
      question: "Are warp accesses efficiently coalesced?",
      context:
        "Compare sectors/request with datatype, active masks, alignment and the instruction width.",
      choices: [
        ["yes", "Yes", "bandwidth"],
        ["no", "No / wasteful sectors", "locality"],
        ["unknown", "Unsure", "accessMeasure"],
      ],
    },
    eligible: {
      question: "Are eligible warps per scheduler low?",
      context:
        "Distinguish resident warps from warps ready to issue; compare no-eligible cycles and stall samples.",
      choices: [
        ["yes", "Yes", "occupancy"],
        ["no", "No", "compute"],
        ["unknown", "Not measured", "measure"],
      ],
    },
    occupancy: {
      question: "Is theoretical occupancy limited by resources?",
      context:
        "Check compiler registers, shared allocation and architectural limits; achieved occupancy can be lower for other reasons.",
      choices: [
        ["yes", "Yes", "resources"],
        ["no", "No / plenty of resident warps", "dependency"],
        ["unknown", "Unsure", "occupancyMeasure"],
      ],
    },
    dependency: {
      question: "Which dependency or synchronization signal is strongest?",
      context:
        "Stall samples suggest where to investigate. They are not percentages of elapsed runtime and do not prove causality.",
      choices: [
        ["long", "Long Scoreboard", "long"],
        ["short", "Short Scoreboard", "short"],
        ["barrier", "Barrier", "barrier"],
        ["other", "Other / mixed / unknown", "mixed"],
      ],
    },
    compute: {
      question: "Is a compute pipeline near sustainable throughput?",
      context:
        "Eligible but not-selected warps can mean available work competes for issue slots; not-selected is not a dependency stall.",
      choices: [
        ["yes", "Yes", "math"],
        ["no", "No / mixed", "mixed"],
        ["unknown", "Not measured", "measure"],
      ],
    },
    bandwidth: {
      title: "Likely bandwidth ceiling",
      signal: "Near-peak bandwidth plus efficient accesses is a strong signal.",
      next: "Reduce bytes moved through reuse, fusion or a smaller valid datatype. Compare runtime and DRAM bytes for the same useful work.",
      counter:
        "A high percentage can coexist with instruction or synchronization costs. Check whether fewer bytes actually shorten runtime.",
      module: "roofline",
    },
    locality: {
      title: "Investigate access efficiency first",
      signal:
        "Wasteful sectors can saturate memory traffic with little useful work.",
      next: "Inspect lane addresses and change mapping/alignment while keeping useful output work fixed.",
      counter:
        "Higher sector counts can be expected for wider loads or partial alignment. Normalize by useful bytes before concluding.",
      module: "memory",
    },
    accessMeasure: {
      title: "Measure the access pattern",
      signal:
        "Bandwidth alone cannot distinguish useful traffic from inefficient requests.",
      next: "Inspect sectors/request, active lanes, access widths and global bytes. Trace one warp’s addresses.",
      counter:
        "Sector requests are not identical to DRAM transactions; cache behavior also matters.",
      module: "mapping",
    },
    resources: {
      title: "Investigate the binding occupancy resource",
      signal:
        "Low ready-warp count with resource-limited residency suggests insufficient latency hiding.",
      next: "Inspect compiler register count, spills and shared bytes. Change one limiting resource and compare eligibility and runtime.",
      counter:
        "Lower occupancy can accompany better reuse. Raising occupancy alone need not improve performance.",
      module: "occupancy",
    },
    occupancyMeasure: {
      title: "Calculate residency before guessing",
      signal: "Theoretical and achieved occupancy answer different questions.",
      next: "Collect compiler resource counts and launch dimensions. Compare theoretical residency with achieved occupancy.",
      counter:
        "Tiny grids, tails and load imbalance can reduce achieved occupancy without a register limit.",
      module: "occupancy",
    },
    long: {
      title: "Investigate global/local memory dependencies",
      signal:
        "Long Scoreboard points toward pending L1TEX dependencies, not automatically bandwidth saturation.",
      next: "Check locality, L1/L2 hit rates, global/local bytes and spills. Test independent work or reuse before simply adding threads.",
      counter:
        "Local-memory spills can cause this signal too; poor cache hit rate alone does not prove the bottleneck.",
      module: "scheduler",
    },
    short: {
      title: "Investigate shared/MIO dependency chains",
      signal: "Short Scoreboard points toward MIO dependencies outside L1TEX.",
      next: "Inspect shared-memory addresses, bank conflicts, instruction dependencies and MIO throughput. Compare padding or independent work.",
      counter:
        "Short Scoreboard alone is not proof of shared-memory bank conflicts.",
      module: "pipeline",
    },
    barrier: {
      title: "Investigate synchronization imbalance",
      signal:
        "Barrier waits suggest warps in a block reach synchronization at different times.",
      next: "Inspect uneven work, divergent paths and barrier placement. All participating threads must reach required block barriers.",
      counter:
        "Removing a required barrier can make a faster but incorrect kernel. Validate results after every change.",
      module: "scheduler",
    },
    math: {
      title: "Possibly compute-bound",
      signal:
        "High compute throughput with ready warps is a strong signal of a compute ceiling.",
      next: "Compare arithmetic work, precision, instruction mix and Roofline intensity. Reduce redundant computation or use a suitable compute path.",
      counter:
        "Utilization counters depend on the pipeline and sampling definition; verify runtime responds to less arithmetic.",
      module: "roofline",
    },
    mixed: {
      title: "Collect discriminating evidence",
      signal: "The available signals do not identify one clear bottleneck.",
      next: "Check launch size, workload tails, instruction mix, synchronization and host/device transfer timing. Change one variable at a time.",
      counter:
        "Competing signals and measurement overhead can mislead. Separate kernel time from whole-application time.",
      module: "diagnosis",
    },
    measure: {
      title: "Establish a reproducible baseline",
      signal:
        "A hypothesis needs workload context and a repeatable timing result.",
      next: "Record device, launch shape, useful work, warm-up, runtime and profiler metric definitions. Then revisit this tree.",
      counter:
        "This platform does not collect real measurements; enter or compare your own profiler evidence.",
      module: "notebook",
    },
  };
  function walkTree(path) {
    let key = "start",
      trail = [];
    for (const answer of path) {
      const node = tree[key],
        choice = node.choices?.find((c) => c[0] === answer);
      if (!choice) throw Error("Invalid decision path.");
      trail.push({ key, question: node.question, answer: choice[1] });
      key = choice[2];
    }
    return { key, node: tree[key], trail };
  }
  const api = { blocking, pipeline, tree, walkTree };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Phase3Models = api;
})(typeof window === "undefined" ? globalThis : window);
