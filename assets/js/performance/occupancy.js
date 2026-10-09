"use strict";
PerformanceLab.modules.occupancy = {
  mount(container) {
    const L = PerformanceLab,
      M = PerformanceModels,
      $ = (id) => document.getElementById(id),
      s = L.getState("occupancy", {
        preset: "ada",
        arch: { ...M.presets.ada },
        threads: 256,
        registers: 32,
        staticKB: 0,
        dynamicKB: 0,
        outputs: 1,
        revealed: false,
        prediction: "registers",
      });
    s.arch = { ...s.arch };
    let result;
    container.innerHTML =
      L.heading(
        "Occupancy & resource limits",
        "Predict which resource caps resident blocks. Compare output reuse with accumulator pressure, then inspect the limit.",
      ) +
      `<div class="module-grid"><section class="controls-panel"><h2>Block resources</h2><label>Reference architecture<select id="occ-preset"><option value="generic">Generic educational GPU</option><option value="ada">RTX 4090 / Ada-style reference</option><option value="custom">Custom reference limits</option></select></label><label>Threads / block<input id="occ-threads" type="number" min="1" max="4096" required></label><label>Baseline registers / thread<input id="occ-registers" type="number" min="0" max="512" required></label><label>Static shared memory / block · KiB<input id="occ-static" type="number" min="0" max="1024" step="0.25" required></label><label>Dynamic shared memory / block · KiB<input id="occ-dynamic" type="number" min="0" max="1024" step="0.25" required></label><label>Register blocking · outputs / thread<input id="occ-outputs" type="range" min="0" max="3" step="1"><output id="outputs-label"></output></label><p class="small">Accumulator estimate = baseline registers + (outputs − 1). This teaching rule is not a compiler register count. Reuse potential is illustrated, not measured.</p></section><div><div class="prediction"><strong>Predict</strong> · Which resource will limit occupancy?<label>Your hypothesis<select id="occ-prediction"><option value="threads">Threads</option><option value="warps">Warps</option><option value="registers">Registers</option><option value="shared">Shared memory</option><option value="blocks">Block count</option></select></label><button id="occ-run" class="primary">Calculate / reveal limits</button></div><div class="error" id="occ-error" role="alert" hidden></div><div id="occ-result" aria-live="polite"></div><section class="visual-panel"><h2>Blocks allowed by each resource</h2><div id="occ-bars" class="allocation-bars"></div><h2 style="margin-top:24px">Resident warp slots / SM</h2><div id="resident-warps" class="resident-grid"></div><p class="small">Filled slots are resident warps, including partial warps. Eligibility and achieved occupancy are not simulated.</p></section><div id="occ-explanation" class="explanation"></div><div class="comparison" id="blocking-comparison"></div></div></div><details class="reference-panel"><summary>Editable architecture reference values</summary><p class="small" id="arch-label"></p><div class="reference-fields" id="reference-fields"></div></details><div class="explanation"><h2>Scope of this estimate</h2><p>Occupancy = resident warps / maximum warps per SM. It does not measure achieved occupancy, issue eligibility, speed, or bandwidth. The model rounds threads up to full warps for register storage but omits hardware register-allocation granularity, scheduler partition constraints, compiler allocation and spills.</p><p>The Ada preset uses reference limits and a 1 KiB per-block shared-memory reservation. It assumes the 100 KiB shared carveout and any required dynamic-memory opt-in are available. Static allocations above 48 KiB and total allocations above 99 KiB per block are rejected under that preset. A real kernel needs compiler resource data and the CUDA occupancy API/profiler for exact results.</p></div>` +
      L.sources();
    const controls = [
      ["occ-threads", "threads"],
      ["occ-registers", "registers"],
      ["occ-static", "staticKB"],
      ["occ-dynamic", "dynamicKB"],
    ];
    controls.forEach(([id, key]) => ($(id).value = s[key]));
    $("occ-preset").value = s.preset;
    $("occ-outputs").value = [1, 2, 4, 8].indexOf(s.outputs);
    $("occ-prediction").value = s.prediction;
    const ref = [
      ["threads", "Threads / SM", 1, 8192, 1],
      ["warps", "Warps / SM", 1, 128, 1],
      ["registers", "32-bit registers / SM", 1, 1048576, 1],
      ["shared", "Shared capacity / SM · KiB", 1, 1024, 1024],
      ["blocks", "Blocks / SM", 1, 64, 1],
      ["maxBlockThreads", "Max threads / block", 1, 4096, 1],
      ["maxBlockShared", "Max shared / block · KiB", 0, 1024, 1024],
      ["maxStaticShared", "Max static shared · KiB", 0, 1024, 1024],
      ["maxRegisters", "Max registers / thread", 1, 512, 1],
      ["reservedShared", "Reserved shared / block · KiB", 0, 16, 1024],
    ];
    function referenceFields() {
      $("reference-fields").replaceChildren(
        ...ref.map(([key, label, min, max, unit]) => {
          const el = document.createElement("label");
          el.textContent = label;
          const input = document.createElement("input");
          input.type = "number";
          input.min = min;
          input.max = max;
          input.step = unit === 1024 ? 0.25 : 1;
          input.required = true;
          input.value = s.arch[key] / unit;
          input.dataset.reference = key;
          input.oninput = () => {
            s.arch[key] = Number(input.value) * unit;
            s.preset = "custom";
            $("occ-preset").value = "custom";
            s.revealed = false;
            render();
          };
          el.append(input);
          return el;
        }),
      );
    }
    function inputModel(outputs = s.outputs) {
      return {
        threads: s.threads,
        registers: s.registers,
        staticShared: s.staticKB * 1024,
        dynamicShared: s.dynamicKB * 1024,
        outputs,
      };
    }
    function render() {
      $("outputs-label").textContent = s.outputs + " output(s) / thread";
      $("arch-label").textContent =
        s.preset === "custom"
          ? "Custom configurable teaching limits."
          : s.arch.label +
            " · configurable reference values, not queried hardware.";
      try {
        for (const [id] of controls)
          if (!$(id).checkValidity())
            throw Error("Enter valid block resource values.");
        for (const input of $("reference-fields").querySelectorAll("input"))
          if (!input.checkValidity())
            throw Error("Enter reference values within the displayed limits.");
        result = M.occupancy(inputModel(), s.arch);
        $("occ-error").hidden = true;
      } catch (e) {
        result = null;
        $("occ-error").textContent = e.message;
        $("occ-error").hidden = false;
        $("occ-result").replaceChildren();
        $("occ-bars").replaceChildren();
        $("resident-warps").replaceChildren();
        $("occ-explanation").replaceChildren();
        $("blocking-comparison").replaceChildren();
        L.save("occupancy");
        return;
      }
      if (!s.revealed) {
        $("occ-result").innerHTML =
          '<div class="unrevealed">Choose a limiting-resource hypothesis, then Calculate. Changing a resource starts a new prediction.</div>';
        $("occ-bars").innerHTML =
          '<p class="small">Resource limits will appear after calculation.</p>';
        $("resident-warps").replaceChildren();
        $("occ-explanation").innerHTML =
          "<p>Try 112 registers/thread, or add shared memory. Which budget do you expect to run out first?</p>";
        $("blocking-comparison").replaceChildren();
        L.save("occupancy");
        return;
      }
      $("occ-result").innerHTML = L.metrics([
        [result.warps, "warps / block"],
        [result.estimatedRegisters, "estimated registers / thread"],
        [
          result.registerUsage.toLocaleString(),
          "32-bit registers / block",
          "Warp-rounded estimate",
        ],
        [
          (result.sharedUsage / 1024).toFixed(2) + " KiB",
          "requested shared / block",
        ],
        [
          (result.allocatedShared / 1024).toFixed(2) + " KiB",
          "budgeted shared / block",
          "Includes configured reservation",
        ],
        [result.blocks, "resident blocks / SM"],
        [result.residentWarps, "resident warps / SM"],
        [
          (result.occupancy * 100).toFixed(1) + "%",
          "theoretical occupancy estimate",
        ],
      ]);
      $("occ-bars").replaceChildren(
        ...Object.entries(result.caps).map(([key, count]) => {
          const el = document.createElement("div");
          el.className =
            "allocation-row" +
            (result.limiting.includes(key) ? " limiting" : "");
          const label = document.createElement("span");
          label.textContent = {
            threads: "Threads",
            warps: "Warps",
            registers: "Registers",
            shared: "Shared memory",
            blocks: "Block count",
          }[key];
          const track = document.createElement("div");
          track.className = "allocation-track";
          const fill = document.createElement("div");
          fill.className = "allocation-fill";
          fill.style.width =
            (100 * Math.min(count, s.arch.blocks)) / s.arch.blocks + "%";
          track.append(fill);
          const cap = document.createElement("strong");
          cap.textContent = Number.isFinite(count) ? count : "∞";
          el.append(label, track, cap);
          return el;
        }),
      );
      $("resident-warps").replaceChildren(
        ...Array.from({ length: s.arch.warps }, (_, i) => {
          const el = document.createElement("span");
          el.textContent = i;
          el.className = i < result.residentWarps ? "used" : "";
          return el;
        }),
      );
      const explanation = result.errors.length
        ? result.errors.join(" ")
        : `The ${result.limiting.join(" + ")} limit${result.limiting.length > 1 ? "s tie" : " is binding"}, allowing ${result.blocks} block(s) and ${result.residentWarps} resident warps. Your ${s.prediction} prediction ${result.limiting.includes(s.prediction) ? "matches a binding resource" : "does not match the tightest bound"}. ${result.blocks === 0 ? "This configuration cannot place a block under the configured SM budgets." : ""}`;
      $("occ-explanation").innerHTML =
        "<h2>Explain / optimization choice</h2><p>" +
        L.escape(explanation) +
        "</p><p>Try changing the binding resource while keeping the others fixed. High occupancy does not guarantee high eligible-warp count or high performance; more outputs/thread may improve reuse while reducing residency.</p>";
      $("blocking-comparison").innerHTML =
        "<h2>Register-blocking tradeoff / estimated</h2><table><thead><tr><th>Outputs / thread</th><th>Reuse opportunity</th><th>Estimated regs/thread</th><th>Blocks/SM</th><th>Occupancy</th><th>Limiter</th></tr></thead><tbody>" +
        [1, 2, 4, 8]
          .map((outputs) => {
            const r = M.occupancy(inputModel(outputs), s.arch);
            return `<tr><td>${outputs}${outputs === s.outputs ? " · selected" : ""}</td><td>up to ${outputs} accumulators per reused A value</td><td>${r.estimatedRegisters}</td><td>${r.blocks}</td><td>${(r.occupancy * 100).toFixed(1)}%</td><td>${L.escape(r.limiting.join(" + "))}</td></tr>`;
          })
          .join("") +
        '</tbody></table><p class="small">No configuration is automatically “best.” Register estimates omit temporaries and instruction changes; reuse depends on the kernel mapping.</p>';
      L.save("occupancy");
    }
    controls.forEach(
      ([id, key]) =>
        ($(id).oninput = () => {
          s[key] = Number($(id).value);
          s.revealed = false;
          render();
        }),
    );
    $("occ-outputs").oninput = () => {
      s.outputs = [1, 2, 4, 8][+$("occ-outputs").value];
      s.revealed = false;
      render();
    };
    $("occ-preset").onchange = () => {
      s.preset = $("occ-preset").value;
      if (M.presets[s.preset]) s.arch = { ...M.presets[s.preset] };
      s.revealed = false;
      referenceFields();
      render();
    };
    $("occ-prediction").onchange = () => {
      s.prediction = $("occ-prediction").value;
      L.save("occupancy");
    };
    $("occ-run").onclick = () => {
      s.revealed = true;
      render();
    };
    referenceFields();
    render();
    return () => L.save("occupancy");
  },
};
