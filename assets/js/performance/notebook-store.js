/* Record repository depends on a storage port; it has no knowledge of lab models or routes. */
(function (root) {
  "use strict";
  const node = typeof module !== "undefined" && module.exports;
  const NotebookRecords = node
    ? require("./notebook-records.js")
    : root.NotebookRecords;
  function createNotebookRepository(storage, options = {}) {
    return {
      key: options.key || "diescope.notebook.v1",
      records: null,
      warning: "",
      undo: null,
      load() {
        if (this.records) return this.records;
        try {
          const read = storage.read("persistent", this.key);
          if (read.error && read.value === null) throw read.error;
          if (!read.durable)
            this.warning =
              "Browser storage is unavailable. Changes are kept only in this tab; export JSON to keep them.";
          const raw = read.value;
          this.records = raw ? NotebookRecords.decode(raw) : [];
        } catch (e) {
          this.records = [];
          this.warning =
            "Saved notebook could not be read: " +
            e.message +
            " Existing storage is left untouched until you explicitly save a record.";
        }
        return this.records;
      },
      persist(records) {
        const valid = records.map(NotebookRecords.validate);
        if (valid.length > 200)
          throw Error(
            "The notebook holds up to 200 experiments. Export or remove records first.",
          );
        const data = JSON.stringify({ version: 1, experiments: valid });
        if (new TextEncoder().encode(data).length > 1048576)
          throw Error("Notebook exceeds 1 MiB. Export or shorten notes first.");
        const write = storage.write("persistent", this.key, data);
        this.records = valid;
        this.warning = write.durable
          ? ""
          : "Browser storage is unavailable. Changes are kept only in this tab; export JSON to keep them.";
        return write.durable;
      },
      add(record) {
        const r = NotebookRecords.validate(record);
        const records = this.load();
        if (records.some((e) => e.id === r.id))
          throw Error("Experiment ID already exists.");
        const persistent = this.persist([...records, r]);
        return {
          record: r,
          message: persistent
            ? "Experiment saved locally. Open Notebook to compare or edit it."
            : this.warning,
        };
      },
      create(input) {
        return {
          id: (options.id || (() => crypto.randomUUID()))(),
          timestamp: (options.now || (() => new Date().toISOString()))(),
          title: "Untitled experiment",
          kernel: "Custom kernel",
          source: "educational",
          module: "manual",
          hypothesis: "",
          notes: "",
          ...Object.fromEntries(
            Object.keys(NotebookRecords.fields).map((k) => [k, null]),
          ),
          ...input,
        };
      },
    };
  }
  const api = { createNotebookRepository };
  if (node) module.exports = api;
  else root.NotebookRepository = api;
})(typeof window === "undefined" ? globalThis : window);
