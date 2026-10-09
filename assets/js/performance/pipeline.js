"use strict";
PerformanceLab.modules.pipeline = {
  mount(el) {
    const L = PerformanceLab,
      s = L.getState("pipeline", {
        tiles: 5,
        load: 12,
        compute: 18,
        issue: 1,
        tileKB: 8,
        time: 0,
        speed: 120,
        mode: "overlap",
        prediction: "",
        revealed: false,
      });
    let timer, r;
    el.innerHTML =
      L.heading(
        "Load the next tile while computing this one.",
        "Compare a sequential schedule with a conceptual producer/consumer pipeline. Scrub time to inspect both shared buffers.",
      ) +
      `<div class="module-grid"><section class="controls-panel">${[
        ["tiles", "Tile count", 1, 16],
        ["load", "Load wait · toy ticks", 1, 100],
        ["compute", "Compute · toy ticks", 1, 100],
        ["issue", "Copy issue · toy ticks", 1, 10],
        ["tileKB", "Shared bytes per tile · KiB", 1, 48],
      ]
        .map(
          ([key, label, min, max]) =>
            `<label>${label}<input id="pipe-${key}" type="number" min="${min}" max="${max}" value="${s[key]}"></label>`,
        )
        .join(
          "",
        )}<label>Inspect buffers in<select id="pipe-mode"><option value="overlap">Double-buffered schedule</option><option value="sequential">Sequential schedule</option></select></label><label>Playback tick (milliseconds)<input id="pipe-speed" type="range" min="40" max="400" step="10" value="${s.speed}"></label><label>Predict overlap benefit<select id="pipe-predict"><option value="">Choose a prediction</option><option>Large benefit</option><option>Small benefit</option><option>No overlap benefit</option></select></label><button id="pipe-run">Compare / reveal</button><p class="small">One independent copy engine, one compute engine, and two reusable buffers are assumed. Copy issue + wait are serialized on the copy engine. A buffer is reused only after its compute finishes.</p><p id="pipe-error" class="phase3-status" role="status"></p></section><section class="visual-panel"><div id="pipe-metrics"></div><div class="pipeline-chart-scroll"><svg id="pipe-chart" class="pipeline-chart" viewBox="0 0 920 430" role="img" aria-label="Sequential and double-buffered load and compute timelines"></svg></div><p class="small timeline-scroll-hint">Swipe the timeline sideways to inspect both schedules.</p><div class="scheduler-legend"><span>Amber: issue</span><span>Blue: load wait</span><span>Mint: compute</span><span>Vertical line: inspection time</span></div><div class="button-row"><button id="pipe-back">Back</button><button id="pipe-step">Step</button><button id="pipe-play">Play</button><button id="pipe-reset">Reset</button></div><label id="pipe-time-label">Inspection time<input id="pipe-time" type="range" min="0" value="${s.time}"></label><div id="pipe-buffers" class="buffer-pair"></div><div class="explanation"><h3>Observe → explain</h3><p id="pipe-explain"></p><p class="small">Ticks are arbitrary, not GPU cycles or a speed prediction. The model omits bandwidth contention, synchronization overhead, occupancy changes and instruction scheduling. A double-buffered implementation needs twice the shared storage; that can reduce resident blocks. Compare this cost in Occupancy.</p><a href="#occupancy">Inspect shared-memory residency limits →</a></div><details class="reference-panel"><summary>Modern hardware: asynchronous copies and multi-stage pipelines</summary><p>CUDA asynchronous-copy APIs let a producer initiate global-to-shared transfers and wait for completion before a consumer reads the buffer. Multi-stage pipelines extend this with several in-flight stages. More stages need more storage and careful buffer ownership.</p><p>Hardware acceleration depends on the GPU, API, datatype and alignment. Ordinary synchronous loads do not automatically overlap just because there are two arrays. This timeline assumes an independent transfer path and correct completion/reuse synchronization.</p><a href="https://docs.nvidia.com/cuda/cuda-programming-guide/04-special-topics/async-copies.html" target="_blank" rel="noreferrer">NVIDIA asynchronous data copies guide</a></details></section></div>`;
    const $ = (id) => el.querySelector("#" + id);
    $("pipe-mode").value = s.mode;
    $("pipe-predict").value = s.prediction;
    function stop() {
      clearInterval(timer);
      timer = null;
      $("pipe-play").textContent = "Play";
    }
    function paint() {
      r = Phase3Models.pipeline(s);
      const total = r.sequential.total,
        plan = r[s.mode];
      s.time = Math.min(s.time, plan.total);
      $("pipe-time").max = plan.total;
      $("pipe-time").value = s.time;
      $("pipe-time-label").firstChild.textContent =
        `Inspection time · ${s.time} / ${plan.total} toy ticks `;
      $("pipe-metrics").innerHTML = s.revealed
        ? L.metrics([
            [r.sequential.total, "Sequential toy ticks"],
            [r.overlap.total, "Double-buffered toy ticks"],
            [r.saved, "Ticks overlapped / avoided"],
            [r.overlap.sharedKB + " KiB", "Double-buffer shared storage"],
          ])
        : '<p class="small">Predict, then Compare to reveal schedule lengths. The diagrams remain inspectable.</p>';
      const X = (t) => 140 + (t / total) * 750;
      let svg =
        '<rect x="140" y="35" width="750" height="340" fill="#0a1015"/>';
      for (let i = 0; i <= 5; i++) {
        const t = (total * i) / 5;
        svg += `<path d="M${X(t)} 35V375" stroke="#25313a"/><text x="${X(t)}" y="398" text-anchor="middle">${Math.round(t)}</text>`;
      }
      for (const [key, base, label] of [
        ["sequential", 70, "SEQUENTIAL"],
        ["overlap", 250, "TWO BUFFERS"],
      ]) {
        svg += `<text x="10" y="${base - 15}">${label}</text><text x="10" y="${base + 17}">Load</text><text x="10" y="${base + 65}">Compute</text>`;
        for (const t of r[key].rows) {
          for (const [a, b, y, color] of [
            [t.start, t.issueEnd, base, "#edc47d"],
            [t.issueEnd, t.loadEnd, base, "#8bbcff"],
            [t.computeStart, t.end, base + 48, "#72e4cf"],
          ])
            svg += `<rect x="${X(a)}" y="${y}" width="${Math.max(0.5, X(b) - X(a))}" height="30" fill="${color}" opacity=".8"><title>Tile ${t.tile}, buffer ${t.buffer === 0 ? "A" : "B"}: ${a}–${b} ticks</title></rect>`;
          if (X(t.end) - X(t.computeStart) > 24)
            svg += `<text x="${X(t.computeStart) + 3}" y="${base + 69}" style="fill:#06150f">T${t.tile}</text>`;
        }
        svg += `<path d="M${X(s.time)} ${base - 10}V${base + 90}" stroke="#fff" stroke-dasharray="3 4"/>`;
      }
      svg +=
        '<text x="520" y="424" text-anchor="middle">Toy time · both schedules share the same scale</text>';
      $("pipe-chart").innerHTML = svg;
      const buffers = r.buffersAt(s.time, plan);
      $("pipe-buffers").innerHTML = buffers
        .map(
          (b) =>
            `<div class="buffer-card ${b.state.replaceAll(" ", "-")}"><small>SHARED BUFFER ${b.buffer === 0 ? "A" : "B"} · ${s.tileKB} KiB</small><strong>${b.state}${b.tile === null ? "" : " · tile " + b.tile}</strong><div class="buffer-slots">${"<span></span>".repeat(12)}</div></div>`,
        )
        .join("");
      $("pipe-explain").textContent =
        `${s.mode === "overlap" ? "Two buffers allow a load and a compute to run concurrently, without overwriting a tile being consumed." : "A single buffer forces the next load to wait until the previous compute completes."} ${s.revealed ? `Under these assumptions, ${r.saved} toy ticks are avoided; storage grows from ${r.sequential.sharedKB} to ${r.overlap.sharedKB} KiB. ` : ""}${s.prediction ? "Your prediction: " + s.prediction + ". " : ""}${s.tiles === 1 ? "With only one tile, there is no later tile to overlap." : "Startup and the final compute remain exposed; unequal load and compute durations limit overlap."}`;
      $("pipe-step").disabled = s.time >= plan.total;
      $("pipe-back").disabled = s.time === 0;
      L.save("pipeline");
    }
    function step() {
      if (s.time >= r[s.mode].total) {
        stop();
        return;
      }
      s.time++;
      paint();
      if (s.time >= r[s.mode].total) stop();
    }
    $("pipe-step").onclick = () => {
      stop();
      step();
    };
    $("pipe-back").onclick = () => {
      stop();
      s.time--;
      paint();
    };
    $("pipe-reset").onclick = () => {
      stop();
      s.time = 0;
      paint();
    };
    $("pipe-play").onclick = () => {
      if (timer) stop();
      else {
        if (s.time === r[s.mode].total) s.time = 0;
        timer = setInterval(step, s.speed);
        $("pipe-play").textContent = "Pause";
      }
    };
    $("pipe-time").oninput = (e) => {
      stop();
      s.time = Number(e.target.value);
      paint();
    };
    $("pipe-run").onclick = () => {
      s.revealed = true;
      paint();
    };
    $("pipe-mode").onchange = (e) => {
      stop();
      s.mode = e.target.value;
      paint();
    };
    $("pipe-speed").oninput = (e) => {
      s.speed = Number(e.target.value);
      if (timer) {
        stop();
        timer = setInterval(step, s.speed);
        $("pipe-play").textContent = "Pause";
      }
      L.save("pipeline");
    };
    $("pipe-predict").onchange = (e) => {
      s.prediction = e.target.value;
      L.save("pipeline");
    };
    for (const key of ["tiles", "load", "compute", "issue", "tileKB"])
      $("pipe-" + key).onchange = (e) => {
        const previous = s[key];
        s[key] = Number(e.target.value);
        try {
          Phase3Models.pipeline(s);
          $("pipe-error").textContent = "";
        } catch (err) {
          s[key] = previous;
          e.target.value = previous;
          $("pipe-error").textContent = err.message;
          return;
        }
        stop();
        s.time = 0;
        s.revealed = false;
        paint();
      };
    paint();
    return () => {
      stop();
      L.save("pipeline");
    };
  },
};
