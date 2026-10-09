"use strict";
PerformanceLab.modules.tree = {
  mount(el) {
    const L = PerformanceLab,
      s = L.getState("tree", { path: [], notes: "" });
    try {
      Phase3Models.walkTree(s.path);
    } catch {
      s.path = [];
    }
    el.innerHTML =
      L.heading(
        "Follow the evidence. Choose the next experiment.",
        "A branching investigation guide, not an automatic bottleneck verdict. Unknown answers lead to a measurement plan.",
      ) +
      `<div class="decision-layout"><aside class="decision-trail"><h2>Your investigation</h2><div id="tree-trail"></div><div class="button-row"><button id="tree-back">Back one question</button><button id="tree-reset">Start again</button></div><label>Evidence / hypothesis notes<textarea id="tree-notes" rows="6" maxlength="5000" placeholder="What do you expect? Which metric supports it?"></textarea></label><p class="small">No universal thresholds. Validate a hypothesis by changing one variable and checking correctness and runtime.</p></aside><section class="visual-panel" id="tree-node" aria-live="polite"></section></div>` +
      L.sources();
    const $ = (id) => el.querySelector("#" + id);
    $("tree-notes").value = s.notes;
    function paint() {
      const { node, trail } = Phase3Models.walkTree(s.path);
      $("tree-trail").innerHTML = trail.length
        ? "<ol>" +
          trail
            .map(
              (t, i) =>
                `<li>${L.escape(t.question)}<button data-trail="${i}">${L.escape(t.answer)} · change</button></li>`,
            )
            .join("") +
          "</ol>"
        : '<p class="small">Start with the question on the right. Your choices will appear here.</p>';
      $("tree-back").disabled = !s.path.length;
      if (node.choices) {
        $("tree-node").innerHTML =
          `<div class="eyebrow">QUESTION ${trail.length + 1}</div><h2 class="decision-question">${L.escape(node.question)}</h2><p>${L.escape(node.context)}</p><div class="decision-choices">${node.choices.map(([value, label]) => `<button data-answer="${value}">${L.escape(label)} →</button>`).join("")}</div><p class="small">Choose “not measured” or “unsure” if evidence is missing. Guessing can send you down the wrong path.</p>`;
      } else
        $("tree-node").innerHTML =
          `<div class="eyebrow">INVESTIGATION PLAN · NOT A PROVEN DIAGNOSIS</div><h1>${L.escape(node.title)}</h1><div class="reason-chain">${trail.map((t) => `<span>${L.escape(t.answer)}</span>`).join("<b>→</b>")}</div><div class="explanation"><h3>Strong signal</h3><p>${L.escape(node.signal)}</p><h3>Investigate next</h3><p>${L.escape(node.next)}</p><h3>What could change this hypothesis?</h3><p>${L.escape(node.counter)}</p></div><div class="button-row"><a class="decision-link" href="#${node.module}">Explore the related lab →</a><button id="tree-save">Save investigation</button></div><p id="tree-save-status" class="phase3-status" role="status"></p>`;
      for (const button of el.querySelectorAll("[data-answer]"))
        button.onclick = () => {
          s.path.push(button.dataset.answer);
          paint();
        };
      for (const button of el.querySelectorAll("[data-trail]"))
        button.onclick = () => {
          s.path = s.path.slice(0, Number(button.dataset.trail));
          paint();
        };
      if ($("tree-save"))
        $("tree-save").onclick = () => {
          $("tree-save-status").textContent =
            ExperimentNotebook.capture("tree").message;
        };
      L.save("tree");
    }
    $("tree-back").onclick = () => {
      s.path.pop();
      paint();
    };
    $("tree-reset").onclick = () => {
      s.path = [];
      paint();
    };
    $("tree-notes").oninput = (e) => {
      s.notes = e.target.value;
      L.save("tree");
    };
    paint();
    return () => L.save("tree");
  },
};
