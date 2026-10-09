"use strict";
const D = window.ArchitectureData,
  $ = (id) => document.getElementById(id);
let viewMode = "hardware";
const c = {
  mode: "cpu",
  cores: 4,
  alus: 4,
  l1: 32,
  sms: 8,
  parts: 4,
  lanes: 16,
  threads: 256,
  budget: 192,
  shared: 64,
  tile: 16,
};
let scene,
  sceneKey = "cpu",
  history = ["cpu"],
  selected = null,
  zoom = 1,
  panX = 0,
  panY = 0,
  traceIndex = -1,
  timer = null,
  activeFlow = "instruction",
  suppressClick = false;
const viewHistory = new Map();
const positions = new Map(),
  cacheSlots = Array(8).fill(null);
let hits = 0,
  misses = 0,
  cacheLatest = -1;
const accents = { memory: "#8bbcff", execution: "#72e4cf", control: "#bba8e6" };
const memoryTypes = new Set([
  "l1",
  "l1i",
  "l2",
  "l3",
  "dram",
  "global",
  "cache",
  "shared",
  "constant",
  "registers",
]);
function kind(type) {
  return memoryTypes.has(type)
    ? "memory"
    : [
          "fetch",
          "decode",
          "schedule",
          "rob",
          "partition",
          "barrier",
          "fabric",
          "controller",
          "warp",
          "block",
        ].includes(type)
      ? "control"
      : "execution";
}
function pause() {
  if (timer) clearInterval(timer);
  timer = null;
  $("play").textContent = "Play";
}
function settings() {
  presetOptions();
  $("settings").replaceChildren();
  const configs =
    c.mode === "cpu"
      ? [
          ["cores", "CPU cores", 1, 16, 1],
          ["alus", "ALUs / core", 1, 8, 1],
          ["l1", "L1 data · KiB", 16, 128, 16],
        ]
      : [
          ["sms", "Streaming multiprocessors", 1, 32, 1],
          ["parts", "Partitions / SM", 1, 8, 1],
          ["lanes", "Arithmetic lanes / partition", 4, 32, 4],
          ["threads", "Threads / block", 1, 1024, 1],
          ["l2", "L2 cache · MiB", 1, 64, 1],
          ["shared", "Shared allocation · KiB", 0, 192, 8],
          ["tile", "Shared tile width", 1, 64, 1],
        ];
  if (c.l2 === undefined) c.l2 = 40;
  for (const [key, label, min, max, step] of configs) {
    const el = document.createElement("div");
    el.className = "setting";
    el.innerHTML =
      '<div class="setting-head"><span></span><output></output></div><input type="range">';
    el.querySelector("span").textContent = label;
    const input = el.querySelector("input");
    Object.assign(input, { min, max, step, value: c[key] });
    input.setAttribute("aria-label", label);
    input.dataset.setting = key;
    el.querySelector("output").textContent = c[key];
    input.oninput = () => {
      c[key] = +input.value;
      el.querySelector("output").textContent = c[key];
      pause();
      $("preset").value = "custom";
      renderScene(viewMode === "hardware");
    };
    $("settings").append(el);
  }
}
function presetOptions() {
  const select = $("preset"),
    value = select.value;
  select.replaceChildren(
    ...HardwareView.presets[c.mode].map((p, i) => {
      const o = document.createElement("option");
      o.value = String(i);
      o.textContent = p.name;
      return o;
    }),
  );
  const custom = document.createElement("option");
  custom.value = "custom";
  custom.textContent = "Custom configuration";
  select.append(custom);
  select.value = HardwareView.presets[c.mode].findIndex((p) =>
    Object.entries(p.values).every(([k, v]) => c[k] === v),
  );
  if (select.selectedIndex < 0) select.value = "custom";
}
function setView(mode) {
  pause();
  viewMode = mode;
  for (const [id, key] of [
    ["hardware-view", "hardware"],
    ["flow-view", "flow"],
  ]) {
    const active = mode === key;
    $(id).classList.toggle("active", active);
    $(id).setAttribute("aria-pressed", active);
  }
  renderScene(true);
}
$("hardware-view").onclick = () => setView("hardware");
$("flow-view").onclick = () => setView("flow");
$("preset").onchange = () => {
  if ($("preset").value === "custom") return;
  pause();
  Object.assign(c, HardwareView.presets[c.mode][+$("preset").value].values);
  settings();
  renderScene(true);
};
function changeMode(mode) {
  pause();
  c.mode = mode;
  viewHistory.clear();
  history = [mode];
  sceneKey = mode;
  traceIndex = -1;
  document.querySelectorAll(".switch button").forEach((b) => {
    b.classList.toggle("active", b.id === mode);
    b.setAttribute("aria-pressed", b.id === mode);
  });
  activeFlow = mode === "cpu" ? "instruction" : "tile";
  settings();
  flows();
  renderScene(true);
}
function flows() {
  const keys =
    c.mode === "cpu"
      ? ["instruction", "cold", "hit"]
      : ["tile", "global", "constant", "issue"];
  $("flow").replaceChildren(
    ...keys.map((key) => {
      const o = document.createElement("option");
      o.value = key;
      o.textContent = D.traces[key].name;
      return o;
    }),
  );
  $("flow").value = activeFlow;
  updateTrace();
}
function rememberView() {
  viewHistory.set(history.length - 1, {
    zoom,
    panX,
    panY,
    selectedId: selected?.id,
    viewMode,
    activeFlow,
    traceIndex,
  });
}
function navigate(key) {
  if (sceneKey === key) return;
  pause();
  rememberView();
  traceIndex = -1;
  history.push(key);
  sceneKey = key;
  selected = null;
  renderScene(true);
  updateTrace();
}
function crumb(index) {
  if (index < 0 || index >= history.length || index === history.length - 1)
    return;
  pause();
  rememberView();
  const saved = viewHistory.get(index);
  history = history.slice(0, index + 1);
  sceneKey = history.at(-1);
  traceIndex = saved?.traceIndex ?? -1;
  activeFlow = saved?.activeFlow ?? activeFlow;
  if (saved) viewMode = saved.viewMode;
  selected = saved?.selectedId ? { id: saved.selectedId } : null;
  for (const [id, key] of [
    ["hardware-view", "hardware"],
    ["flow-view", "flow"],
  ]) {
    $(id).classList.toggle("active", viewMode === key);
    $(id).setAttribute("aria-pressed", viewMode === key);
  }
  renderScene(!saved);
  if (saved) {
    zoom = saved.zoom;
    panX = saved.panX;
    panY = saved.panY;
    transform();
  }
  $("flow").value = activeFlow;
  updateTrace();
}
$("back-level").onclick = () => crumb(history.length - 2);
$("chip-home").onclick = () => crumb(0);
document.addEventListener("keydown", (e) => {
  if (e.altKey && e.key === "ArrowLeft" && history.length > 1) {
    e.preventDefault();
    crumb(history.length - 2);
  }
});
function renderScene(fitView) {
  const oldSelected = selected?.id;
  scene = D.scene(sceneKey, c);
  if (viewMode === "hardware") HardwareView.layout(scene, sceneKey);
  $("viewport").classList.toggle("hardware-mode", viewMode === "hardware");
  $("world").classList.toggle("silicon-die", viewMode === "hardware");
  for (const n of scene.nodes) {
    const saved = positions.get(c.mode + ":" + sceneKey + ":" + n.id);
    if (saved && viewMode === "flow") Object.assign(n, saved);
  }
  $("scene-caption").textContent = scene.caption;
  $("world").style.width = scene.w + "px";
  $("world").style.height = scene.h + "px";
  $("wires").setAttribute("width", scene.w);
  $("wires").setAttribute("height", scene.h);
  $("nodes").replaceChildren();
  for (const n of scene.nodes) {
    const info = D.info[n.type],
      category = kind(n.type);
    const el = document.createElement("div");
    el.className = "node";
    el.style.setProperty("--accent", accents[category]);
    el.style.width = n.width + "px";
    el.style.left = n.x + "px";
    el.style.top = n.y + "px";
    el.dataset.id = n.id;
    el.tabIndex = 0;
    el.setAttribute("role", "button");
    el.setAttribute(
      "aria-label",
      `${info[0]}. ${n.subtitle}. ${n.target ? "Open to explore inside." : ""}`,
    );
    const type = document.createElement("div");
    type.className = "kind";
    type.textContent = category.toUpperCase();
    const title = document.createElement("h3");
    title.textContent = n.label || info[0];
    const sub = document.createElement("p");
    sub.textContent = n.subtitle;
    el.append(type, title, sub);
    if (n.context) {
      el.classList.add("context-resource");
      const badge = document.createElement("div");
      badge.className = "context-badge";
      badge.textContent = n.context;
      el.prepend(badge);
    }
    if (viewMode === "hardware") {
      el.classList.add("hardware-node");
      if (["dram", "global"].includes(n.type))
        el.classList.add("external-memory");
      el.style.height = (n.hardwareHeight || 244) + "px";
      if (!n.id.startsWith("unit") || n.type === "core" || n.type === "sm")
        el.append(HardwareView.illustration(n, c, inspect, navigate));
    }
    if (viewMode === "flow" && (n.type === "fp" || n.type === "alu")) {
      const mini = document.createElement("div");
      mini.className = "mini";
      for (let i = 0; i < (n.type === "alu" ? c.alus : c.lanes); i++)
        mini.append(document.createElement("i"));
      el.append(mini);
    }
    if (n.target) {
      const button = document.createElement("button");
      button.className = "open";
      button.textContent =
        "Open " +
        ({
          core: "core",
          sm: "SM",
          partition: "partition",
          cache: "cache",
          alu: "ALU",
          warp: "warp",
          shared: "shared tile",
          memory: "memory path",
        }[n.target] || n.target);
      button.onclick = (e) => {
        e.stopPropagation();
        if (!suppressClick) navigate(n.target);
      };
      button.onpointerdown = (e) => e.stopPropagation();
      el.append(button);
    }
    el.onclick = () => {
      if (!suppressClick) inspect(n);
    };
    el.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        inspect(n);
      }
      if (e.key === "Enter" && e.shiftKey && n.target) navigate(n.target);
    };
    el.ondblclick = () => {
      if (n.target) navigate(n.target);
    };
    if (viewMode === "flow") enableNodeDrag(el, n);
    $("nodes").append(el);
    n.el = el;
  }
  $("back-level").disabled = history.length <= 1;
  $("chip-home").disabled = history.length <= 1;
  $("breadcrumbs").replaceChildren(
    ...history.map((key, i) => {
      const b = document.createElement("button");
      b.textContent = D.scene(key, c).title;
      b.onclick = () => crumb(i);
      return b;
    }),
  );
  selected =
    scene.nodes.find((n) => n.id === oldSelected) ||
    scene.nodes.find((n) => n.type === sceneKey) ||
    scene.nodes[0];
  inspect(selected);
  if (fitView) fit();
  else transform();
  requestAnimationFrame(drawWires);
  highlightTrace();
}
function drawWires() {
  if (!scene) return;
  const svg = $("wires");
  svg.replaceChildren();
  if (viewMode === "hardware") return;
  const ns = "http://www.w3.org/2000/svg";
  const defs = document.createElementNS(ns, "defs");
  defs.innerHTML =
    '<marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#666666"/></marker>';
  svg.append(defs);
  const active =
    traceIndex >= 0 && D.traces[activeFlow].scene === sceneKey
      ? D.traces[activeFlow].steps[traceIndex]?.[0]
      : null;
  for (const [from, to] of scene.edges) {
    const a = scene.nodes.find((n) => n.id === from),
      b = scene.nodes.find((n) => n.id === to);
    if (!a || !b) continue;
    const ah = a.el.offsetHeight,
      bh = b.el.offsetHeight;
    let ax = a.x + a.width / 2,
      ay = a.y + ah / 2,
      bx = b.x + b.width / 2,
      by = b.y + bh / 2;
    if (Math.abs(bx - ax) > Math.abs(by - ay)) {
      ax += (Math.sign(bx - ax) * a.width) / 2;
      bx -= (Math.sign(bx - ax) * b.width) / 2;
    } else {
      ay += (Math.sign(by - ay) * ah) / 2;
      by -= (Math.sign(by - ay) * bh) / 2;
    }
    const path = document.createElementNS(ns, "path");
    const mid = (ax + bx) / 2;
    path.setAttribute(
      "d",
      `M${ax} ${ay} C${mid} ${ay},${mid} ${by},${bx} ${by}`,
    );
    path.setAttribute("class", "wire" + (to === active ? " active" : ""));
    path.setAttribute("marker-end", "url(#arrow)");
    svg.append(path);
  }
}
function inspect(n) {
  selected = n;
  const info = D.info[n.type];
  $("component-title").textContent = n.label
    ? `${n.label} · ${info[0]}`
    : info[0];
  $("scope").textContent =
    n.context ||
    (n.type === "l1"
      ? c.mode === "gpu"
        ? "Per SM"
        : "Per CPU core"
      : n.type === "l2"
        ? c.mode === "gpu"
          ? "GPU-wide · shared across SMs"
          : "Private to a CPU core in this model"
        : info[1]);
  $("description").textContent = info[2];
  $("facts").replaceChildren(
    ...info[3].map((text) => {
      const el = document.createElement("div");
      el.textContent = text;
      return el;
    }),
  );
  $("caveat").textContent = info[4];
  $("open-component").hidden = !n.target;
  $("open-component").onclick = () => navigate(n.target);
  document
    .querySelectorAll(".node")
    .forEach((el) => el.classList.toggle("selected", el.dataset.id === n.id));
  experiment(n.type);
}
function syncSetting(key) {
  const input = document.querySelector(`[data-setting="${key}"]`);
  if (input) {
    input.value = c[key];
    input.parentElement.querySelector("output").textContent = c[key];
  }
}
function experiment(type) {
  const box = $("experiment");
  box.replaceChildren();
  if (type === "alu" || type === "fp" || sceneKey === "alu") {
    box.innerHTML =
      '<div class="experiment-grid"><label>Operand A<input id="operand-a" type="number" min="0" max="255" value="13"></label><label>Operand B<input id="operand-b" type="number" min="0" max="255" value="7"></label></div><label>Operation<select id="operation"><option value="add">ADD</option><option value="sub">SUB</option><option value="and">AND</option><option value="or">OR</option><option value="xor">XOR</option></select></label><div class="result" id="alu-result"></div><p>8-bit unsigned integers. Results wrap modulo 256.</p>';
    const calculate = () => {
      const a = +$("operand-a").value,
        b = +$("operand-b").value;
      if (
        !Number.isInteger(a) ||
        !Number.isInteger(b) ||
        a < 0 ||
        a > 255 ||
        b < 0 ||
        b > 255
      ) {
        $("alu-result").textContent = "Enter integers from 0 to 255.";
        return;
      }
      const op = $("operation").value,
        raw = { add: a + b, sub: a - b, and: a & b, or: a | b, xor: a ^ b }[op],
        out = ((raw % 256) + 256) % 256;
      $("alu-result").textContent =
        `A: ${a.toString(2).padStart(8, "0")}\nB: ${b.toString(2).padStart(8, "0")}\n${op.toUpperCase()}: ${out.toString(2).padStart(8, "0")} = ${out}${raw !== out ? " · wrapped" : ""}`;
      $("alu-result").style.whiteSpace = "pre-line";
    };
    ["operand-a", "operand-b", "operation"].forEach(
      (id) => ($(id).oninput = calculate),
    );
    calculate();
  } else if (
    type === "warp" ||
    type === "constant" ||
    type === "partition" ||
    sceneKey === "warp"
  ) {
    box.innerHTML =
      '<label>Threads in block<input id="exp-threads" type="number" min="1" max="1024"></label><label>Active path<select id="mask"><option value="all">All valid lanes</option><option value="even">Even lanes only</option><option value="odd">Odd lanes only</option></select></label><label>Constant address pattern<select id="constant-pattern"><option value="uniform">Same address per lane</option><option value="distinct">Distinct address per lane</option></select></label><div class="lanes" id="lanes"></div><div class="result" id="warp-result"></div><p>Inspecting the final warp in the block. Masked lanes do not participate in the selected path.</p>';
    $("exp-threads").value = c.threads;
    const calculate = () => {
      const count = +$("exp-threads").value;
      if (!Number.isInteger(count) || count < 1 || count > 1024) {
        $("warp-result").textContent = "Enter 1–1024 threads.";
        return;
      }
      c.threads = count;
      syncSetting("threads");
      const warps = Math.ceil(count / 32),
        valid = count - (warps - 1) * 32,
        mask = $("mask").value;
      document
        .querySelectorAll(".thread-array")
        .forEach((array) =>
          array
            .querySelectorAll("button")
            .forEach((b, i) => b.classList.toggle("inactive", i >= valid)),
        );
      let active = 0;
      $("lanes").replaceChildren();
      for (let i = 0; i < 32; i++) {
        const yes =
          i < valid &&
          (mask === "all" || (mask === "even" ? i % 2 === 0 : i % 2 === 1));
        active += +yes;
        const lane = document.createElement("div");
        lane.className = "lane" + (yes ? "" : " inactive");
        lane.textContent = i;
        lane.title = `Thread ${(warps - 1) * 32 + i}: ${i >= valid ? "outside block" : yes ? "active" : "masked"}`;
        $("lanes").append(lane);
      }
      $("warp-result").textContent =
        `${warps} warps · ${valid}/32 valid final lanes · ${active} active\nConstant: ${$("constant-pattern").value === "uniform" ? (active ? 1 : 0) : active} distinct address request(s)`;
      $("warp-result").style.whiteSpace = "pre-line";
    };
    ["exp-threads", "mask", "constant-pattern"].forEach(
      (id) => ($(id).oninput = calculate),
    );
    calculate();
  } else if (type === "shared" || type === "barrier" || sceneKey === "shared") {
    box.innerHTML =
      '<label>Tile width<input id="exp-tile" type="number" min="1" max="64"></label><div class="result" id="tile-result"></div><p>Shared storage holds two float32 tiles. This calculates storage only; occupancy also depends on registers, thread limits, and other resources.</p><button class="exp-button" id="follow-tile">Follow a tile load</button>';
    $("exp-tile").value = c.tile;
    const calculate = () => {
      const tile = +$("exp-tile").value;
      if (!Number.isInteger(tile) || tile < 1 || tile > 64) {
        $("tile-result").textContent = "Enter a tile width from 1 to 64.";
        return;
      }
      c.tile = tile;
      syncSetting("tile");
      const bytes = 2 * tile * tile * 4;
      $("tile-result").textContent =
        `2 × ${tile}² × 4 = ${bytes.toLocaleString()} bytes\n${(bytes / 1024).toFixed(2)} KiB / block\n${bytes <= c.shared * 1024 ? "Fits" : "Exceeds"} ${c.shared} KiB shared allocation${tile * tile > 1024 ? "\nOne-thread-per-output launch exceeds 1024 threads/block." : ""}`;
      $("tile-result").style.whiteSpace = "pre-line";
    };
    $("exp-tile").oninput = calculate;
    $("follow-tile").onclick = () => {
      changeMode("gpu");
      activeFlow = "tile";
      $("flow").value = activeFlow;
      startTrace();
    };
    calculate();
  } else if (
    ["cache", "l1", "l1i", "l2", "l3", "global", "dram"].includes(type) ||
    sceneKey === "cache"
  ) {
    box.innerHTML =
      '<label>Byte address<input id="address" type="number" min="0" max="1048575" value="128"></label><button id="read-cache" class="exp-button">Read address</button><button id="clear-cache" class="exp-button">Cold reset</button><div class="result" id="cache-result">Read an address to populate a line.</div><div id="cache-lines"></div><div id="byte-view"></div><p>8 direct-mapped slots × 64 bytes = 512 bytes. Repeat an address for a hit. Add 512 to conflict with the same slot.</p>';
    const showBytes = (slot) => {
      const area = $("byte-view");
      area.replaceChildren();
      const tag = cacheSlots[slot],
        base = tag === null ? null : (tag * 8 + slot) * 64;
      const caption = document.createElement("div");
      caption.className = "byte-caption";
      caption.textContent =
        base === null
          ? `Slot ${slot} is invalid.`
          : `Slot ${slot} contains addresses ${base}–${base + 63}. Click a byte offset.`;
      area.append(caption);
      const bytes = document.createElement("div");
      bytes.className = "cache-byte-view";
      for (let offset = 0; offset < 64; offset++) {
        const b = document.createElement("button");
        b.textContent = offset;
        b.title =
          base === null
            ? "Invalid cache line"
            : `Byte address ${base + offset}`;
        b.onclick = () => {
          bytes
            .querySelectorAll("button")
            .forEach((x) => x.classList.toggle("active", x === b));
          caption.textContent = `Slot ${slot} · byte offset ${offset}${base === null ? " · invalid" : ` · address ${base + offset}`} (values not simulated)`;
        };
        bytes.append(b);
      }
      area.append(bytes);
    };
    const show = () => {
      $("cache-lines").replaceChildren(
        ...cacheSlots.map((tag, i) => {
          const el = document.createElement("div");
          el.className = "cache-slot" + (cacheLatest === i ? " hit" : "");
          el.textContent = `Slot ${i} · ${tag === null ? "invalid" : `tag ${tag}`} `;
          el.tabIndex = 0;
          el.setAttribute("role", "button");
          el.onclick = () => showBytes(i);
          el.onkeydown = (e) => {
            if (e.key === "Enter") showBytes(i);
          };
          return el;
        }),
      );
      document
        .querySelectorAll(".large-cache .visual-cache-line")
        .forEach((el) => {
          const i = +el.dataset.slot;
          el.classList.toggle("resident", cacheSlots[i] !== null);
          el.classList.toggle("recent", i === cacheLatest);
          el.querySelector(".visual-tag").textContent =
            cacheSlots[i] === null ? "INVALID" : "TAG " + cacheSlots[i];
        });
      if (cacheLatest >= 0) showBytes(cacheLatest);
    };
    $("read-cache").onclick = () => {
      const address = +$("address").value;
      if (!Number.isInteger(address) || address < 0 || address > 1048575) {
        $("cache-result").textContent =
          "Enter a byte address from 0 to 1048575.";
        return;
      }
      const line = Math.floor(address / 64),
        slot = line % 8,
        tag = Math.floor(line / 8),
        offset = address % 64,
        hit = cacheSlots[slot] === tag,
        evicted = cacheSlots[slot];
      if (hit) hits++;
      else {
        misses++;
        cacheSlots[slot] = tag;
      }
      cacheLatest = slot;
      $("cache-result").textContent =
        `${hit ? "HIT" : "MISS"} · tag ${tag} · slot ${slot} · offset ${offset}\n${hits} hit(s), ${misses} miss(es)${!hit && evicted !== null ? "\nEvicted tag " + evicted : ""}`;
      $("cache-result").style.whiteSpace = "pre-line";
      show();
    };
    $("clear-cache").onclick = () => {
      cacheSlots.fill(null);
      hits = misses = 0;
      cacheLatest = -1;
      $("byte-view").replaceChildren();
      $("cache-result").textContent = "Cold cache. All valid bits cleared.";
      show();
    };
    show();
  } else {
    const p = document.createElement("p");
    p.textContent =
      type === "cpu" || type === "core"
        ? "Adjust core and ALU counts on the left, or start the instruction lifecycle walkthrough."
        : "Adjust the model on the left, or choose a walkthrough to see this component in context.";
    box.append(p);
  }
}
function transform() {
  $("world").style.transform = `translate(${panX}px,${panY}px) scale(${zoom})`;
  $("zoom-label").textContent = Math.round(zoom * 100) + "%";
}
function fit() {
  const r = $("viewport").getBoundingClientRect();
  const maxX = Math.max(scene.w, ...scene.nodes.map((n) => n.x + n.width + 40)),
    maxY = Math.max(
      scene.h,
      ...scene.nodes.map((n) => n.y + n.el.offsetHeight + 40),
    );
  zoom = Math.max(
    0.08,
    Math.min(1.25, Math.min((r.width - 40) / maxX, (r.height - 40) / maxY)),
  );
  panX = (r.width - maxX * zoom) / 2;
  panY = (r.height - maxY * zoom) / 2;
  transform();
}
function zoomAt(factor, x, y) {
  const r = $("viewport").getBoundingClientRect();
  x ??= r.width / 2;
  y ??= r.height / 2;
  const wx = (x - panX) / zoom,
    wy = (y - panY) / zoom;
  zoom = Math.max(0.08, Math.min(3, zoom * factor));
  panX = x - wx * zoom;
  panY = y - wy * zoom;
  transform();
}
function enableNodeDrag(el, n) {
  let drag;
  el.onpointerdown = (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    el.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, y: e.clientY, nx: n.x, ny: n.y, moved: false };
  };
  el.onpointermove = (e) => {
    if (!drag) return;
    const dx = (e.clientX - drag.x) / zoom,
      dy = (e.clientY - drag.y) / zoom;
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 4)
      drag.moved = true;
    n.x = drag.nx + dx;
    n.y = drag.ny + dy;
    el.style.left = n.x + "px";
    el.style.top = n.y + "px";
    drawWires();
  };
  el.onpointerup = () => {
    if (!drag) return;
    if (drag.moved) {
      positions.set(c.mode + ":" + sceneKey + ":" + n.id, { x: n.x, y: n.y });
      suppressClick = true;
      setTimeout(() => (suppressClick = false), 0);
    }
    drag = null;
  };
  el.onpointercancel = () => {
    drag = null;
  };
}
const pointers = new Map();
let panMoved = false;
function viewPoint(e) {
  const r = $("viewport").getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}
