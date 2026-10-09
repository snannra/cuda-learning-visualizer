"use strict";
PerformanceLab.modules.mapping = {
  mount(el) {
    const lab = PerformanceLab,
      s = lab.getState("mapping", {
        bx: 16,
        by: 16,
        tw: 16,
        th: 16,
        mw: 64,
        mh: 64,
        ix: 0,
        iy: 0,
        mode: "direct",
        warp: 0,
        selected: 0,
        prediction: "",
        revealed: false,
      });
    let timer,
      model,
      hit = [];
    el.innerHTML =
      lab.heading(
        "Thread / block / tile mapping",
        "Follow a physical CUDA thread through a logical tile to its global FP32 output address. Blocks and tiles are separate shapes.",
      ) +
      `<div class="module-grid"><div class="controls-panel">${[
        ["bx", "Block width", 1, 1024],
        ["by", "Block height", 1, 1024],
        ["tw", "Tile width", 1, 64],
        ["th", "Tile height", 1, 64],
        ["mw", "Matrix width", 1, 4096],
        ["mh", "Matrix height", 1, 4096],
        ["ix", "Block index X", 0, 4095],
        ["iy", "Block index Y", 0, 4095],
      ]
        .map(
          ([key, label, min, max]) =>
            `<label>${label}<input id="map-${key}" type="number" min="${min}" max="${max}" value="${s[key]}"></label>`,
        )
        .join(
          "",
        )}<label>Mapping<select id="map-mode"><option value="direct">Direct (tx, ty)</option><option value="linear">Flattened tid → tile</option><option value="transpose">Transposed (ty, tx)</option></select></label><label>Warp<select id="map-warp"></select></label><label>Predict output locality<select id="map-predict"><option value="">Choose a prediction</option><option>Mostly contiguous</option><option>Mostly strided</option></select></label><div class="button-row"><button id="map-run">Run / reveal</button><button id="map-play">Play warps</button></div><p id="map-error" role="status" class="small"></p><p class="small">Maximum 1,024 threads per block; tiles up to 64 × 64; matrices up to 4,096 × 4,096. Click a thread or mapped tile cell to inspect it.</p></div><div class="visual-panel"><div class="mapping-panels"><section><h3>Physical block</h3><canvas id="map-block" width="480" height="420" aria-label="Physical thread block"></canvas></section><section><h3>Logical tile</h3><canvas id="map-tile" width="480" height="420" aria-label="Logical tile coverage"></canvas></section><section><h3>Global matrix</h3><canvas id="map-matrix" width="480" height="420" aria-label="Matrix and selected tile"></canvas></section></div><div class="mapping-legend"><span>Mint: selected warp</span><span>Amber: selected thread</span><span>Blue: other threads</span><span>Rose: masked warp lanes</span><span>Dark: uncovered</span></div><label class="thread-selector">Inspect physical thread ID<input id="map-thread" type="number" min="0" max="1023" value="${s.selected}"></label><div id="map-inspector" class="explanation"></div><div id="map-metrics"></div><div class="explanation"><h3>Observe → explain</h3><p id="map-explain"></p><pre>tid = threadIdx.y * blockDim.x + threadIdx.x
warp = floor(tid / 32); lane = tid % 32
address = (globalRow * matrixWidth + globalCol) * 4</pre><p class="small">CUDA linear thread IDs run along X first. Warps contain consecutive IDs. This model measures row-major FP32 C stores only; A and B loads in matmul have their own address patterns. All out-of-tile and out-of-matrix threads are explicitly masked. Transposing a square tile can preserve coverage while changing locality; it is not automatically an incorrect algorithm.</p><a href="https://docs.nvidia.com/cuda/cuda-c-programming-guide/index.html" target="_blank" rel="noreferrer">CUDA programming guide: thread hierarchy</a></div></div></div>`;
    const $ = (id) => el.querySelector("#" + id);
    $("map-mode").value = s.mode;
    $("map-predict").value = s.prediction;
    function stop() {
      clearInterval(timer);
      timer = null;
      $("map-play").textContent = "Play warps";
    }
    function canvas(id, width, height, type) {
      const cv = $(id),
        ctx = cv.getContext("2d"),
        W = cv.width,
        H = cv.height,
        pad = 26,
        scale = Math.min((W - pad * 2) / width, (H - pad * 2) / height),
        ox = pad,
        oy = pad;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#0b1218";
      ctx.fillRect(ox, oy, width * scale, height * scale);
      ctx.strokeStyle = "#27323a";
      ctx.lineWidth = 0.5;
      const stride = Math.max(1, Math.ceil(3 / scale));
      for (let x = 0; x <= width; x += stride) {
        ctx.beginPath();
        ctx.moveTo(ox + x * scale, oy);
        ctx.lineTo(ox + x * scale, oy + height * scale);
        ctx.stroke();
      }
      for (let y = 0; y <= height; y += stride) {
        ctx.beginPath();
        ctx.moveTo(ox, oy + y * scale);
        ctx.lineTo(ox + width * scale, oy + y * scale);
        ctx.stroke();
      }
      if (type === "matrix") {
        ctx.strokeStyle = "#8bbcff";
        ctx.lineWidth = 2;
        ctx.strokeRect(
          ox + s.ix * s.tw * scale,
          oy + s.iy * s.th * scale,
          s.tw * scale,
          s.th * scale,
        );
      }
      for (const t of model.threads) {
        const x = type === "block" ? t.tx : type === "tile" ? t.x : t.col,
          y = type === "block" ? t.ty : type === "tile" ? t.y : t.row;
        if (x >= width || y >= height) continue;
        if (type !== "block" && !t.tileValid) continue;
        ctx.fillStyle =
          t.tid === s.selected
            ? "#edc47d"
            : t.warp === s.warp
              ? t.valid
                ? "#72e4cf"
                : "#a46769"
              : "#344656";
        ctx.fillRect(
          ox + x * scale + Math.min(0.7, scale * 0.05),
          oy + y * scale + Math.min(0.7, scale * 0.05),
          Math.max(0.5, scale - 1.4),
          Math.max(0.5, scale - 1.4),
        );
      }
      ctx.strokeStyle = "#8bbcff";
      ctx.lineWidth = 1;
      ctx.strokeRect(ox, oy, width * scale, height * scale);
      ctx.fillStyle = "#a0afbd";
      ctx.font = "12px monospace";
      ctx.fillText(`${width} × ${height}`, pad, H - 8);
      hit.push({ cv, scale, ox, oy, type });
    }
    function paint() {
      s.warp = Math.min(s.warp, Math.ceil((s.bx * s.by) / 32) - 1);
      s.selected = Math.min(s.selected, s.bx * s.by - 1);
      model = Phase2Models.mapping(s);
      const count = Math.ceil((s.bx * s.by) / 32);
      $("map-warp").innerHTML = Array.from(
        { length: count },
        (_, i) =>
          `<option value="${i}">Warp ${i} · tid ${i * 32}–${Math.min(s.bx * s.by - 1, i * 32 + 31)}</option>`,
      ).join("");
      $("map-warp").value = s.warp;
      $("map-thread").max = s.bx * s.by - 1;
      $("map-thread").value = s.selected;
      hit = [];
      canvas("map-block", s.bx, s.by, "block");
      canvas("map-tile", s.tw, s.th, "tile");
      canvas("map-matrix", s.mw, s.mh, "matrix");
      const t = model.threads[s.selected];
      $("map-inspector").innerHTML =
        `<strong>Thread ${t.tid} · warp ${t.warp} · lane ${t.lane}</strong><p>Physical (x, y): (${t.tx}, ${t.ty}) → tile (column, row): (${t.x}, ${t.y}) → matrix (column, row): (${t.col}, ${t.row}).</p><p>${t.valid ? `Output byte address: ${t.address.toLocaleString()} · 32-byte sector ${Math.floor(t.address / 32).toLocaleString()}.` : `Masked: ${!t.tileValid ? "outside logical tile" : "outside global matrix"}. No store is issued.`}</p>`;
      $("map-metrics").innerHTML = s.revealed
        ? lab.metrics([
            [model.active, "Active store lanes / selected warp"],
            [model.sectors.length, "32-byte sectors / selected warp"],
            [
              (model.efficiency * 100).toFixed(1) + "%",
              "Useful / sector bytes",
            ],
            [model.holes, "Uncovered logical tile cells"],
          ])
        : '<p class="small">Predict locality, then Run to reveal address metrics.</p>';
      $("map-explain").textContent =
        `${s.bx * s.by} physical threads map to ${model.coverage.size} of ${s.tw * s.th} tile cells. ${model.outsideTile} threads fall outside the tile; ${model.outsideMatrix} additional threads fall outside the matrix. ${s.revealed ? `Warp ${s.warp} writes ${model.active * 4} useful bytes across ${model.sectors.length * 32} sector bytes. ` : ""}${s.prediction ? "Prediction: " + s.prediction + ". " : ""}${s.mode === "transpose" ? "Transposed mapping can scatter a warp across matrix rows. Compare it with direct and flattened mapping." : "With narrow blocks, one warp spans several rows; matrix row pitch and alignment still affect sector count."}`;
      lab.save("mapping");
    }
    for (const [key, min, max] of [
      ["bx", 1, 1024],
      ["by", 1, 1024],
      ["tw", 1, 64],
      ["th", 1, 64],
      ["mw", 1, 4096],
      ["mh", 1, 4096],
      ["ix", 0, 4095],
      ["iy", 0, 4095],
    ])
      $("map-" + key).onchange = (e) => {
        const n = Number(e.target.value);
        if (
          !Number.isInteger(n) ||
          n < min ||
          n > max ||
          (key === "bx" && n * s.by > 1024) ||
          (key === "by" && n * s.bx > 1024)
        ) {
          $("map-error").textContent =
            "Use the displayed bounds and at most 1,024 threads per block.";
          e.target.value = s[key];
          return;
        }
        stop();
        $("map-error").textContent = "";
        s[key] = n;
        s.revealed = false;
        paint();
      };
    $("map-mode").onchange = (e) => {
      s.mode = e.target.value;
      s.revealed = false;
      paint();
    };
    $("map-warp").onchange = (e) => {
      s.warp = Number(e.target.value);
      s.selected = s.warp * 32;
      paint();
    };
    $("map-thread").onchange = (e) => {
      const n = Number(e.target.value);
      if (Number.isInteger(n) && n >= 0 && n < s.bx * s.by) {
        s.selected = n;
        s.warp = Math.floor(n / 32);
      }
      paint();
    };
    $("map-predict").onchange = (e) => {
      s.prediction = e.target.value;
      lab.save("mapping");
    };
    $("map-run").onclick = () => {
      s.revealed = true;
      paint();
    };
    $("map-play").onclick = () => {
      if (timer) stop();
      else {
        timer = setInterval(() => {
          s.warp = (s.warp + 1) % Math.ceil((s.bx * s.by) / 32);
          s.selected = s.warp * 32;
          s.revealed = true;
          paint();
        }, 600);
        $("map-play").textContent = "Pause";
      }
    };
    for (const cv of el.querySelectorAll("canvas"))
      cv.onclick = (e) => {
        const h = hit.find((h) => h.cv === cv),
          r = cv.getBoundingClientRect(),
          x = Math.floor(
            (((e.clientX - r.left) * cv.width) / r.width - h.ox) / h.scale,
          ),
          y = Math.floor(
            (((e.clientY - r.top) * cv.height) / r.height - h.oy) / h.scale,
          );
        const t = model.threads.find((t) =>
          h.type === "block"
            ? t.tx === x && t.ty === y
            : h.type === "tile"
              ? t.tileValid && t.x === x && t.y === y
              : t.valid && t.col === x && t.row === y,
        );
        if (t) {
          s.selected = t.tid;
          s.warp = t.warp;
          paint();
        }
      };
    paint();
    return () => {
      stop();
      lab.save("mapping");
    };
  },
};
