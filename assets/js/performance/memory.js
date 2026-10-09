"use strict";
PerformanceLab.modules.memory = {
  mount(container) {
    const L = PerformanceLab,
      M = PerformanceModels,
      $ = (id) => document.getElementById(id),
      patterns = {
        contiguous: "base + lane",
        stride2: "base + lane * 2",
        stride4: "base + lane * 4",
        stride8: "base + lane * 8",
        stride32: "base + lane * 32",
        broadcast: "constant",
        reverse: "base + 31 - lane",
        column: "base + lane * matrixWidth",
        custom: "base + lane * stride",
      };
    const s = L.getState("memory", {
      type: "fp32",
      pattern: "contiguous",
      expression: "base + lane",
      base: 0,
      stride: 2,
      constant: 0,
      matrixWidth: 32,
      offset: 0,
      mask: Array(32).fill(true),
      revealed: false,
      prediction: "",
    });
    let result;
    container.innerHTML =
      L.heading(
        "Warp memory access",
        "Predict how the lane addresses of one global-load instruction group into 32-byte sectors.",
      ) +
      `<div class="module-grid"><section class="controls-panel"><h2>One warp / 32 lanes</h2><label>Element type<select id="mem-type"><option>int8</option><option>fp16</option><option>bf16</option><option>fp32</option><option>fp64</option></select></label><label>Access pattern<select id="mem-pattern"><option value="contiguous">Contiguous</option><option value="stride2">Stride 2</option><option value="stride4">Stride 4</option><option value="stride8">Stride 8</option><option value="stride32">Stride 32</option><option value="broadcast">Broadcast</option><option value="reverse">Reverse</option><option value="column">Transpose-like column</option><option value="custom">Custom expression</option></select></label><label class="custom-field">index = <input id="mem-expression" type="text" maxlength="160" spellcheck="false"></label><div class="field-pair"><label>Base element<input id="mem-base" type="number" min="0" max="1000000" required></label><label>Custom stride<input id="mem-stride" type="number" min="0" max="32768" required></label></div><div class="field-pair"><label>Constant index<input id="mem-constant" type="number" min="0" max="1000000" required></label><label>Matrix width<input id="mem-width" type="number" min="1" max="32768" required></label></div><label>Byte alignment offset<input id="mem-offset" type="range" min="0" max="127"><output id="offset-label"></output></label><div class="button-row"><button id="mask-all">All lanes</button><button id="mask-even">Even lanes</button><button id="mask-none">None</button></div><div class="lane-mask" id="lane-mask" aria-label="Toggle active lanes"></div><p class="small">Custom expressions use integers, lane, base, stride, constant, matrixWidth, parentheses and + − * / %. No JavaScript is executed. Indices must be nonnegative integers.</p></section><div><div class="prediction"><strong>Predict</strong> · How many sectors will this request touch?<label>Your sector estimate<input id="mem-prediction" type="number" min="0" max="256" placeholder="Optional prediction"></label><button class="primary" id="mem-run">Run / reveal request</button><span class="small"> R reveals; Esc returns to the lab.</span></div><div id="memory-error" class="error" hidden role="alert"></div><div id="memory-metrics" aria-live="polite"></div><section class="visual-panel"><h2>Lane → element → byte address → sector</h2><div id="warp-lanes" class="warp-grid"></div><div class="memory-hint" id="memory-hover">Hover or focus a lane / sector to see its connections. Click lanes to keep the highlight.</div><h2 style="margin-top:22px">Memory / 32-byte sectors</h2><p class="small" id="memory-type-note">Byte cells show absolute address modulo 32. Each lane groups ${M.typeBytes[s.type]} byte(s) into one element. Untouched gaps are omitted; sector IDs preserve the spacing.</p><div id="memory-sectors" class="memory-sectors"></div></section><div id="memory-explanation" class="explanation"></div></div></div>` +
      L.sources();
    const controls = [
      ["mem-type", "type"],
      ["mem-pattern", "pattern"],
      ["mem-expression", "expression"],
      ["mem-base", "base"],
      ["mem-stride", "stride"],
      ["mem-constant", "constant"],
      ["mem-width", "matrixWidth"],
      ["mem-offset", "offset"],
    ];
    for (const [id, key] of controls) $(id).value = s[key];
    $("mem-prediction").value = s.prediction;
    const palette = [
      "#72e4cf",
      "#8bbcff",
      "#edc47d",
      "#bba8e6",
      "#f2a6bc",
      "#94d89c",
      "#88d1db",
      "#edb184",
    ];
    function highlight(laneId = null, sectorId = null) {
      const requested = laneId === null ? null : result?.lanes[laneId];
      document.querySelectorAll(".lane-card").forEach((el) => {
        const lane = result.lanes[+el.dataset.lane];
        el.classList.toggle(
          "highlight",
          laneId !== null
            ? lane.lane === laneId
            : sectorId !== null &&
                lane.active &&
                lane.sectors.includes(sectorId),
        );
      });
      document.querySelectorAll(".sector").forEach((el) => {
        const id = +el.dataset.sector;
        el.classList.toggle(
          "highlight",
          sectorId !== null
            ? id === sectorId
            : !!requested?.active && requested.sectors.includes(id),
        );
        el.querySelectorAll("i").forEach((byte) =>
          byte.classList.toggle(
            "selected-byte",
            !!requested?.active &&
              +byte.dataset.byte >= requested.address &&
              +byte.dataset.byte < requested.address + result.size,
          ),
        );
      });
      $("memory-hover").textContent = requested
        ? `Lane ${laneId}: index ${requested.index} · bytes ${requested.address}–${requested.address + result.size - 1} · sectors ${requested.sectors.join(", ")}${requested.active ? "" : " · masked; makes no request"}`
        : sectorId !== null
          ? `Sector ${sectorId}: active lanes ${result.sectors.find((x) => x.id === sectorId)?.lanes.size || 0} · cache-line group ${Math.floor(sectorId / 4)}`
          : "Hover or focus a lane / sector to see its connections.";
    }
    function render() {
      $("offset-label").textContent = s.offset + " bytes";
      $("memory-type-note").textContent =
        `Byte cells show address modulo 32. Each ${s.type} element groups ${M.typeBytes[s.type]} byte(s). Untouched gaps are omitted; sector IDs preserve spacing.`;
      $("mem-expression").readOnly = s.pattern !== "custom";
      $("lane-mask").replaceChildren(
        ...s.mask.map((on, i) => {
          const b = document.createElement("button");
          b.textContent = i;
          b.className = on ? "active" : "";
          b.setAttribute("aria-label", `Lane ${i} active`);
          b.setAttribute("aria-pressed", on);
          b.onclick = () => {
            s.mask[i] = !s.mask[i];
            s.revealed = false;
            render();
          };
          return b;
        }),
      );
      try {
        for (const [id, key] of controls.filter((x) =>
          ["base", "stride", "constant", "matrixWidth"].includes(x[1]),
        ))
          if (!$(id).checkValidity() || !Number.isSafeInteger(s[key]))
            throw Error(
              "Enter valid integer base, stride, constant, and matrix width values.",
            );
        result = M.memory(s);
        $("memory-error").hidden = true;
      } catch (e) {
        result = null;
        $("memory-error").textContent = e.message;
        $("memory-error").hidden = false;
        $("memory-metrics").replaceChildren();
        $("warp-lanes").replaceChildren();
        $("memory-sectors").replaceChildren();
        $("memory-explanation").replaceChildren();
        L.save("memory");
        return;
      }
      $("warp-lanes").replaceChildren(
        ...result.lanes.map((lane) => {
          const b = document.createElement("button");
          b.className = "lane-card" + (lane.active ? "" : " masked");
          b.dataset.lane = lane.lane;
          b.style.setProperty(
            "--sector-color",
            palette[lane.sectors[0] % palette.length],
          );
          b.innerHTML = `<strong>Lane ${lane.lane}</strong><span>i ${lane.index}</span><span>@ ${lane.address} B</span><span>S ${lane.sectors.join("/")}</span><span>L ${lane.lines.join("/")} · ${lane.active ? "active" : "masked"}</span>`;
          b.onpointerenter = b.onfocus = () => highlight(lane.lane);
          b.onclick = () => highlight(lane.lane);
          return b;
        }),
      );
      $("memory-sectors").replaceChildren(
        ...result.sectors.map((sector) => {
          const el = document.createElement("div");
          el.className = "sector";
          el.tabIndex = 0;
          el.dataset.sector = sector.id;
          el.style.setProperty(
            "--sector-color",
            palette[sector.id % palette.length],
          );
          el.setAttribute(
            "aria-label",
            `Sector ${sector.id}, bytes ${sector.id * 32} to ${sector.id * 32 + 31}, cache-line group ${sector.line}`,
          );
          const title = document.createElement("div");
          title.className = "sector-title";
          title.innerHTML = `<span>Sector ${sector.id} · L${sector.line}</span><span>${sector.id * 32}…${sector.id * 32 + 31} B</span>`;
          const bytes = document.createElement("div");
          bytes.className = "sector-bytes";
          for (let j = 0; j < 32; j++) {
            const b = document.createElement("i"),
              address = sector.id * 32 + j;
            b.textContent = j;
            b.dataset.byte = address;
            b.className = sector.bytes.has(address) ? "used" : "";
            const owners = result.lanes
              .filter(
                (l) =>
                  l.active &&
                  address >= l.address &&
                  address < l.address + result.size,
              )
              .map((l) => l.lane);
            b.title = `Byte ${address} · element ${Math.floor((address - s.offset) / result.size)} · lanes ${owners.join(", ") || "unused"}`;
            bytes.append(b);
          }
          const owners = document.createElement("div");
          owners.className = "sector-lanes";
          owners.textContent = "Lanes: " + [...sector.lanes].join(", ");
          el.append(title, bytes, owners);
          el.onpointerenter = el.onfocus = () => highlight(null, sector.id);
          el.onclick = () => highlight(null, sector.id);
          return el;
        }),
      );
      $("memory-metrics").innerHTML = s.revealed
        ? L.metrics([
            [result.active, "active lanes"],
            [
              result.useful + " B",
              "lane-demand bytes",
              "Counts repeated requests per lane",
            ],
            [result.unique + " B", "unique useful bytes"],
            [result.sectors.length, "sectors touched"],
            [
              result.fetched + " B",
              "conceptual sector bytes",
              "Assuming touched sectors need fetching",
            ],
            [result.requests, "modeled warp requests"],
            [result.sectorsPerRequest, "sectors / single request"],
            [
              (100 * result.efficiency).toFixed(1) + "%",
              "unique-byte efficiency",
            ],
          ])
        : '<div class="unrevealed">Make a prediction, then Run to reveal the metrics. The address map is available for inspection.</div>';
      const comparison =
        s.revealed && s.prediction !== ""
          ? `You predicted ${L.escape(s.prediction)} sectors; the model touches ${result.sectors.length}. `
          : "";
      $("memory-explanation").innerHTML =
        "<h2>Explain / choose the next experiment</h2><p><strong>Coalescing is determined by the addresses requested by lanes in a warp, not by block size alone.</strong></p><p>" +
        comparison +
        (s.revealed
          ? `${result.active} active lanes request ${result.useful} lane-demand bytes, covering ${result.unique} distinct bytes in ${result.sectors.length} sectors. Try changing alignment, stride, or the mask while holding the data type fixed.`
          : "Compare contiguous and strided requests before revealing the counts.") +
        "</p><p>Efficiency uses distinct useful bytes / (sectors × 32), so broadcast does not exceed 100%. Sector grouping is a request-level educational model, not a count of DRAM transactions. Cache hits, cache policy, instruction splitting, compression, and memory-controller behavior are not simulated. A cache-line group is four sectors (128 bytes), using Nsight’s terminology; profiler sectors/request is aggregated from real counters. Unaligned offsets explore address geometry; legal compiled accesses depend on the type and instruction.</p>";
      L.save("memory");
    }
    controls.forEach(
      ([id, key]) =>
        ($(id).oninput = () => {
          s[key] = [
            "base",
            "stride",
            "constant",
            "matrixWidth",
            "offset",
          ].includes(key)
            ? Number($(id).value)
            : $(id).value;
          if (key === "pattern") {
            s.expression = patterns[s.pattern];
            $("mem-expression").value = s.expression;
          }
          s.revealed = false;
          render();
        }),
    );
    $("mem-prediction").oninput = () => {
      s.prediction = $("mem-prediction").value;
      L.save("memory");
    };
    $("mem-run").onclick = () => {
      s.revealed = true;
      render();
    };
    for (const [id, fn] of [
      ["mask-all", () => true],
      ["mask-even", (i) => i % 2 === 0],
      ["mask-none", () => false],
    ])
      $(id).onclick = () => {
        s.mask = Array.from({ length: 32 }, (_, i) => fn(i));
        s.revealed = false;
        render();
      };
    const key = (e) => {
      if (
        e.key.toLowerCase() === "r" &&
        !["INPUT", "SELECT", "TEXTAREA"].includes(
          document.activeElement.tagName,
        )
      )
        $("mem-run").click();
    };
    window.addEventListener("keydown", key);
    render();
    return () => {
      L.save("memory");
      window.removeEventListener("keydown", key);
    };
  },
};
