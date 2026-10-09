"use strict";
PerformanceLab.modules.scheduler = {
  mount(el) {
    const lab = PerformanceLab,
      M = Phase2Models,
      s = lab.getState("scheduler", {
        preset: "healthy",
        warps: 32,
        latency: 12,
        schedulers: 4,
        cycles: 0,
        prediction: "",
        revealed: false,
      });
    let engine, timer, last;
    el.innerHTML =
      lab.heading(
        "Warp scheduler & latency hiding",
        "Step through issue cycles. Watch a scheduler choose a ready warp while another waits for a dependency.",
      ) +
      `<div class="module-grid"><div class="controls-panel"><label>Workload preset<select id="sched-preset"><option value="healthy">Healthy latency hiding</option><option value="global">Long global memory latency</option><option value="registers">Few resident warps / register pressure</option><option value="barrier">Block barrier workload</option><option value="shared">Shared memory dependencies</option></select></label><label>Resident warps<input id="sched-warps" type="number" min="1" max="64" value="${s.warps}"></label><label>Global load latency (toy cycles)<input id="sched-latency" type="number" min="1" max="200" value="${s.latency}"></label><label>Scheduler partitions<select id="sched-count"><option>1</option><option>2</option><option>4</option></select></label><label>Predict: will ready warps run out?<select id="sched-predict"><option value="">Choose a prediction</option><option>Often</option><option>Occasionally</option><option>Rarely</option></select></label><div class="button-row"><button id="sched-step">Step</button><button id="sched-play">Play</button><button id="sched-reset">Reset</button></div><p class="small">One instruction may issue per scheduler per cycle. Warp i belongs to partition i % scheduler count. Blocks contain up to four warps. Barriers release only their own block.</p></div><div class="visual-panel"><div id="sched-metrics"></div><div class="scheduler-legend"><span>Ready</span><span>Issuing</span><span>Long scoreboard</span><span>Short scoreboard</span><span>Barrier</span><span>Completed</span></div><div id="sched-warps-view" class="scheduler-warps"></div><div class="comparison"><table><thead><tr><th>Cycle</th><th>Ready before issue</th><th>Issued</th><th>Active</th></tr></thead><tbody id="sched-history"></tbody></table></div><div class="explanation"><h3>Observe → explain</h3><p id="sched-explain"></p><p>More resident warps can hide latency by offering independent work. High occupancy alone cannot make dependent instructions ready. An eligible warp that is not selected is waiting its turn, not a scoreboard dependency.</p><p class="small">This deterministic toy model omits execution pipelines, memory contention, instruction throughput, dual issue, compiler scheduling, and measured hardware latency. “Register pressure” sets fewer warps; use Occupancy to calculate actual resource limits.</p></div></div></div>` +
      lab.sources();
    const $ = (id) => el.querySelector("#" + id);
    $("sched-preset").value = s.preset;
    $("sched-count").value = s.schedulers;
    $("sched-predict").value = s.prediction;
    function stop() {
      clearInterval(timer);
      timer = null;
      $("sched-play").textContent = "Play";
    }
    function paint() {
      const initial = {
        cycle: -1,
        states: engine.warps.map(() => "eligible"),
        eligible: s.warps,
        issued: 0,
        active: s.warps,
        emptyCycles: 0,
      };
      const r = last || initial;
      $("sched-metrics").innerHTML = lab.metrics([
        [s.cycles, "Cycles simulated"],
        [r.eligible, "Ready before latest issue"],
        [r.issued, "Instructions issued / latest cycle"],
        [r.emptyCycles, "Cycles with no eligible warp"],
      ]);
      $("sched-warps-view").innerHTML = r.states
        .map(
          (state, i) =>
            `<div class="warp-state ${state.replaceAll(" ", "-")}" title="Warp ${i}, scheduler ${i % s.schedulers}, block ${Math.floor(i / 4)}: ${state}"><strong>W${i}</strong><small>S${i % s.schedulers} · B${Math.floor(i / 4)}</small><span>${state}</span></div>`,
        )
        .join("");
      $("sched-history").innerHTML = engine.history
        .slice(-12)
        .reverse()
        .map(
          (r) =>
            `<tr><td>${r.cycle}</td><td>${r.eligible}</td><td>${r.issued}</td><td>${r.active}</td></tr>`,
        )
        .join("");
      $("sched-explain").textContent = !s.cycles
        ? "Make a prediction, then step or play. Metrics sample readiness before issue; colored issuing warps show the selection in that cycle."
        : r.complete
          ? "All warps completed. Reset or change the workload to compare."
          : `${r.eligible} warp(s) were ready; ${r.issued} issued. ${r.emptyCycles} of ${s.cycles} cycles had no eligible warp. ${s.prediction ? "Your prediction: " + s.prediction + ". " : ""}Compare the same latency with fewer resident warps.`;
      lab.save("scheduler");
    }
    function rebuild() {
      stop();
      engine = M.scheduler({
        ...M.presets[s.preset],
        warps: s.warps,
        latency: s.latency,
        schedulers: s.schedulers,
      });
      last = null;
      s.cycles = Math.min(2000, s.cycles);
      for (let i = 0; i < s.cycles; i++) last = engine.step();
      paint();
    }
    function step() {
      if (s.cycles >= 2000 || last?.complete) {
        stop();
        return;
      }
      last = engine.step();
      s.cycles++;
      paint();
      if (last.complete) stop();
    }
    $("sched-step").onclick = () => {
      stop();
      step();
    };
    $("sched-play").onclick = () => {
      if (timer) stop();
      else {
        step();
        if (!last?.complete) timer = setInterval(step, 220);
        $("sched-play").textContent = timer ? "Pause" : "Play";
      }
    };
    $("sched-reset").onclick = () => {
      s.cycles = 0;
      rebuild();
    };
    $("sched-predict").onchange = (e) => {
      s.prediction = e.target.value;
      lab.save("scheduler");
    };
    $("sched-preset").onchange = (e) => {
      s.preset = e.target.value;
      Object.assign(s, {
        warps: M.presets[s.preset].warps,
        latency: M.presets[s.preset].latency,
        cycles: 0,
      });
      $("sched-warps").value = s.warps;
      $("sched-latency").value = s.latency;
      rebuild();
    };
    for (const [id, key, max] of [
      ["sched-warps", "warps", 64],
      ["sched-latency", "latency", 200],
      ["sched-count", "schedulers", 4],
    ])
      $(id).onchange = (e) => {
        const n = Number(e.target.value);
        if (!Number.isInteger(n) || n < 1 || n > max) {
          e.target.value = s[key];
          return;
        }
        s[key] = n;
        s.cycles = 0;
        rebuild();
      };
    rebuild();
    return () => {
      stop();
      lab.save("scheduler");
    };
  },
};