$("viewport").onpointerdown = (e) => {
  if (e.target.closest(".node") || e.button !== 0) return;
  $("viewport").setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, viewPoint(e));
  panMoved = false;
};
$("viewport").onpointermove = (e) => {
  if (!pointers.has(e.pointerId)) return;
  const before = [...pointers.values()];
  pointers.set(e.pointerId, viewPoint(e));
  const after = [...pointers.values()];
  if (after.length === 2) {
    const dist = (p) => Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
    const a = {
        x: (before[0].x + before[1].x) / 2,
        y: (before[0].y + before[1].y) / 2,
      },
      b = {
        x: (after[0].x + after[1].x) / 2,
        y: (after[0].y + after[1].y) / 2,
      };
    if (dist(before) > 0) zoomAt(dist(after) / dist(before), a.x, a.y);
    panX += b.x - a.x;
    panY += b.y - a.y;
  } else {
    panX += after[0].x - before[0].x;
    panY += after[0].y - before[0].y;
  }
  panMoved = true;
  transform();
};
for (const name of ["pointerup", "pointercancel"])
  $("viewport").addEventListener(name, (e) => pointers.delete(e.pointerId));
$("viewport").addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const p = viewPoint(e);
    zoomAt(Math.exp(-e.deltaY * 0.0015), p.x, p.y);
  },
  { passive: false },
);
$("viewport").onkeydown = (e) => {
  if (e.target !== $("viewport")) return;
  const delta = {
    ArrowLeft: [40, 0],
    ArrowRight: [-40, 0],
    ArrowUp: [0, 40],
    ArrowDown: [0, -40],
  }[e.key];
  if (delta) {
    e.preventDefault();
    panX += delta[0];
    panY += delta[1];
    transform();
  } else if (e.key === "+" || e.key === "=") zoomAt(1.25);
  else if (e.key === "-") zoomAt(0.8);
  else if (e.key.toLowerCase() === "f") fit();
};
function highlightTrace() {
  const trace = D.traces[activeFlow],
    current =
      traceIndex >= 0 && trace.scene === sceneKey
        ? trace.steps[traceIndex]?.[0]
        : null;
  document
    .querySelectorAll(".node")
    .forEach((el) => el.classList.toggle("traced", el.dataset.id === current));
  drawWires();
}
function updateTrace() {
  const trace = D.traces[activeFlow];
  $("timeline").max = trace.steps.length - 1;
  $("timeline").value = Math.max(0, traceIndex);
  $("prev").disabled = traceIndex <= 0;
  $("next").disabled = traceIndex >= trace.steps.length - 1;
  $("trace").replaceChildren();
  const strong = document.createElement("strong");
  strong.textContent =
    traceIndex < 0
      ? "Ready · " + trace.steps.length + " steps"
      : `${traceIndex + 1} / ${trace.steps.length} · ${trace.steps[traceIndex][1]}`;
  $("trace").append(
    strong,
    document.createTextNode(
      traceIndex < 0
        ? "Press Step or Play to open the relevant diagram and follow one process."
        : trace.steps[traceIndex][2],
    ),
  );
  highlightTrace();
}
function startTrace() {
  pause();
  const key = D.traces[activeFlow].scene;
  if (sceneKey !== key) {
    navigate(key);
  }
  traceIndex = 0;
  updateTrace();
  focusTrace();
}
function focusTrace() {
  const id = D.traces[activeFlow].steps[traceIndex]?.[0],
    n = scene.nodes.find((n) => n.id === id);
  if (n) inspect(n);
}
function step(delta) {
  pause();
  if (traceIndex < 0 || sceneKey !== D.traces[activeFlow].scene) {
    startTrace();
    return;
  }
  traceIndex = Math.max(
    0,
    Math.min(D.traces[activeFlow].steps.length - 1, traceIndex + delta),
  );
  updateTrace();
  focusTrace();
}
$("cpu").onclick = () => changeMode("cpu");
$("gpu").onclick = () => changeMode("gpu");
$("flow").onchange = () => {
  pause();
  activeFlow = $("flow").value;
  traceIndex = -1;
  updateTrace();
};
$("next").onclick = () => step(1);
$("prev").onclick = () => step(-1);
$("play").onclick = () => {
  if (timer) {
    pause();
    return;
  }
  if (
    traceIndex < 0 ||
    traceIndex === D.traces[activeFlow].steps.length - 1 ||
    sceneKey !== D.traces[activeFlow].scene
  )
    startTrace();
  $("play").textContent = "Pause";
  timer = setInterval(() => {
    traceIndex++;
    updateTrace();
    focusTrace();
    if (traceIndex === D.traces[activeFlow].steps.length - 1) pause();
  }, 1500);
};
$("reset").onclick = () => {
  pause();
  traceIndex = -1;
  updateTrace();
};
$("timeline").oninput = () => {
  pause();
  if (sceneKey !== D.traces[activeFlow].scene) {
    const key = D.traces[activeFlow].scene;
    navigate(key);
  }
  traceIndex = +$("timeline").value;
  updateTrace();
  focusTrace();
};
$("fit").onclick = fit;
$("focus-unit").onclick = () => {
  if (!selected) return;
  const n = scene.nodes.find((n) => n.id === selected.id);
  if (!n) return;
  const r = $("viewport").getBoundingClientRect();
  zoom = Math.max(
    0.2,
    Math.min(
      2,
      Math.min((r.width - 80) / n.width, (r.height - 80) / n.el.offsetHeight),
    ),
  );
  panX = r.width / 2 - (n.x + n.width / 2) * zoom;
  panY = r.height / 2 - (n.y + n.el.offsetHeight / 2) * zoom;
  transform();
};
$("zoom-in").onclick = () => zoomAt(1.25);
$("zoom-out").onclick = () => zoomAt(0.8);
$("layout").onclick = () => {
  for (const key of positions.keys())
    if (key.startsWith(c.mode + ":" + sceneKey + ":")) positions.delete(key);
  renderScene(true);
};
new ResizeObserver(() => {
  if (scene) transform();
}).observe($("viewport"));
changeMode("cpu");
