/* Hand-authored causal scenarios; generated numbers are synthetic, never measured. */
(function (root) {
  "use strict";
  const scenarios = [
    {
      id: "coalescing",
      name: "Coalescing / access locality",
      threads: 256,
      registers: 32,
      sharedKB: 0,
      metrics: {
        achieved: 68,
        eligible: 0.25,
        noEligible: 63,
        dram: 24,
        l1: 6,
        l2: 12,
        sectors: 27,
        compute: 14,
      },
      stall: "Long Scoreboard",
      signals: ["sectors", "l1", "l2", "eligible", "dram"],
      reason:
        "Many sectors per warp request, poor cache locality, and few eligible warps point toward inefficient global accesses and exposed load latency. Low DRAM utilization is evidence against bandwidth saturation in this snapshot.",
      competing:
        "In the advanced case, higher DRAM use is a competing signal. The excessive sectors still make access efficiency the first investigation: some bandwidth may be serving bytes the kernel does not use.",
      next: "layout",
      investigate:
        "Change lane-to-address mapping while holding arithmetic and launch geometry fixed. Compare requested sectors and useful bytes; inspect the actual load instructions.",
      counter:
        "Long Scoreboard alone does not establish poor coalescing. Consider cache misses and dependency chains too.",
    },
    {
      id: "latency",
      name: "Global-memory latency",
      threads: 256,
      registers: 32,
      sharedKB: 0,
      metrics: {
        achieved: 82,
        eligible: 0.2,
        noEligible: 70,
        dram: 13,
        l1: 12,
        l2: 12,
        sectors: 4,
        compute: 11,
      },
      stall: "Long Scoreboard",
      signals: ["sectors", "eligible", "noEligible", "dram", "l2"],
      reason:
        "Requests are near the ideal four sectors for a full warp of aligned fp32 loads, but cache misses and long dependency waits leave few warps eligible. DRAM is far from saturation: the signal is exposed latency, not peak bandwidth.",
      competing:
        "High occupancy is a competing signal only if it is mistaken for readiness. Resident warps may all wait on the same dependency; more resident warps do not guarantee that any can issue.",
      next: "latency",
      investigate:
        "Inspect dependent loads and cache locality. Test better reuse or carefully staged prefetching, then check whether eligible warps increase.",
      counter:
        "Prefetching can increase register pressure or traffic; an optimization must be tested against the real workload.",
    },
    {
      id: "bandwidth",
      name: "DRAM bandwidth saturation",
      threads: 256,
      registers: 32,
      sharedKB: 0,
      metrics: {
        achieved: 91,
        eligible: 3.2,
        noEligible: 6,
        dram: 93,
        l1: 25,
        l2: 40,
        sectors: 4.1,
        compute: 30,
      },
      stall: "Memory Throttle",
      signals: ["dram", "sectors", "eligible", "noEligible"],
      reason:
        "Near-peak DRAM bandwidth with roughly four sectors/request suggests efficiently packed traffic consuming the available memory bandwidth. There are ready warps, so lack of residency or eligibility is not the strongest signal.",
      competing:
        "The advanced snapshot includes Long Scoreboard among secondary signals. Waiting on some memory dependencies is compatible with a bandwidth-bound kernel; the sustained high DRAM utilization is the stronger aggregate signal.",
      next: "reuse",
      investigate:
        "Reduce global bytes through valid data reuse, tiling, or a more compact representation. Compare traffic and runtime rather than raising occupancy automatically.",
      counter:
        "A percent-of-peak value depends on the profiler’s peak definition and measurement interval. Confirm with a real profile and roofline analysis.",
    },
    {
      id: "registers",
      name: "Register pressure / low occupancy",
      threads: 64,
      registers: 112,
      sharedKB: 0,
      metrics: {
        achieved: 34,
        eligible: 0.25,
        noEligible: 60,
        dram: 18,
        l1: 55,
        l2: 75,
        sectors: 4,
        compute: 18,
      },
      stall: "Long Scoreboard",
      signals: ["registers", "theoretical", "eligible", "sectors"],
      reason:
        "The 112-register estimate permits only nine 64-thread blocks under the simplified Ada register budget: 18 of 48 warps, or 37.5% theoretical occupancy. Good coalescing plus few eligible warps suggests too little residency to hide the exposed dependency latency.",
      competing:
        "Short Scoreboard in the advanced snapshot indicates an additional MIO/shared/special-function dependency. It is not caused by register pressure itself. Low residency can make that wait harder to hide; verify both hypotheses.",
      next: "registers",
      investigate:
        "Try a smaller per-thread working set or output tile, and inspect compiler register counts and spills. Compare occupancy, eligibility and runtime; reducing registers can also reduce reuse.",
      counter:
        "Low occupancy alone is not a performance defect. This diagnosis depends on the accompanying low eligibility and exposed waits.",
    },
    {
      id: "shared",
      name: "Shared-memory / MIO pressure",
      threads: 128,
      registers: 32,
      sharedKB: 2,
      metrics: {
        achieved: 86,
        eligible: 0.3,
        noEligible: 55,
        dram: 12,
        l1: 88,
        l2: 93,
        sectors: 4,
        compute: 20,
      },
      stall: "Short Scoreboard",
      signals: ["eligible", "noEligible", "dram", "l1"],
      reason:
        "Short Scoreboard with low eligibility and little DRAM activity suggests dependencies on MIO operations, often shared-memory loads or special-function instructions. Good global coalescing makes a global access problem less compelling.",
      competing:
        "A high L1 hit rate is a competing signal only if treated as proof that shared accesses are efficient. L1 hit rate does not measure shared-memory bank conflicts or MIO dependency chains.",
      next: "shared",
      investigate:
        "Inspect shared-memory access strides, bank conflicts, special-function usage, and dependent instruction chains. Change one pattern and observe eligibility and relevant MIO metrics.",
      counter:
        "Short Scoreboard does not prove a bank conflict. The instruction stream and additional shared/MIO metrics are needed.",
    },
    {
      id: "barrier",
      name: "Synchronization / barrier imbalance",
      threads: 256,
      registers: 32,
      sharedKB: 8,
      metrics: {
        achieved: 88,
        eligible: 0.1,
        noEligible: 75,
        dram: 14,
        l1: 72,
        l2: 82,
        sectors: 4,
        compute: 10,
      },
      stall: "Barrier",
      signals: ["eligible", "noEligible", "compute", "dram"],
      reason:
        "Many resident warps are present, but few are ready and barrier waiting dominates. Low compute and DRAM use suggest synchronization or uneven work before barriers rather than saturated hardware pipelines.",
      competing:
        "High achieved occupancy is not evidence of useful execution. Warps waiting at a barrier remain resident. A high cache hit rate does not resolve synchronization imbalance.",
      next: "barrier",
      investigate:
        "Inspect work imbalance before barriers and whether synchronization can safely be reduced or moved. Preserve correctness; every cooperating thread must reach required barriers.",
      counter:
        "Removing a barrier without proving producer/consumer ordering can create races. Compare both correctness and runtime.",
    },
    {
      id: "compute",
      name: "Compute-bound arithmetic pipeline",
      threads: 256,
      registers: 32,
      sharedKB: 0,
      metrics: {
        achieved: 80,
        eligible: 3,
        noEligible: 5,
        dram: 20,
        l1: 78,
        l2: 89,
        sectors: 4,
        compute: 95,
      },
      stall: "Math Pipeline Throttle",
      signals: ["compute", "dram", "eligible", "noEligible"],
      reason:
        "High compute utilization, modest DRAM traffic and enough eligible warps point toward arithmetic throughput as the dominant constraint. Near-ideal sector use does not make memory the bottleneck.",
      competing:
        "Not Selected is prominent in the advanced snapshot. Those warps are eligible but another warp issued; this is a selection state, not a true dependency stall. Interpret it alongside compute saturation.",
      next: "compute",
      investigate:
        "Inspect instruction mix and whether redundant arithmetic can be removed. Where numerics and algorithms allow, test vectorized or specialized matrix instructions; compare work and runtime.",
      counter:
        "Compute utilization is pipeline-specific. A single percentage cannot identify which execution pipe is limiting.",
    },
  ];
  const options = [
    ["layout", "Improve lane-to-address layout"],
    ["latency", "Investigate locality / dependency latency"],
    ["reuse", "Reduce global traffic through reuse"],
    ["registers", "Compare smaller per-thread working sets"],
    ["shared", "Inspect shared banks / MIO dependencies"],
    ["barrier", "Inspect barrier placement / imbalance"],
    ["compute", "Inspect arithmetic work / instruction mix"],
  ];
  function generate(index, difficulty, seed) {
    const scenario = scenarios[index % scenarios.length];
    let state = seed >>> 0;
    const rand = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
    const metrics = { ...scenario.metrics };
    for (const key of ["achieved", "noEligible", "dram", "l1", "l2", "compute"])
      metrics[key] = Math.max(
        1,
        Math.min(
          99,
          metrics[key] +
            Math.round((rand() - 0.5) * (difficulty === "beginner" ? 2 : 6)),
        ),
      );
    metrics.eligible = +(metrics.eligible * (0.9 + rand() * 0.2)).toFixed(2);
    let stall = scenario.stall,
      secondary = "";
    if (difficulty === "advanced") {
      if (scenario.id === "coalescing")
        metrics.dram = 73 + Math.round(rand() * 4);
      if (scenario.id === "registers") {
        stall = "Short Scoreboard";
        secondary = "Long Scoreboard";
      }
      if (scenario.id === "bandwidth") secondary = "Long Scoreboard";
      if (scenario.id === "compute") secondary = "Not Selected";
      if (scenario.id === "shared") secondary = "MIO Throttle";
      if (scenario.id === "barrier") secondary = "Not Selected";
      if (scenario.id === "latency") secondary = "Not Selected";
    } else if (difficulty === "intermediate")
      secondary =
        scenario.id === "registers"
          ? "Short Scoreboard"
          : scenario.id === "bandwidth"
            ? "Long Scoreboard"
            : "Not Selected";
    return { scenario, metrics, stall, secondary };
  }
  const api = { scenarios, options, generate };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.DiagnosisData = api;
})(typeof window !== "undefined" ? window : globalThis);
