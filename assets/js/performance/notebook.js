"use strict";
PerformanceLab.modules.notebook = {
  mount(el) {
    const L = PerformanceLab,
      N = ExperimentNotebook,
      s = L.getState("notebook", {
        selected: [],
        search: "",
        baseline: "",
        editing: null,
        draft: {
          title: "",
          kernel: "Custom kernel",
          source: "educational",
          hypothesis: "",
          notes: "",
        },
      });
    N.load();
    const fieldDefs = [
      ["blockX", "Block X", 1, 1000000],
      ["blockY", "Block Y", 1, 1000000],
      ["tileX", "Tile width", 1, 1000000],
      ["tileY", "Tile height", 1, 1000000],
      ["registerEstimate", "Registers / thread", 0, 512],
      ["sharedKB", "Shared memory / block · KiB", 0, 1048576],
      ["sectorsPerRequest", "Sectors / request", 0, 1000000],
      ["occupancyPercent", "Theoretical occupancy · %", 0, 100],
    ];
    el.innerHTML =
      L.heading(
        "Make the experiment explainable.",
        "Save configurations, predictions and evidence locally. Select up to four records to compare values and deltas.",
        "LOCAL NOTEBOOK · SOURCES LABELED PER RECORD",
      ) +
      `<div class="button-row"><button id="note-new">New experiment</button><button id="note-export">Export JSON</button><label class="import-label">Import JSON<input id="note-import" type="file" accept=".json,application/json"></label><button id="note-undo" hidden>Undo last deletion</button></div><p id="note-status" class="phase3-status" role="status"></p><details id="note-editor" class="reference-panel" open><summary id="note-editor-title">Record a new experiment</summary><form id="note-form" class="notebook-form"><label>Title<input id="note-title" maxlength="160" placeholder="e.g. Tile 16 / aligned loads" required></label><label>Kernel / workload<input id="note-kernel" maxlength="160" required></label><label>Metric source<select id="note-source"><option value="educational">Educational estimate</option><option value="synthetic">Synthetic exercise</option><option value="user-profiler">User-entered real profiler values</option></select></label>${fieldDefs.map(([key, label, min, max]) => `<label>${label}<input id="note-${key}" type="number" min="${min}" max="${max}" step="${["sharedKB", "sectorsPerRequest", "occupancyPercent"].includes(key) ? "any" : "1"}" placeholder="Unknown / not applicable"></label>`).join("")}<label class="full-field">Bottleneck hypothesis<input id="note-hypothesis" maxlength="1000" placeholder="Predict what limits this workload"></label><label class="full-field">Notes / evidence<textarea id="note-notes" maxlength="10000" placeholder="What changed? What did you observe? For real values, record GPU, metric names, workload and timing method."></textarea></label><div class="full-field button-row"><button type="submit" class="primary" id="note-save">Save experiment</button><button type="button" id="note-cancel">Clear / cancel edit</button></div></form><p class="small">Blank metrics remain unknown, not zero. Profiler values are entered by you; this site does not collect or verify them. Local storage belongs to this browser and origin. Export a backup before clearing browser data.</p></details><div class="button-row"><label>Find experiments<input id="note-search" type="search" placeholder="Title, kernel or hypothesis"></label><label>Comparison baseline<select id="note-baseline"></select></label></div><div id="note-comparison" class="comparison notebook-comparison"></div><div id="note-records" class="notebook-records"></div>`;
    const $ = (id) => el.querySelector("#" + id),
      sourceNames = {
        educational: "EDUCATIONAL ESTIMATE",
        synthetic: "SYNTHETIC SNAPSHOT",
        "user-profiler": "USER-ENTERED PROFILER VALUES",
      },
      labels = {
        blockX: "Block X",
        blockY: "Block Y",
        tileX: "Tile width",
        tileY: "Tile height",
        registerEstimate: "Registers / thread",
        sharedBytes: "Shared bytes / block",
        sectorsPerRequest: "Sectors / request",
        occupancyPercent: "Theoretical occupancy · %",
      },
      format = (n) =>
        n === null
          ? "Unknown"
          : n.toLocaleString(undefined, { maximumFractionDigits: 4 });
    function status(message) {
      $("note-status").textContent = message;
    }
    function fill(record) {
      for (const key of ["title", "kernel", "source", "hypothesis", "notes"])
        $("note-" + key).value =
          record[key] ?? (key === "source" ? "educational" : "");
      for (const [key] of fieldDefs)
        $("note-" + key).value =
          key === "sharedKB"
            ? record.sharedBytes === null || record.sharedBytes === undefined
              ? ""
              : record.sharedBytes / 1024
            : (record[key] ?? "");
      $("note-editor-title").textContent = s.editing
        ? "Edit experiment · creation timestamp preserved"
        : "Record a new experiment";
      $("note-save").textContent = s.editing
        ? "Save changes"
        : "Save experiment";
    }
    function draft() {
      const d = {};
      for (const key of ["title", "kernel", "source", "hypothesis", "notes"])
        d[key] = $("note-" + key).value;
      for (const [key] of fieldDefs) {
        const value = $("note-" + key).value;
        d[key === "sharedKB" ? "sharedBytes" : key] =
          value === "" ? null : Number(value) * (key === "sharedKB" ? 1024 : 1);
      }
      s.draft = d;
      L.save("notebook");
      return d;
    }
    function clear() {
      s.editing = null;
      s.draft = {
        title: "",
        kernel: "Custom kernel",
        source: "educational",
        hypothesis: "",
        notes: "",
      };
      fill(s.draft);
      L.save("notebook");
    }
    function render() {
      const all = N.load();
      s.selected = s.selected
        .filter((id) => all.some((r) => r.id === id))
        .slice(0, 4);
      if (!s.selected.includes(s.baseline)) s.baseline = s.selected[0] || "";
      const chosen = s.selected.map((id) => all.find((r) => r.id === id)),
        base = chosen.find((r) => r.id === s.baseline);
      $("note-baseline").innerHTML = chosen.length
        ? chosen
            .map(
              (r) =>
                `<option value="${L.escape(r.id)}">${L.escape(r.title)}</option>`,
            )
            .join("")
        : "<option>Select records below</option>";
      $("note-baseline").value = s.baseline;
      $("note-baseline").disabled = !chosen.length;
      $("note-comparison").innerHTML = chosen.length
        ? `<h2>Comparison · delta relative to ${L.escape(base.title)}</h2><p class="small">Delta = selected − baseline. Occupancy deltas are percentage points. Deltas do not imply faster or better. Compare the same useful work and compatible metric sources.</p><table><thead><tr><th>Field</th>${chosen.map((r) => `<th>${L.escape(r.title)}</th>`).join("")}</tr></thead><tbody><tr><td>Source</td>${chosen.map((r) => `<td>${sourceNames[r.source]}</td>`).join("")}</tr><tr><td>Kernel</td>${chosen.map((r) => `<td>${L.escape(r.kernel)}</td>`).join("")}</tr>${Object.entries(
            labels,
          )
            .map(
              ([key, label]) =>
                `<tr><td>${label}</td>${chosen
                  .map((r) => {
                    const d = NotebookRecords.delta(base, r, key);
                    return `<td>${format(r[key])}${r.id !== base.id && d !== null ? `<br><span class="delta">Δ ${d > 0 ? "+" : ""}${format(d)}${key === "occupancyPercent" ? " pp" : ""}</span>` : ""}</td>`;
                  })
                  .join("")}</tr>`,
            )
            .join(
              "",
            )}<tr><td>Hypothesis</td>${chosen.map((r) => `<td>${L.escape(r.hypothesis || "Not recorded")}</td>`).join("")}</tr><tr><td>Notes / evidence</td>${chosen.map((r) => `<td>${L.escape(r.notes || "Not recorded")}</td>`).join("")}</tr></tbody></table>`
        : '<p class="small">Select records below to compare. The first selected record is the default baseline.</p>';
      const query = s.search.toLowerCase(),
        records = all
          .filter((r) =>
            (r.title + " " + r.kernel + " " + r.hypothesis)
              .toLowerCase()
              .includes(query),
          )
          .slice()
          .reverse();
      $("note-records").innerHTML = records.length
        ? records
            .map(
              (r) =>
                `<article class="notebook-record ${s.selected.includes(r.id) ? "selected" : ""}"><span class="notebook-source">${sourceNames[r.source]}</span><h3>${L.escape(r.title)}</h3><p>${L.escape(r.kernel)} · ${L.escape(new Date(r.timestamp).toLocaleString())}</p><label><input type="checkbox" data-select="${L.escape(r.id)}" ${s.selected.includes(r.id) ? "checked" : ""}>Compare this experiment</label><p>${L.escape(r.hypothesis || "No hypothesis recorded.")}</p><details><summary>Configuration and notes</summary><p>${L.escape(r.notes || "No notes recorded.")}</p>${Object.entries(
                  r.details,
                )
                  .map(([key, v]) => `<p>${L.escape(key)}: ${L.escape(v)}</p>`)
                  .join(
                    "",
                  )}<p class="small">Block: ${format(r.blockX)} × ${format(r.blockY)} · Tile: ${format(r.tileX)} × ${format(r.tileY)}<br>Registers: ${format(r.registerEstimate)} · Shared: ${format(r.sharedBytes)} bytes<br>Sectors/request: ${format(r.sectorsPerRequest)} · Occupancy: ${r.occupancyPercent === null ? "Unknown" : format(r.occupancyPercent) + "%"}</p></details><div class="button-row"><button data-edit="${L.escape(r.id)}">Edit notes / values</button>${r.configuration && ["blocking", "pipeline", "mapping", "roofline", "tree", "memory", "occupancy", "scheduler", "diagnosis"].includes(r.module) ? `<button data-restore="${L.escape(r.id)}">Restore lab configuration</button>` : ""}<button data-delete="${L.escape(r.id)}">Delete</button></div></article>`,
            )
            .join("")
        : `<div class="notebook-empty">${all.length ? "No matching experiments." : "Your notebook is empty. Save a snapshot from any Performance Lab module or record your own experiment above."}</div>`;
      for (const input of el.querySelectorAll("[data-select]"))
        input.onchange = () => {
          const id = input.dataset.select;
          if (input.checked) {
            if (s.selected.length === 4) {
              input.checked = false;
              status("Compare up to four records at a time.");
              return;
            }
            s.selected.push(id);
          } else s.selected = s.selected.filter((v) => v !== id);
          render();
        };
      for (const button of el.querySelectorAll("[data-edit]"))
        button.onclick = () => {
          const r = all.find((r) => r.id === button.dataset.edit);
          s.editing = r.id;
          s.draft = { ...r };
          fill(r);
          $("note-editor").open = true;
          $("note-editor").scrollIntoView({
            block: "start",
            behavior: "smooth",
          });
          L.save("notebook");
        };
      for (const button of el.querySelectorAll("[data-delete]"))
        button.onclick = () => {
          const index = all.findIndex((r) => r.id === button.dataset.delete);
          N.undo = { record: all[index], index };
          try {
            const persisted = N.persist(all.filter((_, i) => i !== index));
            if (s.editing === N.undo.record.id) clear();
            status(
              persisted ? "Experiment deleted. Undo is available." : N.warning,
            );
            $("note-undo").hidden = false;
            render();
          } catch (e) {
            status(e.message);
          }
        };
      for (const button of el.querySelectorAll("[data-restore]"))
        button.onclick = () => {
          try {
            N.restore(all.find((r) => r.id === button.dataset.restore));
          } catch (e) {
            status("Restore rejected: " + e.message);
          }
        };
      $("note-export").disabled = !all.length;
      L.save("notebook");
    }
    $("note-form").onsubmit = (e) => {
      e.preventDefault();
      try {
        const d = draft();
        if (s.editing) {
          const records = N.load(),
            old = records.find((r) => r.id === s.editing);
          if (!old) throw Error("This experiment no longer exists.");
          const revised = NotebookRecords.validate({ ...old, ...d });
          const persistent = N.persist(
            records.map((r) => (r.id === s.editing ? revised : r)),
          );
          status(persistent ? "Experiment updated." : N.warning);
        } else {
          const result = N.add(N.create(d));
          status(result.message);
        }
        clear();
        render();
      } catch (err) {
        status("Could not save: " + err.message);
      }
    };
    $("note-form").oninput = draft;
    $("note-new").onclick = $("note-cancel").onclick = () => {
      clear();
      $("note-editor").open = true;
    };
    $("note-search").value = s.search;
    $("note-search").oninput = (e) => {
      s.search = e.target.value;
      render();
    };
    $("note-baseline").onchange = (e) => {
      s.baseline = e.target.value;
      render();
    };
    $("note-undo").hidden = !N.undo;
    $("note-undo").onclick = () => {
      if (!N.undo) return;
      try {
        const records = [...N.load()];
        if (records.some((r) => r.id === N.undo.record.id))
          throw Error("Record already exists.");
        records.splice(
          Math.min(N.undo.index, records.length),
          0,
          N.undo.record,
        );
        const persistent = N.persist(records);
        N.undo = null;
        $("note-undo").hidden = true;
        status(persistent ? "Deletion undone." : N.warning);
        render();
      } catch (e) {
        status(e.message);
      }
    };
    $("note-export").onclick = () => {
      const data = JSON.stringify(
          { version: 1, experiments: N.load() },
          null,
          2,
        ),
        url = URL.createObjectURL(
          new Blob([data], { type: "application/json" }),
        ),
        a = document.createElement("a");
      a.href = url;
      a.download =
        "core-and-warp-experiments-" +
        new Date().toISOString().slice(0, 10) +
        ".json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      status("Notebook JSON exported.");
    };
    let disposed = false;
    $("note-import").onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        if (file.size > 1048576)
          throw Error("Import file must be under 1 MiB.");
        const content = await file.text();
        if (disposed) return;
        const imported = NotebookRecords.decode(content),
          records = N.load(),
          fresh = imported.filter(
            (r) => !records.some((old) => old.id === r.id),
          );
        const persistent = N.persist([...records, ...fresh]);
        status(
          persistent
            ? `${fresh.length} experiment(s) imported; ${imported.length - fresh.length} existing IDs skipped.`
            : N.warning,
        );
        render();
      } catch (err) {
        if (!disposed) status("Import rejected: " + err.message);
      } finally {
        e.target.value = "";
      }
    };
    if (s.editing && !N.load().some((r) => r.id === s.editing)) clear();
    fill(s.draft);
    render();
    if (N.warning) status(N.warning);
    return () => {
      disposed = true;
      draft();
    };
  },
};
