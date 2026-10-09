/* Pure educational models. Never execute user expressions as JavaScript. */
(function (root) {
  "use strict";
  function expression(source, vars) {
    source = String(source).replace(/^\s*index\s*=\s*/, "");
    if (source.length > 160)
      throw Error("Expression must be at most 160 characters.");
    const tokens = source.match(/\d+|[A-Za-z_]+|[()+\-*/%]|\S/g) || [];
    let pos = 0;
    const primary = () => {
      const token = tokens[pos++];
      if (token === "(") {
        const v = add();
        if (tokens[pos++] !== ")") throw Error("Missing closing parenthesis.");
        return v;
      }
      if (token === "-") return -primary();
      if (token === "+") return primary();
      if (/^\d+$/.test(token || "")) return Number(token);
      if (Object.hasOwn(vars, token)) return vars[token];
      throw Error(
        "Use integers, lane, base, stride, constant, matrixWidth, and + − * / % ( ).",
      );
    };
    const mul = () => {
      let v = primary();
      while (["*", "/", "%"].includes(tokens[pos])) {
        const op = tokens[pos++],
          r = primary();
        if ((op === "/" || op === "%") && r === 0)
          throw Error("Division by zero.");
        v = op === "*" ? v * r : op === "/" ? v / r : v % r;
      }
      return v;
    };
    const add = () => {
      let v = mul();
      while (["+", "-"].includes(tokens[pos])) {
        const op = tokens[pos++],
          r = mul();
        v = op === "+" ? v + r : v - r;
      }
      return v;
    };
    const value = add();
    if (
      pos !== tokens.length ||
      !Number.isSafeInteger(value) ||
      value < 0 ||
      value > 1000000
    )
      throw Error("Each element index must be an integer from 0 to 1,000,000.");
    return value;
  }
  const typeBytes = { int8: 1, fp16: 2, bf16: 2, fp32: 4, fp64: 8 };
  function memory(config) {
    const size = typeBytes[config.type];
    if (!size) throw Error("Unknown element type.");
    const sectors = new Map(),
      unique = new Set();
    const lanes = [];
    for (let lane = 0; lane < 32; lane++) {
      const index = expression(config.expression, {
        lane,
        base: config.base,
        stride: config.stride,
        constant: config.constant,
        matrixWidth: config.matrixWidth,
      });
      const address = index * size + config.offset;
      const active = !!config.mask[lane];
      const touched = [];
      for (let b = address; b < address + size; b++) {
        const s = Math.floor(b / 32);
        if (!touched.includes(s)) touched.push(s);
        if (active) {
          unique.add(b);
          if (!sectors.has(s))
            sectors.set(s, {
              id: s,
              line: Math.floor(s / 4),
              bytes: new Set(),
              lanes: new Set(),
            });
          sectors.get(s).bytes.add(b);
          sectors.get(s).lanes.add(lane);
        }
      }
      lanes.push({
        lane,
        index,
        address,
        active,
        sectors: touched,
        lines: [...new Set(touched.map((s) => Math.floor(s / 4)))],
      });
    }
    const active = lanes.filter((l) => l.active).length,
      fetched = sectors.size * 32;
    return {
      lanes,
      sectors: [...sectors.values()].sort((a, b) => a.id - b.id),
      active,
      useful: active * size,
      unique: unique.size,
      fetched,
      requests: active ? 1 : 0,
      sectorsPerRequest: sectors.size,
      efficiency: fetched ? unique.size / fetched : 0,
      size,
    };
  }
  const presets = {
    generic: {
      label: "Generic educational GPU",
      threads: 2048,
      warps: 64,
      registers: 65536,
      shared: 64 * 1024,
      blocks: 16,
      maxBlockThreads: 1024,
      maxBlockShared: 48 * 1024,
      maxStaticShared: 48 * 1024,
      maxRegisters: 255,
      reservedShared: 0,
    },
    ada: {
      label: "RTX 4090 / Ada-style reference",
      threads: 1536,
      warps: 48,
      registers: 65536,
      shared: 100 * 1024,
      blocks: 24,
      maxBlockThreads: 1024,
      maxBlockShared: 99 * 1024,
      maxStaticShared: 48 * 1024,
      maxRegisters: 255,
      reservedShared: 1024,
    },
  };
  function occupancy(input, arch) {
    if (
      !Number.isInteger(input.threads) ||
      input.threads < 1 ||
      !Number.isInteger(input.registers) ||
      input.registers < 0 ||
      ![1, 2, 4, 8].includes(input.outputs) ||
      !Number.isInteger(input.staticShared) ||
      input.staticShared < 0 ||
      !Number.isInteger(input.dynamicShared) ||
      input.dynamicShared < 0
    )
      throw Error(
        "Block inputs must be nonnegative integers, with at least one thread and 1/2/4/8 outputs.",
      );
    for (const key of [
      "threads",
      "warps",
      "registers",
      "shared",
      "blocks",
      "maxBlockThreads",
      "maxBlockShared",
      "maxStaticShared",
      "maxRegisters",
      "reservedShared",
    ])
      if (
        !Number.isInteger(arch[key]) ||
        arch[key] <
          (key === "reservedShared" ||
          key === "maxBlockShared" ||
          key === "maxStaticShared"
            ? 0
            : 1)
      )
        throw Error(
          "Reference limits must be valid nonnegative integers with positive SM capacities.",
        );
    const warps = Math.ceil(input.threads / 32),
      estimatedRegisters = input.registers + input.outputs - 1;
    const registerUsage = estimatedRegisters * warps * 32;
    const sharedUsage = input.staticShared + input.dynamicShared;
    const allocatedShared = sharedUsage + arch.reservedShared;
    const caps = {
      threads: Math.floor(arch.threads / input.threads),
      warps: Math.floor(arch.warps / warps),
      registers: registerUsage
        ? Math.floor(arch.registers / registerUsage)
        : Infinity,
      shared: allocatedShared
        ? Math.floor(arch.shared / allocatedShared)
        : Infinity,
      blocks: arch.blocks,
    };
    const errors = [];
    if (input.threads > arch.maxBlockThreads)
      errors.push("Threads/block exceeds the configured per-block limit.");
    if (estimatedRegisters > arch.maxRegisters)
      errors.push(
        "Estimated registers/thread exceeds the configured per-thread limit.",
      );
    if (sharedUsage > arch.maxBlockShared)
      errors.push(
        "Requested shared memory exceeds the configured per-block limit.",
      );
    if (input.staticShared > arch.maxStaticShared)
      errors.push("Static shared memory exceeds the configured static limit.");
    const blocks = errors.length ? 0 : Math.min(...Object.values(caps)),
      residentWarps = blocks * warps;
    return {
      warps,
      estimatedRegisters,
      registerUsage,
      sharedUsage,
      allocatedShared,
      caps,
      blocks,
      residentWarps,
      occupancy: residentWarps / arch.warps,
      limiting: errors.length
        ? ["invalid launch"]
        : Object.keys(caps).filter((key) => caps[key] === blocks),
      errors,
    };
  }
  const api = { expression, memory, typeBytes, presets, occupancy };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PerformanceModels = api;
})(typeof window !== "undefined" ? window : globalThis);
