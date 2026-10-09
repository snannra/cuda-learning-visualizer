/* Pure snapshot descriptions and validated configurations. No UI or persistence. */
(function (root) {
  "use strict";
  const node = typeof module !== "undefined" && module.exports;
  const PerformanceModels = node
    ? require("./models.js")
    : root.PerformanceModels;
  const Phase2Models = node ? require("./phase2-models.js") : root.Phase2Models;
  const Phase3Models = node ? require("./phase3-models.js") : root.Phase3Models;
  const DiagnosisData = node
    ? require("./diagnosis-data.js")
    : root.DiagnosisData;
  const api = {
    describe(key, s) {
      if (!s) throw Error("Run this lab before saving a snapshot.");
      let record = {
        title: key[0].toUpperCase() + key.slice(1) + " experiment",
        kernel: key,
        module: key,
        configuration: JSON.parse(JSON.stringify(s)),
        hypothesis: s.prediction || "",
        notes:
          "Saved educational configuration. No hardware metrics were collected.",
      };
      if (key === "blocking") {
        const r = Phase3Models.blocking(s);
        Object.assign(record, {
          title: s.outputs + " outputs/thread · register blocking",
          kernel: "FP32 register-blocked matmul",
          blockX: s.bx,
          blockY: s.by,
          tileX: s.bx * s.outputs,
          tileY: s.by,
          registerEstimate: r.occupancy.estimatedRegisters,
          sharedBytes: r.shared,
          occupancyPercent: r.occupancy.occupancy * 100,
          details: {
            "Outputs / thread": s.outputs,
            Reference: s.arch,
            "Tile K depth": s.tileK,
            "Shared-read intensity · FLOPs/byte": r.intensity,
            "Limiting resource": r.occupancy.limiting.join(" + "),
          },
        });
      } else if (key === "pipeline") {
        const r = Phase3Models.pipeline(s);
        Object.assign(record, {
          kernel: "Conceptual tiled pipeline",
          sharedBytes: r[s.mode].sharedKB * 1024,
          details: {
            "Tile count": s.tiles,
            "Sequential toy ticks": r.sequential.total,
            "Double-buffer toy ticks": r.overlap.total,
            "Toy ticks avoided": r.saved,
            "Selected mode": s.mode,
          },
        });
      } else if (key === "mapping") {
        const r = Phase2Models.mapping(s);
        Object.assign(record, {
          title: s.mode + " mapping · warp " + s.warp,
          kernel: "FP32 output stores",
          blockX: s.bx,
          blockY: s.by,
          tileX: s.tw,
          tileY: s.th,
          sectorsPerRequest: r.sectors.length,
          details: {
            "Active lanes": r.active,
            "Store efficiency %": r.efficiency * 100,
            "Tile coverage holes": r.holes,
            "Matrix width": s.mw,
            "Matrix height": s.mh,
          },
        });
      } else if (key === "occupancy") {
        const r = PerformanceModels.occupancy(
          {
            threads: s.threads,
            registers: s.registers,
            staticShared: s.staticKB * 1024,
            dynamicShared: s.dynamicKB * 1024,
            outputs: s.outputs,
          },
          s.arch,
        );
        Object.assign(record, {
          kernel: "Resource / residency estimate",
          registerEstimate: r.estimatedRegisters,
          sharedBytes: r.sharedUsage,
          occupancyPercent: r.occupancy * 100,
          details: {
            "Threads / block": s.threads,
            Reference: s.arch.label || "Custom",
            "Resident warps": r.residentWarps,
            "Limiting resource": r.limiting.join(" + "),
          },
        });
      } else if (key === "memory") {
        const r = PerformanceModels.memory(s);
        Object.assign(record, {
          kernel: "Warp " + s.type + " memory access",
          sectorsPerRequest: r.sectorsPerRequest,
          details: {
            Expression: s.expression,
            "Active lanes": r.active,
            "Distinct useful bytes": r.unique,
            "Sector bytes": r.fetched,
            "Efficiency %": r.efficiency * 100,
          },
        });
      } else if (key === "roofline") {
        const r = Phase2Models.roofline(s);
        record.details = {
          FLOPs: s.flops,
          "Global bytes": s.bytes,
          "Intensity · FLOPs/byte": r.intensity,
          "Ceiling · TFLOP/s": r.ceiling,
          "Hypothetical throughput · TFLOP/s": r.throughput,
          Regime: r.regime,
        };
      } else if (key === "scheduler") {
        record.details = {
          "Resident warps": s.warps,
          "Scheduler partitions": s.schedulers,
          "Global toy latency": s.latency,
          "Simulated cycles": s.cycles,
          Preset: s.preset,
        };
      } else if (key === "tree") {
        const r = Phase3Models.walkTree(s.path);
        record.kernel = "Bottleneck investigation";
        record.title = r.node.title || "In-progress investigation";
        record.hypothesis = r.node.title || "";
        record.notes = s.notes;
        record.details = {
          "Reasoning path": r.trail.map((t) => t.answer).join(" → "),
          "Investigate next": r.node.next || r.node.question,
        };
      } else if (key === "diagnosis") {
        const r = DiagnosisData.generate(s.index, s.difficulty, s.seed),
          sc = r.scenario,
          m = r.metrics,
          resource = PerformanceModels.occupancy(
            {
              threads: sc.threads,
              registers: sc.registers,
              staticShared: sc.sharedKB * 1024,
              dynamicShared: 0,
              outputs: 1,
            },
            PerformanceModels.presets.ada,
          );
        m.theoretical = +(resource.occupancy * 100).toFixed(1);
        m.registers = sc.registers;
        m.shared = sc.sharedKB;
        m.achieved = Math.min(m.achieved, m.theoretical);
        Object.assign(record, {
          source: "synthetic",
          kernel: "Synthetic profiler exercise",
          hypothesis: s.answer || "",
          notes: s.evidence || "",
          registerEstimate: m.registers,
          sharedBytes: Math.round(m.shared * 1024),
          sectorsPerRequest: m.sectors,
          occupancyPercent: m.theoretical,
          details: {
            Difficulty: s.difficulty,
            "Achieved occupancy %": m.achieved,
            "DRAM bandwidth %": m.dram,
            "Stall reason": r.stall,
          },
        });
      } else throw Error("This module has no snapshot adapter.");
      return record;
    },
    restore(record) {
      const c = record.configuration,
        key = record.module;
      if (!c) throw Error("No restorable configuration in this record.");
      let clean;
      const number = (k, min, max, int = true) => {
        const v = c[k];
        if (
          typeof v !== "number" ||
          !Number.isFinite(v) ||
          v < min ||
          v > max ||
          (int && !Number.isInteger(v))
        )
          throw Error("Invalid saved " + k + ".");
        return v;
      };
      if (key === "blocking") {
        clean = {
          n: number("n", 4, 16),
          bx: number("bx", 1, 32),
          by: number("by", 1, 32),
          tileK: number("tileK", 1, 16),
          registers: number("registers", 0, 240),
          outputs: number("outputs", 1, 4),
          tx: number("tx", 0, 31),
          ty: number("ty", 0, 31),
          step: number("step", 0, 49),
          speed: number("speed", 200, 1000),
          arch: c.arch,
          prediction: "",
          revealed: true,
        };
        Phase3Models.blocking(clean);
      } else if (key === "pipeline") {
        clean = {
          tiles: number("tiles", 1, 16),
          load: number("load", 1, 100),
          compute: number("compute", 1, 100),
          issue: number("issue", 1, 10),
          tileKB: number("tileKB", 1, 48),
          time: number("time", 0, 3376),
          speed: number("speed", 40, 400),
          mode: c.mode,
          prediction: "",
          revealed: true,
        };
        if (!["sequential", "overlap"].includes(clean.mode))
          throw Error("Invalid pipeline mode.");
        Phase3Models.pipeline(clean);
      } else if (key === "mapping") {
        clean = {
          bx: number("bx", 1, 1024),
          by: number("by", 1, 1024),
          tw: number("tw", 1, 64),
          th: number("th", 1, 64),
          mw: number("mw", 1, 4096),
          mh: number("mh", 1, 4096),
          ix: number("ix", 0, 4095),
          iy: number("iy", 0, 4095),
          warp: number("warp", 0, 31),
          selected: number("selected", 0, 1023),
          mode: c.mode,
          prediction: "",
          revealed: true,
        };
        if (
          clean.bx * clean.by > 1024 ||
          !["direct", "linear", "transpose"].includes(clean.mode) ||
          clean.warp >= Math.ceil((clean.bx * clean.by) / 32) ||
          clean.selected >= clean.bx * clean.by
        )
          throw Error("Invalid thread mapping.");
      } else if (key === "roofline") {
        clean = {
          flops: number("flops", 1, 1e15, false),
          bytes: number("bytes", 1, 1e15, false),
          peak: number("peak", 0.01, 10000, false),
          bandwidth: number("bandwidth", 0.01, 100000, false),
          attainment: number("attainment", 0.05, 1, false),
          prediction: "",
        };
        Phase2Models.roofline(clean);
      } else if (key === "tree") {
        if (!Array.isArray(c.path) || c.path.length > 10)
          throw Error("Invalid decision path.");
        Phase3Models.walkTree(c.path);
        clean = { path: [...c.path], notes: record.notes.slice(0, 5000) };
      } else if (key === "memory") {
        if (
          !Object.hasOwn(PerformanceModels.typeBytes, c.type) ||
          !Array.isArray(c.mask) ||
          c.mask.length !== 32 ||
          !c.mask.every((v) => typeof v === "boolean") ||
          ![
            "contiguous",
            "stride2",
            "stride4",
            "stride8",
            "stride32",
            "broadcast",
            "reverse",
            "column",
            "custom",
          ].includes(c.pattern) ||
          typeof c.expression !== "string"
        )
          throw Error("Invalid warp access configuration.");
        clean = {
          type: c.type,
          pattern: c.pattern,
          expression: c.expression,
          mask: [...c.mask],
          base: number("base", 0, 1000000),
          stride: number("stride", 0, 32768),
          constant: number("constant", 0, 1000000),
          matrixWidth: number("matrixWidth", 1, 32768),
          offset: number("offset", 0, 127),
          revealed: true,
          prediction: "",
        };
        PerformanceModels.memory(clean);
      } else if (key === "occupancy") {
        const arch = c.arch;
        if (!arch || typeof arch !== "object")
          throw Error("Missing reference architecture.");
        const bounds = {
            threads: [1, 8192],
            warps: [1, 128],
            registers: [1, 1048576],
            shared: [1024, 1048576],
            blocks: [1, 64],
            maxBlockThreads: [1, 4096],
            maxBlockShared: [0, 1048576],
            maxStaticShared: [0, 1048576],
            maxRegisters: [1, 512],
            reservedShared: [0, 16384],
          },
          reference = { label: "Restored reference" };
        for (const [k, [min, max]] of Object.entries(bounds)) {
          const v = arch[k];
          if (!Number.isInteger(v) || v < min || v > max)
            throw Error("Invalid saved reference " + k + ".");
          reference[k] = v;
        }
        clean = {
          preset: ["generic", "ada", "custom"].includes(c.preset)
            ? c.preset
            : "custom",
          arch: reference,
          threads: number("threads", 1, 4096),
          registers: number("registers", 0, 512),
          staticKB: number("staticKB", 0, 1024, false),
          dynamicKB: number("dynamicKB", 0, 1024, false),
          outputs: number("outputs", 1, 8),
          prediction: "registers",
          revealed: true,
        };
        PerformanceModels.occupancy(
          {
            threads: clean.threads,
            registers: clean.registers,
            staticShared: clean.staticKB * 1024,
            dynamicShared: clean.dynamicKB * 1024,
            outputs: clean.outputs,
          },
          reference,
        );
      } else if (key === "scheduler") {
        if (
          !Object.hasOwn(Phase2Models.presets, c.preset) ||
          ![1, 2, 4].includes(c.schedulers)
        )
          throw Error("Invalid scheduler preset.");
        clean = {
          preset: c.preset,
          warps: number("warps", 1, 64),
          latency: number("latency", 1, 200),
          schedulers: c.schedulers,
          cycles: number("cycles", 0, 2000),
          prediction: "",
          revealed: true,
        };
      } else if (key === "diagnosis") {
        if (
          !["beginner", "intermediate", "advanced"].includes(c.difficulty) ||
          typeof c.answer !== "string" ||
          (c.answer &&
            !DiagnosisData.scenarios.some((r) => r.id === c.answer)) ||
          typeof c.nextChoice !== "string" ||
          c.nextChoice.length > 200
        )
          throw Error("Invalid diagnosis exercise.");
        clean = {
          difficulty: c.difficulty,
          index: number("index", 0, 6),
          seed: number("seed", 0, 4294967295),
          answer: c.answer,
          evidence: record.notes.slice(0, 1200),
          submitted: !!c.submitted,
          nextChoice: c.nextChoice,
          nextSubmitted: !!c.nextSubmitted,
          total: number("total", 0, 1000000),
          correct: number("correct", 0, 1000000),
        };
        if (clean.correct > clean.total) throw Error("Invalid quiz score.");
      } else throw Error("This snapshot has no supported lab configuration.");
      if (typeof c.prediction === "string" && c.prediction.length <= 1000)
        clean.prediction = c.prediction;
      return { key, state: clean };
    },
  };
  if (node) module.exports = api;
  else root.ExperimentAdapters = api;
})(typeof window === "undefined" ? globalThis : window);
