"use strict";
PerformanceLab.modules.blocking = {
  mount(el) {
    const L = PerformanceLab,
      s = L.getState("blocking", {
        n: 8,
        bx: 8,
        by: 8,
        tileK: 4,
        registers: 62,
        arch: "generic",
        outputs: 1,
        tx: 0,
        ty: 0,
        step: 0,
        speed: 600,
        prediction: "",
        revealed: false,
      });
    let timer, r;
    const embed = el.classList.contains("blocking-embed");
    el.innerHTML =
      L.heading(
        "Reuse one value. Update several outputs.",
        "Follow one thread’s A operand into 1, 2, or 4 accumulator registers, then compare reuse with estimated residency.",
      ) +
      `<div class="module-grid register-lab"><section class="controls-panel"><label>Outputs / thread<select id="reg-outputs"><option>1</option><option>2</option><option>4</option></select></label><label>Matrix N<select id="reg-n"><option>4</option><option>8</option><option>16</option></select></label>${[
        ["bx", "Block X", 1, 32],
        ["by", "Block Y", 1, 32],
        ["tileK", "Shared tile K depth", 1, 16],
        ["registers", "Baseline registers / thread", 0, 240],
        ["tx", "Inspect thread X", 0, 31],
        ["ty", "Inspect thread Y", 0, 31],
      ]
        .map(
          ([key, label, min, max]) =>
            `<label>${label}<input id="reg-${key}" type="number" min="${min}" max="${max}" value="${s[key]}"></label>`,
        )
        .join(
          "",
        )}<label>Reference architecture<select id="reg-arch"><option value="generic">Generic educational GPU</option><option value="ada">Ada-style reference</option></select></label><label>Playback speed<select id="reg-speed"><option value="1000">Slow</option><option value="600">Normal</option><option value="200">Fast</option></select></label><label>Predict the tradeoff<select id="reg-predict"><option value="">Choose a prediction</option><option>Reuse improves; residency stays similar</option><option>Reuse improves; residency falls</option><option>Launch exceeds resource limits</option></select></label><button id="reg-compare">Compare configurations</button><p id="reg-error" class="small" role="status"></p></section><section class="visual-panel"><div class="register-stage"><div id="reg-source" class="operand-source"></div><span class="reuse-arrow">→ REUSE →</span><div id="reg-accumulators" class="accumulator-grid"></div></div><p id="reg-phase" aria-live="polite"></p><div class="button-row"><button id="reg-back">Back</button><button id="reg-step">Step</button><button id="reg-play">Play</button><button id="reg-reset">Reset</button><button id="reg-save">Save experiment</button><a href="performance.html#notebook">Open notebook →</a></div><label>Execution step<input id="reg-timeline" type="range" min="0" value="${s.step}"></label><div class="register-matrices"><section><h3>A · selected row</h3><div id="reg-a" class="register-matrix"></div></section><section><h3>B · selected output columns</h3><div id="reg-b" class="register-matrix"></div></section><section><h3>C · one thread’s output strip</h3><div id="reg-c" class="register-matrix"></div></section></div><div id="reg-metrics"></div><div class="comparison" id="reg-comparison"></div><div class="explanation"><h3>Observe → explain</h3><p id="reg-explain"></p><pre>col0 = threadIdx.x * OUTPUTS;
float acc[OUTPUTS] = {0};
// Shared tiles are cooperatively loaded and synchronized.
for (int k = 0; k &lt; TILE_K; ++k) {
    float a = As[threadIdx.y][k];
    for (int o = 0; o &lt; OUTPUTS; ++o)
        acc[o] += a * Bs[k][col0 + o];
}
// Every block thread reaches barriers, even masked outputs.
// Guard final stores at matrix boundaries.</pre><p class="small">Register estimate = baseline + outputs − 1. Shared FP32 tile bytes = 4 × K × (blockY + blockX × outputs). Allocation granularity, compiler temporaries, spills and timing are omitted. Counts below assume fully valid outputs; masks in the animation show boundary behavior. Shared-read arithmetic intensity is not global-memory Roofline intensity.</p></div>${embed ? '<a href="performance.html#blocking">Open full Register Blocking Lab</a>' : L.sources()}</section></div>`;
    const $ = (id) => el.querySelector("#" + id);
    for (const key of ["outputs", "n", "arch", "speed"])
      $("reg-" + key).value = s[key];
    $("reg-predict").value = s.prediction;
    function stop() {
      clearInterval(timer);
      timer = null;
      $("reg-play").textContent = "Play";
    }
    function matrix(id, value, selected) {
      const node = $(id);
      node.style.setProperty("--matrix-n", s.n);
      node.innerHTML = Array.from({ length: s.n * s.n }, (_, i) => {
        const row = Math.floor(i / s.n),
          col = i % s.n;
        return `<span class="${selected(row, col)}" title="(${row}, ${col})">${value(row, col)}</span>`;
      }).join("");
    }
    function paint() {
      r = Phase3Models.blocking(s);
      s.step = r.step;
      $("reg-timeline").max = r.events.length - 1;
      $("reg-timeline").value = s.step;
      $("reg-tx").max = s.bx - 1;
      $("reg-ty").max = s.by - 1;
      const e = r.event,
        loadedA = s.step > 0,
        k = e.k,
        showB = ["load B", "accumulate", "store outputs"].includes(e.phase),
        sumPhase = e.phase === "accumulate";
      $("reg-source").innerHTML =
        `<small>ONE SHARED A LOAD</small><strong>${loadedA && r.row < s.n ? r.A(r.row, k) : "—"}</strong><span>A[${r.row}, ${k}]</span>`;
      $("reg-accumulators").innerHTML = r.acc
        .map(
          (v, i) =>
            `<div class="accumulator ${sumPhase && r.valid[i] ? "updating" : ""}"><small>acc${i} · C[${r.row}, ${r.cols[i]}]</small><strong>${v}</strong><span>${!r.valid[i] ? "Masked output" : showB ? `${r.A(r.row, k)} × ${r.B(k, r.cols[i])}${sumPhase ? " added" : ""}` : "Awaiting operands"}</span></div>`,
        )
        .join("");
      $("reg-phase").textContent =
        `Step ${s.step}/${r.events.length - 1} · ${e.phase} · k=${k} · logical output tile ${s.by} rows × ${s.bx * s.outputs} columns`;
      $("reg-back").disabled = s.step === 0;
      $("reg-step").disabled = s.step === r.events.length - 1;
      matrix(
        "reg-a",
        (row, col) => r.A(row, col),
        (row, col) =>
          row === r.row
            ? col === k && loadedA
              ? "operand-active"
              : "row-active"
            : "",
      );
      matrix(
        "reg-b",
        (row, col) => r.B(row, col),
        (row, col) =>
          r.cols.includes(col)
            ? row === k && showB
              ? "operand-active"
              : "column-active"
            : "",
      );
      matrix(
        "reg-c",
        (row, col) =>
          row === r.row && r.cols.includes(col)
            ? r.acc[r.cols.indexOf(col)]
            : "·",
        (row, col) =>
          row === r.row && r.cols.includes(col) ? "output-active" : "",
      );
      $("reg-metrics").innerHTML = r.valid.every(Boolean)
        ? L.metrics([
            [r.aLoads, "Shared A reads / thread"],
            [r.bLoads, "Shared B reads / thread"],
            [r.flops, "FLOPs / thread"],
            [r.intensity.toFixed(3), "FLOPs / shared-read byte"],
          ])
        : '<p class="small">This thread has masked outputs. Full-output workload counts are omitted; compare table configurations for the ideal interior case.</p>';
      $("reg-comparison").innerHTML = s.revealed
        ? "<table><thead><tr><th>Outputs</th><th>A reads / output</th><th>Accumulators</th><th>Estimated registers</th><th>Shared KiB / block</th><th>Resident warps</th><th>Occupancy</th><th>Limiter</th></tr></thead><tbody>" +
          [1, 2, 4]
            .map((outputs) => {
              const q = Phase3Models.blocking({ ...s, outputs });
              return `<tr class="${outputs === s.outputs ? "selected-comparison" : ""}"><td>${outputs}</td><td>${(s.n / outputs).toFixed(2)}</td><td>${outputs}</td><td>${q.occupancy.estimatedRegisters}</td><td>${(q.shared / 1024).toFixed(2)}</td><td>${q.occupancy.residentWarps}</td><td>${(q.occupancy.occupancy * 100).toFixed(1)}%</td><td>${L.escape(q.occupancy.limiting.join(" + "))}</td></tr>`;
            })
            .join("") +
          '</tbody></table><p class="small">Same physical block, different logical output tile size. This compares resource/reuse tradeoffs, not equal-work runtimes. No winner is selected.</p>'
        : '<p class="small">Predict the resource tradeoff, then Compare configurations.</p>';
      $("reg-explain").textContent =
        `One A operand can update ${s.outputs} accumulator(s), reducing A reads per output. B operands and accumulator storage grow with output count; the shared B tile also widens. ${s.revealed ? `Selected estimate: ${r.occupancy.residentWarps} resident warps, ${(r.occupancy.occupancy * 100).toFixed(1)}% occupancy; binding resource: ${r.occupancy.limiting.join(" + ")}. ` : ""}${s.prediction ? "Your prediction: " + s.prediction + ". " : ""}Verify compiler resources and equal-work timings before choosing a configuration.`;
      L.save("blocking");
    }
    function step() {
      if (s.step >= r.events.length - 1) {
        stop();
        return;
      }
      s.step++;
      paint();
      if (s.step === r.events.length - 1) stop();
    }
    $("reg-step").onclick = () => {
      stop();
      step();
    };
    $("reg-back").onclick = () => {
      stop();
      s.step--;
      paint();
    };
    $("reg-reset").onclick = () => {
      stop();
      s.step = 0;
      paint();
    };
    $("reg-play").onclick = () => {
      if (timer) stop();
      else {
        if (s.step === r.events.length - 1) s.step = 0;
        timer = setInterval(step, s.speed);
        $("reg-play").textContent = "Pause";
      }
    };
    $("reg-timeline").oninput = (e) => {
      stop();
      s.step = Number(e.target.value);
      paint();
    };
    for (const key of [
      "n",
      "bx",
      "by",
      "tileK",
      "registers",
      "tx",
      "ty",
      "outputs",
      "arch",
    ])
      $("reg-" + key).onchange = (e) => {
        const next = {
          ...s,
          [key]: key === "arch" ? e.target.value : Number(e.target.value),
        };
        if (key === "bx") next.tx = Math.min(next.tx, next.bx - 1);
        if (key === "by") next.ty = Math.min(next.ty, next.by - 1);
        try {
          Phase3Models.blocking(next);
          $("reg-error").textContent = "";
        } catch (err) {
          e.target.value = s[key];
          $("reg-error").textContent = err.message;
          return;
        }
        stop();
        Object.assign(s, next, { step: 0, revealed: false });
        $("reg-tx").value = s.tx;
        $("reg-ty").value = s.ty;
        paint();
      };
    $("reg-speed").onchange = (e) => {
      s.speed = Number(e.target.value);
      if (timer) {
        stop();
        timer = setInterval(step, s.speed);
        $("reg-play").textContent = "Pause";
      }
      L.save("blocking");
    };
    $("reg-predict").onchange = (e) => {
      s.prediction = e.target.value;
      L.save("blocking");
    };
    $("reg-compare").onclick = () => {
      s.revealed = true;
      paint();
    };
    $("reg-save").onclick = () => {
      stop();
      if (window.ExperimentNotebook) {
        const result = ExperimentNotebook.capture("blocking");
        $("reg-error").textContent = result.message;
      } else
        $("reg-error").textContent =
          "Open Performance Lab to save an experiment.";
    };
    paint();
    return () => {
      stop();
      L.save("blocking");
    };
  },
};
