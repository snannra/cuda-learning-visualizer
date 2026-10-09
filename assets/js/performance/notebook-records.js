/* Versioned records. Only descriptive data is accepted; imported configs cannot execute code. */
(function (root) {
  "use strict";
  const fields = {
    blockX: [1, 1000000, true],
    blockY: [1, 1000000, true],
    tileX: [1, 1000000, true],
    tileY: [1, 1000000, true],
    registerEstimate: [0, 512, true],
    sharedBytes: [0, 1073741824, true],
    sectorsPerRequest: [0, 1000000, false],
    occupancyPercent: [0, 100, false],
  };
  function text(value, max, required = false) {
    if (
      typeof value !== "string" ||
      value.length > max ||
      (required && !value.trim())
    )
      throw Error("Invalid or missing notebook text.");
    return value;
  }
  function validate(record) {
    if (!record || typeof record !== "object" || Array.isArray(record))
      throw Error("Invalid experiment record.");
    const r = {
      id: text(record.id, 100, true),
      title: text(record.title, 160, true),
      kernel: text(record.kernel, 160, true),
      source: record.source,
      module: text(record.module || "manual", 40, true),
      hypothesis: text(record.hypothesis || "", 1000),
      notes: text(record.notes || "", 10000),
      timestamp: text(record.timestamp, 40, true),
    };
    if (
      !["educational", "synthetic", "user-profiler"].includes(r.source) ||
      !Number.isFinite(Date.parse(r.timestamp))
    )
      throw Error("Invalid source or timestamp.");
    for (const [key, [min, max, integer]] of Object.entries(fields)) {
      const v = record[key] ?? null;
      if (
        v !== null &&
        (typeof v !== "number" ||
          !Number.isFinite(v) ||
          v < min ||
          v > max ||
          (integer && !Number.isInteger(v)))
      )
        throw Error("Invalid " + key + ".");
      r[key] = v;
    }
    const details = record.details || {};
    if (
      typeof details !== "object" ||
      Array.isArray(details) ||
      Object.keys(details).length > 30
    )
      throw Error("Invalid experiment details.");
    r.details = {};
    for (const [key, v] of Object.entries(details)) {
      if (["__proto__", "constructor", "prototype"].includes(key))
        throw Error("Invalid detail key.");
      text(key, 100, true);
      if (typeof v === "number" && Number.isFinite(v)) r.details[key] = v;
      else if (typeof v === "string") r.details[key] = text(v, 1000);
      else throw Error("Details must be text or finite numbers.");
    }
    // Configurations are restored only after separate module-specific validation.
    r.configuration =
      record.configuration &&
      typeof record.configuration === "object" &&
      !Array.isArray(record.configuration)
        ? JSON.parse(JSON.stringify(record.configuration))
        : null;
    if (r.configuration && JSON.stringify(r.configuration).length > 12000)
      throw Error("Configuration is too large.");
    return r;
  }
  function decode(input) {
    if (
      typeof input !== "string" ||
      new TextEncoder().encode(input).length > 1048576
    )
      throw Error("Notebook file must be under 1 MiB.");
    const data = JSON.parse(input);
    if (
      data.version !== 1 ||
      !Array.isArray(data.experiments) ||
      data.experiments.length > 200
    )
      throw Error(
        "Expected a version 1 notebook with at most 200 experiments.",
      );
    const experiments = data.experiments.map(validate);
    if (new Set(experiments.map((e) => e.id)).size !== experiments.length)
      throw Error("Duplicate experiment IDs.");
    return experiments;
  }
  function delta(a, b, key) {
    return a[key] === null || b[key] === null ? null : b[key] - a[key];
  }
  const api = { fields, validate, decode, delta };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.NotebookRecords = api;
})(typeof window === "undefined" ? globalThis : window);
