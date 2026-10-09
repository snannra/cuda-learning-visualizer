"use strict";
const $ = (id) => document.getElementById(id),
  canvas = $("canvas"),
  ctx = canvas.getContext("2d");
const MAX = 1000000;
let layers = [
  {
    name: "Matrix",
    w: 64,
    h: 64,
    x: 0,
    y: 0,
    color: "#72e4cf",
    repeat: false,
    visible: true,
  },
  {
    name: "Block",
    w: 16,
    h: 16,
    x: 0,
    y: 0,
    color: "#8bbcff",
    repeat: false,
    visible: true,
  },
  {
    name: "Tile",
    w: 8,
    h: 8,
    x: 0,
    y: 0,
    color: "#edc47d",
    repeat: false,
    visible: true,
  },
];
let scale = 9,
  ox = 70,
  oy = 70,
  width = 0,
  height = 0,
  frame = 0;
const marks = new Set(),
  pointers = new Map();
let gesture = null;
const world = (x, y) => [(x - ox) / scale, (y - oy) / scale];
const page = () => ({
  enabled: $("bounded").checked,
  w: +$("page-w").value,
  h: +$("page-h").value,
});
function requestDraw() {
  if (!frame)
    frame = requestAnimationFrame(() => {
      frame = 0;
      draw();
    });
}
function resize() {
  const r = canvas.getBoundingClientRect(),
    dpr = devicePixelRatio || 1;
  width = r.width;
  height = r.height;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  requestDraw();
}
function niceStep(min) {
  const power = 10 ** Math.floor(Math.log10(Math.max(min, 1)));
  for (const factor of [1, 2, 5, 10])
    if (power * factor >= min) return Math.max(1, power * factor);
  return 1;
}
function line(x1, y1, x2, y2, color, lineWidth = 1) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}
function rect(x, y, w, h, color, fill = true) {
  const sx = ox + x * scale,
    sy = oy + y * scale;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  if (fill) {
    ctx.fillStyle = color + "0c";
    ctx.fillRect(sx, sy, w * scale, h * scale);
  }
  ctx.strokeRect(sx, sy, w * scale, h * scale);
}
// Iterate only visible lines, aggregating when cells are smaller than pixels.
function gridLines(x, y, w, h, stepX, stepY, color, lineWidth) {
  const left = Math.max(x, world(0, 0)[0]),
    right = Math.min(x + w, world(width, height)[0]);
  const top = Math.max(y, world(0, 0)[1]),
    bottom = Math.min(y + h, world(width, height)[1]);
  if (left > right || top > bottom) return;
  const strideX = stepX * Math.max(1, Math.ceil(9 / (stepX * scale))),
    strideY = stepY * Math.max(1, Math.ceil(9 / (stepY * scale)));
  for (
    let v = x + Math.ceil((left - x) / strideX) * strideX;
    v <= right;
    v += strideX
  )
    line(
      ox + v * scale,
      oy + top * scale,
      ox + v * scale,
      oy + bottom * scale,
      color,
      lineWidth,
    );
  for (
    let v = y + Math.ceil((top - y) / strideY) * strideY;
    v <= bottom;
    v += strideY
  )
    line(
      ox + left * scale,
      oy + v * scale,
      ox + right * scale,
      oy + v * scale,
      color,
      lineWidth,
    );
}
function draw() {
  ctx.clearRect(0, 0, width, height);
  const [left, top] = world(0, 0),
    [right, bottom] = world(width, height),
    tick = niceStep(70 / scale);
  gridLines(
    Math.floor(left),
    Math.floor(top),
    right - Math.floor(left),
    bottom - Math.floor(top),
    1,
    1,
    "#141414",
    1,
  );
  // Labeled reference grid uses a stable world origin.
  const gx = Math.floor(left / tick) * tick,
    gy = Math.floor(top / tick) * tick;
  gridLines(gx, gy, right - gx, bottom - gy, tick, tick, "#292929", 1);
  ctx.font = "12px ui-monospace,monospace";
  ctx.fillStyle = "#969696";
  for (let x = Math.ceil(left / tick) * tick; x < right; x += tick)
    ctx.fillText(
      String(x),
      ox + x * scale + 4,
      Math.max(15, Math.min(height - 10, oy - 6)),
    );
  for (let y = Math.ceil(top / tick) * tick; y < bottom; y += tick)
    ctx.fillText(
      String(y),
      Math.max(5, Math.min(width - 60, ox + 5)),
      oy + y * scale - 4,
    );
  line(ox, 0, ox, height, "#666666");
  line(0, oy, width, oy, "#666666");
  const p = page();
  if (p.enabled) {
    ctx.setLineDash([6, 5]);
    rect(0, 0, p.w, p.h, "#d8e1ef", false);
    ctx.setLineDash([]);
  }
  for (const l of layers.filter((l) => l.visible)) {
    if (l.repeat) {
      const x = p.enabled ? Math.max(0, l.x) : left,
        y = p.enabled ? Math.max(0, l.y) : top,
        r = p.enabled ? p.w : right,
        b = p.enabled ? p.h : bottom;
      // Keep repeated lattice aligned with the layer's origin, even at negative coordinates.
      const sx = l.x + Math.floor((x - l.x) / l.w) * l.w,
        sy = l.y + Math.floor((y - l.y) / l.h) * l.h;
      ctx.save();
      if (p.enabled) {
        ctx.beginPath();
        ctx.rect(ox, oy, p.w * scale, p.h * scale);
        ctx.clip();
      }
      gridLines(sx, sy, r - sx, b - sy, l.w, l.h, l.color + "b0", 1.5);
      ctx.restore();
    } else {
      rect(l.x, l.y, l.w, l.h, l.color);
      gridLines(l.x, l.y, l.w, l.h, 1, 1, l.color + "35", 1);
    }
  }
  for (const key of marks) {
    const [x, y] = key.split(",").map(Number);
    if (x + 1 < left || x > right || y + 1 < top || y > bottom) continue;
    ctx.fillStyle = "#fff4";
    ctx.fillRect(ox + x * scale, oy + y * scale, scale, scale);
    rect(x, y, 1, 1, "#ffffff", false);
  }
  $("status").textContent =
    `${scale.toFixed(2)} px / cell · ${marks.size} marked · ${scale < 9 ? "fine lines aggregated" : "individual cells"}`;
}
function numeric(input, layer, key, positive) {
  input.onchange = () => {
    const value = Number(input.value);
    if (
      !Number.isSafeInteger(value) ||
      value < (positive ? 1 : -MAX) ||
      value > MAX
    ) {
      input.value = layer[key];
      return;
    }
    layer[key] = value;
    details();
    requestDraw();
  };
}
function controls() {
  $("layers").replaceChildren();
  layers.forEach((l, index) => {
    const card = document.createElement("div");
    card.className = "layer";
    card.style.setProperty("--color", l.color);
    card.innerHTML =
      '<div class="layer-head"><input type="checkbox" aria-label="Show layer"><input type="color" aria-label="Layer color"><input type="text" aria-label="Layer name"><button aria-label="Remove layer">×</button></div><div class="fields"><label>Columns<input type="number" min="1" max="1000000"></label><label>Rows<input type="number" min="1" max="1000000"></label><label>Origin X<input type="number" min="-1000000" max="1000000"></label><label>Origin Y<input type="number" min="-1000000" max="1000000"></label></div><label class="check"><input type="checkbox"> Repeat as a partition</label><small></small>';
    const inputs = card.querySelectorAll("input");
    inputs[0].checked = l.visible;
    inputs[0].onchange = () => {
      l.visible = inputs[0].checked;
      requestDraw();
    };
    inputs[1].value = l.color;
    inputs[1].oninput = () => {
      l.color = inputs[1].value;
      card.style.setProperty("--color", l.color);
      requestDraw();
    };
    inputs[2].value = l.name;
    inputs[2].oninput = () => {
      l.name = inputs[2].value;
      details();
    };
    ["w", "h", "x", "y"].forEach((key, i) => {
      inputs[i + 3].value = l[key];
      numeric(inputs[i + 3], l, key, i < 2);
    });
    inputs[7].checked = l.repeat;
    inputs[7].onchange = () => {
      l.repeat = inputs[7].checked;
      details();
      requestDraw();
    };
    card.querySelector("button").onclick = () => {
      layers.splice(index, 1);
      controls();
      requestDraw();
    };
    card.querySelector("small").textContent =
      `${(l.w * l.h).toLocaleString()} cells ${l.repeat ? "per partition" : "in layer"}`;
    $("layers").append(card);
  });
  details();
}
function details() {
  document.querySelectorAll(".layer small").forEach((el, i) => {
    const l = layers[i],
      p = page();
    el.textContent = `${(l.w * l.h).toLocaleString()} cells${l.repeat ? " / partition" : ""}${l.repeat && p.enabled ? ` · ${Math.ceil(Math.max(0, p.w - l.x) / l.w)} × ${Math.ceil(Math.max(0, p.h - l.y) / l.h)} partitions (edges may be partial)` : ""}`;
  });
}
function zoom(factor, x = width / 2, y = height / 2) {
  const [wx, wy] = world(x, y);
  scale = Math.max(0.00005, Math.min(160, scale * factor));
  ox = x - wx * scale;
  oy = y - wy * scale;
  requestDraw();
}
function fit() {
  const p = page(),
    finite = layers.filter((l) => l.visible && !l.repeat);
  let x = 0,
    y = 0,
    w = 64,
    h = 64;
  if (p.enabled) {
    w = p.w;
    h = p.h;
  } else if (finite.length) {
    x = Math.min(...finite.map((l) => l.x));
    y = Math.min(...finite.map((l) => l.y));
    w = Math.max(...finite.map((l) => l.x + l.w)) - x;
    h = Math.max(...finite.map((l) => l.y + l.h)) - y;
  }
  scale = Math.max(
    0.00005,
    Math.min(80, Math.min((width - 90) / w, (height - 90) / h)),
  );
  ox = (width - w * scale) / 2 - x * scale;
  oy = (height - h * scale) / 2 - y * scale;
  requestDraw();
}
function inspect(x, y) {
  const [wx, wy] = world(x, y),
    col = Math.floor(wx),
    row = Math.floor(wy),
    key = `${col},${row}`;
  if (marks.has(key)) marks.delete(key);
  else marks.add(key);
  const text = [`Cell (${col}, ${row})`];
  for (const l of layers.filter((l) => l.visible)) {
    const rx = col - l.x,
      ry = row - l.y;
    if (l.repeat)
      text.push(
        `${l.name}: partition (${Math.floor(rx / l.w)}, ${Math.floor(ry / l.h)})\n  local (${((rx % l.w) + l.w) % l.w}, ${((ry % l.h) + l.h) % l.h})`,
      );
    else
      text.push(
        `${l.name}: ${rx >= 0 && ry >= 0 && rx < l.w && ry < l.h ? "inside · local (" + rx + ", " + ry + ")" : "outside"}`,
      );
  }
  const p = page();
  if (p.enabled)
    text.push(
      `Page: ${col >= 0 && row >= 0 && col < p.w && row < p.h ? "inside" : "outside"}`,
    );
  $("inspection").textContent = text.join("\n");
  requestDraw();
}
function point(e) {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}
canvas.onpointerdown = (e) => {
  canvas.focus();
  canvas.setPointerCapture(e.pointerId);
  const p = point(e);
  pointers.set(e.pointerId, p);
  if (pointers.size === 1) gesture = { start: p, last: p, moved: false };
  else gesture.moved = true;
};
canvas.onpointermove = (e) => {
  const p = point(e),
    [x, y] = world(p.x, p.y);
  $("coordinates").textContent =
    `column ${Math.floor(x)} · row ${Math.floor(y)}`;
  if (!pointers.has(e.pointerId)) return;
  const old = [...pointers.values()];
  pointers.set(e.pointerId, p);
  const current = [...pointers.values()];
  if (current.length === 2) {
    const dist = (a) => Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
    const center = (a) => ({
      x: (a[0].x + a[1].x) / 2,
      y: (a[0].y + a[1].y) / 2,
    });
    const a = center(old),
      b = center(current);
    if (dist(old) > 0) zoom(dist(current) / dist(old), a.x, a.y);
    ox += b.x - a.x;
    oy += b.y - a.y;
    gesture.moved = true;
  } else {
    const previous = old[0];
    ox += p.x - previous.x;
    oy += p.y - previous.y;
    if (Math.hypot(p.x - gesture.start.x, p.y - gesture.start.y) > 4)
      gesture.moved = true;
  }
  requestDraw();
};
canvas.onpointerup = (e) => {
  const p = point(e);
  if (pointers.size === 1 && !gesture.moved) inspect(p.x, p.y);
  pointers.delete(e.pointerId);
};
canvas.onpointercancel = (e) => pointers.delete(e.pointerId);
canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const p = point(e);
    zoom(Math.exp(-e.deltaY * 0.0015), p.x, p.y);
  },
  { passive: false },
);
canvas.onkeydown = (e) => {
  const pan = {
    ArrowLeft: [50, 0],
    ArrowRight: [-50, 0],
    ArrowUp: [0, 50],
    ArrowDown: [0, -50],
  };
  if (pan[e.key]) {
    e.preventDefault();
    ox += pan[e.key][0];
    oy += pan[e.key][1];
    requestDraw();
  } else if (e.key === "+" || e.key === "=") zoom(1.3);
  else if (e.key === "-") zoom(1 / 1.3);
  else if (e.key.toLowerCase() === "f") fit();
};
$("plus").onclick = () => zoom(1.5);
$("minus").onclick = () => zoom(1 / 1.5);
$("origin").onclick = () => {
  ox = 70;
  oy = 70;
  requestDraw();
};
$("fit").onclick = fit;
$("fit-top").onclick = fit;
$("clear").onclick = () => {
  marks.clear();
  $("inspection").textContent = "Click the graph to inspect a cell.";
  requestDraw();
};
$("add").onclick = () => {
  layers.push({
    name: `Grid ${layers.length + 1}`,
    w: 4,
    h: 4,
    x: 0,
    y: 0,
    color: ["#f58cae", "#ba9bff", "#79d9ff"][layers.length % 3],
    visible: true,
    repeat: false,
  });
  controls();
  requestDraw();
};
for (const id of ["page-w", "page-h"])
  $(id).onchange = () => {
    const input = $(id);
    if (
      !Number.isSafeInteger(+input.value) ||
      +input.value < 1 ||
      +input.value > MAX
    )
      input.value = 64;
    details();
    requestDraw();
  };
$("bounded").onchange = () => {
  details();
  requestDraw();
};
new ResizeObserver(resize).observe(canvas);
controls();
resize();
fit();
