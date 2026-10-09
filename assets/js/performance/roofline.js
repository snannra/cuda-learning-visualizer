"use strict";
PerformanceLab.modules.roofline = {
  mount(el) {
    const lab = PerformanceLab,
      s = lab.getState("roofline", {
        flops: 33554432,
        bytes: 8650752,
        peak: 20,
        bandwidth: 600,
        attainment: 0.65,
        prediction: "",
      });
    const fmt = (n) =>
      n.toLocaleString(undefined, { maximumSignificantDigits: 4 });
    el.innerHTML =
      lab.heading(
        "Roofline explorer",
        "Compare a workload’s arithmetic intensity with illustrative compute and memory bandwidth ceilings.",
      ) +
      `<div class="module-grid"><div class="controls-panel"><label>Workload example<select id="roof-example"><option value="">Custom / current values</option><option value="vector">FP32 vector add · N=65,536</option><option value="naive">Naive FP32 matmul · N=256</option><option value="tiled">Tiled FP32 matmul · N=256, T=16</option></select></label><label>Total floating point operations<input id="roof-flops" type="number" min="1" step="any" max="1000000000000000" value="${s.flops}"></label><label>Global memory bytes<input id="roof-bytes" type="number" min="1" step="any" max="1000000000000000" value="${s.bytes}"></label><label>Peak compute (TFLOP/s)<input id="roof-peak" type="number" min="0.01" max="10000" step="any" value="${s.peak}"></label><label>Memory bandwidth (GB/s)<input id="roof-bandwidth" type="number" min="0.01" max="100000" step="any" value="${s.bandwidth}"></label><label>Illustrative ceiling attainment <output id="roof-percent"></output><input id="roof-attainment" type="range" min="5" max="100" value="${s.attainment * 100}"></label><label>Predict the ceiling<select id="roof-predict"><option value="">Choose a prediction</option><option>Bandwidth ceiling</option><option>Compute ceiling</option></select></label><div class="button-row"><button id="roof-reuse">Halve memory traffic</button><button id="roof-compute">Double FLOPs</button></div><p class="small">Drag the point horizontally to change bytes and vertically to change assumed attainment. Focus it and use arrow keys. This is a hypothetical performance point, not a measured result.</p></div><div class="visual-panel"><div id="roof-metrics"></div><svg id="roof-chart" viewBox="0 0 900 470" role="img" aria-label="Interactive logarithmic Roofline chart"></svg><div class="explanation"><h3>Observe → explain</h3><p id="roof-explain"></p><p>Intensity = FLOPs / global bytes. Bandwidth ceiling = intensity × GB/s ÷ 1000 in TFLOP/s. The upper bound is the smaller of this value and peak compute. The knee is peak × 1000 / bandwidth.</p><p class="small">Examples count logical global requests, including C stores, and ignore cache reuse and transaction overhead. Naive GEMM: 2N³ FLOPs, 4(2N³ + N²) bytes. Tiled GEMM: 4(2N³/T + N²) bytes, with N divisible by T. Attainment is a user assumption; the chart cannot predict a kernel runtime.</p></div></div></div>` +
      lab.sources();
    const $ = (id) => el.querySelector("#" + id),
      svg = $("roof-chart");
    let domain,
      dragging = false;
    function paint() {
      const r = Phase2Models.roofline(s),
        xmin = Math.min(
          -3,
          Math.floor(Math.log10(r.intensity)) - 1,
          Math.floor(Math.log10(r.knee)) - 1,
        ),
        xmax = Math.max(
          4,
          Math.ceil(Math.log10(r.intensity)) + 1,
          Math.ceil(Math.log10(r.knee)) + 1,
        ),
        ymin = Math.min(-3, Math.floor(Math.log10(r.throughput)) - 1),
        ymax = Math.max(2, Math.ceil(Math.log10(s.peak)) + 1);
      domain = { xmin, xmax, ymin, ymax };
      const X = (n) => 70 + ((Math.log10(n) - xmin) / (xmax - xmin)) * 790,
        Y = (n) => 410 - ((Math.log10(n) - ymin) / (ymax - ymin)) * 370;
      let markup =
        '<defs><clipPath id="roof-clip"><rect x="70" y="40" width="790" height="370"/></clipPath></defs><rect x="70" y="40" width="790" height="370" fill="#080d12"/>';
      const xs = Math.max(1, Math.ceil((xmax - xmin) / 9)),
        ys = Math.max(1, Math.ceil((ymax - ymin) / 7));
      for (let p = xmin; p <= xmax; p += xs)
        markup += `<path d="M${X(10 ** p)} 40V410" stroke="#26313b"/><text x="${X(10 ** p)}" y="434" text-anchor="middle">10^${p}</text>`;
      for (let p = ymin; p <= ymax; p += ys)
        markup += `<path d="M70 ${Y(10 ** p)}H860" stroke="#26313b"/><text x="60" y="${Y(10 ** p) + 4}" text-anchor="end">10^${p}</text>`;
      const left = 10 ** xmin,
        right = 10 ** xmax;
      markup += `<path d="M${X(left)} ${Y(Math.min(s.peak, (left * s.bandwidth) / 1000))}L${X(r.knee)} ${Y(s.peak)}L${X(right)} ${Y(s.peak)}" fill="none" stroke="#72e4cf" stroke-width="3" clip-path="url(#roof-clip)"/><path d="M${X(r.intensity)} 410V${Y(r.throughput)}" stroke="#edc47d" stroke-dasharray="4 5"/><circle id="roof-point" cx="${X(r.intensity)}" cy="${Y(r.throughput)}" r="9" fill="#edc47d" stroke="#fff" stroke-width="2" tabindex="0" role="slider" aria-label="Hypothetical workload point. Arrow keys change intensity and attainment." aria-valuetext="${fmt(r.intensity)} FLOPs per byte, ${Math.round(s.attainment * 100)} percent attainment"/><text x="450" y="460" text-anchor="middle">Arithmetic intensity · FLOPs / byte · logarithmic</text><text x="18" y="230" transform="rotate(-90 18 230)" text-anchor="middle">TFLOP/s · logarithmic</text><text x="80" y="25">Mint: ceiling · Amber: illustrative throughput</text>`;
      const focused = document.activeElement?.id === "roof-point";
      svg.innerHTML = markup;
      if (focused) $("roof-point").focus();
      $("roof-metrics").innerHTML = lab.metrics([
        [fmt(r.intensity), "FLOPs / byte"],
        [fmt(r.ceiling) + " TFLOP/s", "Theoretical upper bound"],
        [fmt(r.throughput) + " TFLOP/s", "Assumed throughput"],
        [fmt(r.knee), "Knee · FLOPs / byte"],
      ]);
      $("roof-percent").textContent = Math.round(s.attainment * 100) + "%";
      $("roof-explain").textContent =
        `${r.regime}: ${r.bandwidthBound < s.peak ? "reducing global traffic raises the ceiling until the compute roof is reached." : "additional reuse will not raise this ideal ceiling; examine compute utilization and other bottlenecks."} ${s.prediction ? "Prediction: " + s.prediction + ". " : ""}The point assumes ${Math.round(s.attainment * 100)}% of the bound.`;
      lab.save("roofline");
      $("roof-point").onkeydown = (e) => {
        if (
          !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
        )
          return;
        e.preventDefault();
        if (e.key === "ArrowLeft") s.bytes = Math.min(1e15, s.bytes * 1.2);
        if (e.key === "ArrowRight") s.bytes = Math.max(1, s.bytes / 1.2);
        if (e.key === "ArrowUp")
          s.attainment = Math.min(1, s.attainment + 0.05);
        if (e.key === "ArrowDown")
          s.attainment = Math.max(0.05, s.attainment - 0.05);
        sync();
        paint();
      };
    }
    function sync() {
      for (const key of ["flops", "bytes", "peak", "bandwidth"])
        $("roof-" + key).value = s[key];
      $("roof-attainment").value = s.attainment * 100;
    }
    for (const [key, max] of [
      ["flops", 1e15],
      ["bytes", 1e15],
      ["peak", 10000],
      ["bandwidth", 100000],
    ])
      $("roof-" + key).onchange = (e) => {
        const n = Number(e.target.value);
        if (!Number.isFinite(n) || n <= 0 || n > max) {
          e.target.value = s[key];
          return;
        }
        s[key] = n;
        paint();
      };
    $("roof-attainment").oninput = (e) => {
      s.attainment = Number(e.target.value) / 100;
      paint();
    };
    $("roof-predict").value = s.prediction;
    $("roof-predict").onchange = (e) => {
      s.prediction = e.target.value;
      paint();
    };
    $("roof-example").onchange = (e) => {
      const n = 256;
      if (e.target.value === "vector") {
        s.flops = 65536;
        s.bytes = 65536 * 12;
      } else if (e.target.value) {
        s.flops = 2 * n ** 3;
        s.bytes =
          4 * ((2 * n ** 3) / (e.target.value === "tiled" ? 16 : 1) + n ** 2);
      }
      sync();
      paint();
    };
    $("roof-reuse").onclick = () => {
      s.bytes = Math.max(1, s.bytes / 2);
      sync();
      paint();
    };
    $("roof-compute").onclick = () => {
      s.flops = Math.min(1e15, s.flops * 2);
      sync();
      paint();
    };
    svg.onpointerdown = (e) => {
      if (e.target.id !== "roof-point") return;
      dragging = true;
      svg.setPointerCapture(e.pointerId);
      e.preventDefault();
    };
    svg.onpointermove = (e) => {
      if (!dragging) return;
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(
          svg.getScreenCTM().inverse(),
        ),
        d = domain;
      const intensity =
        10 **
        (d.xmin +
          Math.max(0, Math.min(1, (p.x - 70) / 790)) * (d.xmax - d.xmin));
      s.bytes = Math.max(1, Math.min(1e15, s.flops / intensity));
      const r = Phase2Models.roofline(s),
        target =
          10 **
          (d.ymin +
            Math.max(0, Math.min(1, (410 - p.y) / 370)) * (d.ymax - d.ymin));
      s.attainment = Math.max(0.05, Math.min(1, target / r.ceiling));
      sync();
      paint();
    };
    svg.onpointerup = svg.onpointercancel = () => (dragging = false);
    paint();
    return () => lab.save("roofline");
  },
};
