"use strict";
PerformanceLab.modules.diagnosis = {
  mount(container) {
    const L = PerformanceLab,
      M = PerformanceModels,
      D = DiagnosisData,
      $ = (id) => document.getElementById(id),
      s = L.getState("diagnosis", {
        difficulty: "beginner",
        index: 0,
        seed: Math.floor(Math.random() * 4294967296),
        answer: "",
        evidence: "",
        submitted: false,
        nextChoice: "",
        nextSubmitted: false,
        total: 0,
        correct: 0,
      });
    let current;
    container.innerHTML =
      L.heading(
        "Profiler diagnosis trainer",
        "Read a synthetic snapshot, choose the strongest bottleneck hypothesis, and decide what to investigate next.",
        "SYNTHETIC SNAPSHOT / NOT A REAL PROFILE",
      ) +
      `<div class="button-row"><label>Difficulty<select id="quiz-difficulty"><option value="beginner">Beginner · one clear signal</option><option value="intermediate">Intermediate · supporting context</option><option value="advanced">Advanced · competing signals</option></select></label><button id="quiz-new">New snapshot</button><span class="score" id="quiz-score"></span></div><div class="quiz-layout"><section class="visual-panel"><h2>Synthetic metric snapshot</h2><p class="small" id="quiz-context"></p><div id="quiz-metrics" class="quiz-metrics"></div><p class="result-note">Numbers are generated for this exercise. Similar names appear in Nsight Compute, but these values are not real hardware profiler metrics.</p><details><summary>How to read the metric names</summary><p class="small">Theoretical occupancy is a resource ceiling; achieved occupancy is an illustrative average. Eligible warps are ready to issue. Long Scoreboard means an L1TEX-related dependency; Short Scoreboard means an MIO dependency, which can involve shared memory or special functions. Not Selected warps were eligible but another warp issued. Stall reasons alone do not prove a bottleneck.</p></details></section><section class="quiz-panel"><h2>Predict / diagnose</h2><p>What is the strongest hypothesis in this snapshot?</p><div id="quiz-options" class="quiz-options"></div><label>Your evidence / reasoning<textarea id="quiz-evidence" rows="3" maxlength="1200" placeholder="Connect two or three signals. Optional, but useful for practice."></textarea></label><button class="primary" id="quiz-submit">Submit diagnosis</button><div id="quiz-status" role="status"></div></section></div><section id="quiz-feedback" class="feedback" hidden aria-live="polite"></section>` +
      L.sources();
    const names = {
      theoretical: "Theoretical occupancy",
      achieved: "Achieved occupancy",
      active: "Active warps / SM",
      eligible: "Eligible warps / scheduler",
      noEligible: "No eligible cycles",
      registers: "Registers / thread",
      shared: "Shared memory / block",
      dram: "DRAM bandwidth / peak",
      l1: "L1 hit rate",
      l2: "L2 hit rate",
      sectors: "Sectors / request",
      compute: "Compute utilization",
    };
    function metricValue(key, m) {
      if (
        [
          "theoretical",
          "achieved",
          "noEligible",
          "dram",
          "l1",
          "l2",
          "compute",
        ].includes(key)
      )
        return m[key] + "%";
      if (key === "shared") return m[key] + " KiB";
      return m[key];
    }
    function feedback() {
      const { scenario, metrics, stall, secondary } = current;
      const right = s.answer === scenario.id;
      $("quiz-feedback").hidden = !s.submitted;
      if (!s.submitted) return;
      const title = document.createElement("h3");
      title.textContent =
        (right
          ? "Your hypothesis fits the strongest signals."
          : "A stronger hypothesis: ") + (!right ? scenario.name : "");
      const chain = document.createElement("div");
      chain.className = "reason-chain";
      for (const key of scenario.signals) {
        const chip = document.createElement("span");
        chip.textContent = names[key] + ": " + metricValue(key, metrics);
        chain.append(chip);
      }
      const stallChip = document.createElement("span");
      stallChip.textContent = stall;
      chain.append(stallChip);
      const conclusion = document.createElement("p");
      conclusion.textContent = scenario.reason;
      const caveat = document.createElement("p");
      caveat.textContent = "Interpret carefully: " + scenario.counter;
      const extras = document.createElement("p");
      extras.textContent =
        s.difficulty === "advanced"
          ? scenario.competing
          : s.difficulty === "intermediate"
            ? "Consider supporting signals together. A stall reason or occupancy percentage on its own is not a diagnosis."
            : "";
      const next = document.createElement("label");
      next.textContent = "Optimization choice / next experiment";
      const select = document.createElement("select");
      select.id = "quiz-next-choice";
      const blank = document.createElement("option");
      blank.value = "";
      blank.textContent = "Choose an investigation";
      select.append(
        blank,
        ...D.options.map(([key, label]) => {
          const option = document.createElement("option");
          option.value = key;
          option.textContent = label;
          return option;
        }),
      );
      select.value = s.nextChoice;
      select.onchange = () => {
        s.nextChoice = select.value;
        s.nextSubmitted = false;
        L.save("diagnosis");
      };
      next.append(select);
      const button = document.createElement("button");
      button.id = "quiz-next-submit";
      button.textContent = "Explain this next step";
      button.className = "primary";
      button.onclick = () => {
        if (!s.nextChoice) return;
        s.nextSubmitted = true;
        L.save("diagnosis");
        showNext();
      };
      const answer = document.createElement("div");
      answer.id = "quiz-next-feedback";
      $("quiz-feedback").replaceChildren(
        title,
        chain,
        conclusion,
        extras,
        caveat,
        next,
        button,
        answer,
      );
      showNext();
    }
    function showNext() {
      if (!s.nextSubmitted || !s.nextChoice) return;
      const el = $("quiz-next-feedback");
      el.replaceChildren();
      const p = document.createElement("p");
      p.textContent =
        (s.nextChoice === current.scenario.next
          ? "A useful next experiment. "
          : "That can matter in other kernels. For this snapshot, prioritize the stronger signals: ") +
        current.scenario.investigate;
      const q = document.createElement("p");
      q.className = "small";
      q.textContent =
        "Predict the expected metric change, run a real controlled experiment, then measure and explain. This exercise cannot confirm the real kernel’s bottleneck.";
      el.append(p, q);
    }
    function render() {
      current = D.generate(s.index, s.difficulty, s.seed);
      const sc = current.scenario,
        resource = M.occupancy(
          {
            threads: sc.threads,
            registers: sc.registers,
            staticShared: sc.sharedKB * 1024,
            dynamicShared: 0,
            outputs: 1,
          },
          M.presets.ada,
        );
      current.metrics = {
        ...current.metrics,
        theoretical: +(resource.occupancy * 100).toFixed(1),
        registers: sc.registers,
        shared: sc.sharedKB,
      };
      current.metrics.achieved = Math.min(
        current.metrics.achieved,
        current.metrics.theoretical,
      );
      current.metrics.active = +((48 * current.metrics.achieved) / 100).toFixed(
        1,
      );
      current.metrics.eligible = Math.min(
        current.metrics.eligible,
        current.metrics.active / 4,
      );
      const m = current.metrics;
      $("quiz-difficulty").value = s.difficulty;
      $("quiz-score").textContent =
        `${s.correct} / ${s.total} first attempts matched`;
      $("quiz-context").textContent =
        `Illustrative Ada-style SM · 48 warp slots · ${sc.threads} threads/block · full-warp fp32 global-load baseline ≈ 4 sectors/request. Synthetic averages, not cycle traces.`;
      $("quiz-metrics").replaceChildren(
        ...Object.keys(names).map((key) => {
          const el = document.createElement("div");
          el.className = "metric";
          const strong = document.createElement("strong");
          strong.textContent = metricValue(key, m);
          const label = document.createElement("span");
          label.textContent = names[key];
          el.append(strong, label);
          return el;
        }),
      );
      const stall = document.createElement("div");
      stall.className = "metric";
      stall.style.gridColumn = "1 / -1";
      const strong = document.createElement("strong");
      strong.textContent = current.stall;
      strong.style.fontSize = "18px";
      const label = document.createElement("span");
      label.textContent =
        "Dominant warp state / stall signal" +
        (current.secondary ? ` · secondary: ${current.secondary}` : "");
      stall.append(strong, label);
      $("quiz-metrics").append(stall);
      $("quiz-options").replaceChildren(
        ...D.scenarios.map((scenario) => {
          const label = document.createElement("label");
          label.className = "quiz-option";
          const input = document.createElement("input");
          input.type = "radio";
          input.name = "diagnosis";
          input.value = scenario.id;
          input.checked = s.answer === scenario.id;
          input.disabled = s.submitted;
          input.onchange = () => {
            s.answer = input.value;
            L.save("diagnosis");
          };
          label.append(input, document.createTextNode(scenario.name));
          return label;
        }),
      );
      $("quiz-evidence").value = s.evidence;
      $("quiz-submit").disabled = s.submitted;
      $("quiz-status").textContent = "";
      feedback();
      L.save("diagnosis");
    }
    function next() {
      s.index = (s.index + 1) % D.scenarios.length;
      s.seed = (s.seed + 104729) >>> 0;
      s.answer = "";
      s.evidence = "";
      s.submitted = false;
      s.nextChoice = "";
      s.nextSubmitted = false;
      render();
    }
    $("quiz-new").onclick = next;
    $("quiz-difficulty").onchange = () => {
      s.difficulty = $("quiz-difficulty").value;
      s.seed = (s.seed + 8191) >>> 0;
      s.answer = "";
      s.submitted = false;
      s.nextChoice = "";
      s.nextSubmitted = false;
      render();
    };
    $("quiz-evidence").oninput = () => {
      s.evidence = $("quiz-evidence").value;
      L.save("diagnosis");
    };
    $("quiz-submit").onclick = () => {
      if (!s.answer) {
        $("quiz-status").textContent = "Choose a hypothesis first.";
        return;
      }
      if (s.submitted) return;
      s.submitted = true;
      s.total++;
      if (s.answer === current.scenario.id) s.correct++;
      render();
    };
    render();
    return () => L.save("diagnosis");
  },
};
