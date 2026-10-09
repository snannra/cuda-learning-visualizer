/* Matrix Lab controller: DOM, playback and interaction only. */
"use strict";
(function () {
  const { makeMatrices, makeSteps, dot } = MatmulModel;

  const $ = (id) => document.getElementById(id);
  let mode = "tiled",
    n = 6,
    t = 2,
    row = 0,
    col = 0,
    pos = 0,
    timer = null,
    steps = [],
    A = [],
    B = [];
  const lines = {
    tiled: [
      ["init", "int col = blockIdx.x * TILE + threadIdx.x;"],
      ["init", "int row = blockIdx.y * TILE + threadIdx.y;"],
      ["init", "float sum = 0.0f;"],
      ["loop", "for (int tile = 0; tile < (N+TILE-1)/TILE; ++tile) {"],
      ["load", "  As[ty][tx] = validA ? A[row*N + tile*TILE+tx] : 0;"],
      ["load", "  Bs[ty][tx] = validB ? B[(tile*TILE+ty)*N+col] : 0;"],
      ["ready", "  __syncthreads(); // all loads complete"],
      ["loop", "  for (int k = 0; k < TILE; ++k)"],
      ["mac", "    sum += As[ty][k] * Bs[k][tx];"],
      ["release", "  __syncthreads(); // all readers finished"],
      ["loop", "}"],
      ["store", "if (row < N && col < N) C[row*N+col] = sum;"],
    ],
    naive: [
      ["init", "int col = blockIdx.x * blockDim.x + threadIdx.x;"],
      ["init", "int row = blockIdx.y * blockDim.y + threadIdx.y;"],
      ["init", "if (row >= N || col >= N) return;"],
      ["init", "float sum = 0.0f;"],
      ["loop", "for (int k = 0; k < N; ++k)"],
      ["mac", "  sum += A[row*N+k] * B[k*N+col];"],
      ["store", "C[row*N+col] = sum;"],
    ],
    cpu: [
      ["init", "for (int row = 0; row < N; ++row)"],
      ["init", "  for (int col = 0; col < N; ++col) {"],
      ["init", "    float sum = 0;"],
      ["loop", "    for (int k = 0; k < N; ++k)"],
      ["mac", "      sum += A[row*N+k] * B[k*N+col];"],
      ["store", "    C[row*N+col] = sum;"],
      ["loop", "  }"],
    ],
  };
  function pause() {
    if (timer) clearInterval(timer);
    timer = null;
    $("play").textContent = "Play";
  }
  function setup() {
    pause();
    n = +$("size").value;
    t = +$("tile").value;
    ({ A, B } = makeMatrices(n, $("pattern").value));
    row = Math.min(row, n - 1);
    col = Math.min(col, n - 1);
    steps = makeSteps(n, t, mode);
    pos = 0;
    $("timeline").max = steps.length - 1;
    $("tile").disabled = mode === "cpu";
    render();
  }
  function grid(id, size, fn, clickable = false) {
    const el = $(id);
    el.style.gridTemplateColumns = `repeat(${size},minmax(0,1fr))`;
    el.replaceChildren();
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++) {
        const { value, cls = "", title = "" } = fn(r, c);
        const cell = document.createElement(clickable ? "button" : "div");
        cell.className = "cell " + cls;
        cell.textContent = value;
        cell.title = title || `${id}[${r}, ${c}] = ${value}`;
        if (clickable) {
          cell.setAttribute(
            "aria-label",
            `Follow output C row ${r}, column ${c}`,
          );
          cell.setAttribute("aria-pressed", r === row && c === col);
          cell.onclick = () => {
            pause();
            row = r;
            col = c;
            render();
          };
        }
        el.append(cell);
      }
  }
  function render() {
    const s = steps[pos],
      br = Math.floor(row / t),
      bc = Math.floor(col / t),
      ty = row % t,
      tx = col % t,
      base = s.tile * t;
    const loaded = mode === "tiled" && s.phase !== "init";
    const globalK = mode === "tiled" ? base + s.k : s.k;
    const operand = s.phase === "mac";
    grid("A", n, (r, c) => ({
      value: A[r][c],
      cls:
        (loaded && Math.floor(r / t) === br && c >= base && c < base + t
          ? "tile "
          : "") + (operand && r === row && c === globalK ? "a" : ""),
    }));
    grid("B", n, (r, c) => ({
      value: B[r][c],
      cls:
        (loaded && Math.floor(c / t) === bc && r >= base && r < base + t
          ? "tile "
          : "") + (operand && r === globalK && c === col ? "b" : ""),
    }));
    grid(
      "C",
      n,
      (r, c) => {
        const active =
          mode === "cpu"
            ? r === row && c === col
            : Math.floor(r / t) === br && Math.floor(c / t) === bc;
        return {
          value: s.phase === "store" && active ? dot(A, B, r, c, n) : "·",
          cls:
            (active ? "tile " : "") +
            (r === row && c === col ? "selected" : ""),
          title: `C[${r}, ${c}]; expected result ${dot(A, B, r, c, n)}`,
        };
      },
      true,
    );
    $("thread").textContent =
      mode === "cpu" ? `output (${row}, ${col})` : `thread (${tx}, ${ty})`;
    $("index").textContent =
      mode === "cpu"
        ? `row = ${row} · col = ${col} · C address = ${row} × ${n} + ${col} = ${row * n + col}`
        : `blockIdx = (${bc}, ${br}) · threadIdx = (${tx}, ${ty})\nrow = ${br} × ${t} + ${ty} = ${row} · col = ${bc} × ${t} + ${tx} = ${col}`;
    const descriptions = {
      init: [
        "Map the output",
        mode === "cpu"
          ? "The CPU computes one output at a time, walking down a row of A and a column of B."
          : "Each thread owns one output C[row, col]. Its accumulator lives in a register and starts at zero.",
      ],
      load: [
        "Load tile " + s.tile,
        `All ${t * t} threads cooperate. The selected thread loads A[${row}, ${base + tx}] into As[${ty}, ${tx}] and B[${base + ty}, ${col}] into Bs[${ty}, ${tx}]. Out-of-bounds entries become zero.`,
      ],
      ready: [
        "Barrier · loads ready",
        "__syncthreads() waits for every thread in this block. The complete As and Bs tiles are now safe to read.",
      ],
      mac: [
        `Multiply + accumulate · k = ${s.k}`,
        mode === "tiled"
          ? `Each thread reads its row of As and its column of Bs. The whole block performs this inner-loop step; the selected thread adds one product to its own sum.`
          : mode === "naive"
            ? "Every output thread loads two operands directly from global memory for each k. Neighboring threads repeat many of the same requested loads."
            : "Read one element from the selected row of A and column of B, multiply, then add to sum.",
      ],
      release: [
        "Barrier · readers finished",
        "All threads finish reading the current tiles before any thread overwrites shared memory with the next tiles. The register sum survives across tiles.",
      ],
      store: [
        "Store the output",
        mode === "cpu"
          ? "The selected output is complete. The CPU would continue to the next output cell."
          : "Each in-bounds thread writes its completed register sum to C. Other blocks independently compute the remaining output tiles.",
      ],
    };
    $("phase").textContent = descriptions[s.phase][0];
    $("explain").textContent = descriptions[s.phase][1];
    $("sum").textContent = dot(A, B, row, col, s.count);
    if (operand) {
      const av = globalK < n ? A[row][globalK] : 0,
        bv = globalK < n ? B[globalK][col] : 0,
        prev = dot(A, B, row, col, Math.min(n, globalK));
      $("equation").textContent =
        `${prev} + ${av} × ${bv} = ${dot(A, B, row, col, s.count)}${globalK >= n ? " (zero padding)" : ""}`;
    } else
      $("equation").textContent =
        s.phase === "store"
          ? `C[${row}, ${col}] = ${dot(A, B, row, col, n)}`
          : `${s.count} of ${n} valid products accumulated`;
    $("shared-meta").textContent =
      mode === "tiled"
        ? `${2 * t * t * 4} bytes / block · float32`
        : "Not used";
    $("shared-content").hidden = mode !== "tiled";
    if (mode === "tiled") {
      grid("As", t, (r, c) => {
        const rr = br * t + r,
          cc = base + c;
        return {
          value: loaded ? (rr < n && cc < n ? A[rr][cc] : 0) : "·",
          cls:
            (rr >= n || cc >= n ? "pad " : "") +
            (operand && r === ty && c === s.k ? "a " : "") +
            (s.phase === "load" && r === ty && c === tx ? "selected" : ""),
        };
      });
      grid("Bs", t, (r, c) => {
        const rr = base + r,
          cc = bc * t + c;
        return {
          value: loaded ? (rr < n && cc < n ? B[rr][cc] : 0) : "·",
          cls:
            (rr >= n || cc >= n ? "pad " : "") +
            (operand && r === s.k && c === tx ? "b " : "") +
            (s.phase === "load" && r === ty && c === tx ? "selected" : ""),
        };
      });
      $("shared-note").textContent =
        `Tile ${s.tile + 1} / ${Math.ceil(n / t)} covers input k = ${base}…${base + t - 1}. Each loaded element is reused by up to ${t} output threads. ${n % t ? "Edge tiles are zero-padded." : ""}`;
    }
    $("code").replaceChildren(
      ...lines[mode].map(([phase, text]) => {
        const el = document.createElement("span");
        el.className = "code-line" + (phase === s.phase ? " current" : "");
        el.textContent = text;
        return el;
      }),
    );
    $("timeline").value = pos;
    $("progress").textContent =
      `Step ${pos + 1} / ${steps.length} · ${s.phase === "store" ? "complete" : "selected " + (mode === "cpu" ? "output" : "block")}`;
    $("back").disabled = pos === 0;
    $("next").disabled = pos === steps.length - 1;
    const blocks = Math.ceil(n / t) ** 2,
      naive = 2 * n * n * n,
      tiled = 2 * n * n * Math.ceil(n / t);
    $("stats").innerHTML =
      `<div class="stat"><strong>${mode === "cpu" ? 1 : blocks}</strong><span>${mode === "cpu" ? "output computed at a time" : `blocks in grid · ${t} × ${t} threads each`}</span></div><div class="stat"><strong>${(mode === "tiled" ? tiled : naive).toLocaleString()}</strong><span>valid global operand loads · entire multiplication</span></div><div class="stat"><strong>${mode === "tiled" ? (naive / tiled).toFixed(1) + "×" : "1×"}</strong><span>fewer requested loads vs naive · not measured speedup</span></div>`;
    $("mode-note").textContent =
      mode === "tiled"
        ? "Tiling moves one chunk of A and B into fast, block-local shared memory. Threads reuse those values instead of requesting them from global memory for every product. The load count counts in-bounds operands for all blocks, excludes stores, and ignores caching; padding slots require no global loads."
        : mode === "naive"
          ? "Naive CUDA assigns one output to each thread. Threads run in parallel but independently request A and B operands from global memory. The tile-width control sets the launch block dimensions here; it does not enable shared-memory reuse."
          : "The sequential CPU reference performs the same arithmetic one output at a time. Click different C cells to inspect their dot products; the timeline shows only the selected output.";
  }
  $("next").onclick = () => {
    pause();
    pos = Math.min(pos + 1, steps.length - 1);
    render();
  };
  $("back").onclick = () => {
    pause();
    pos = Math.max(0, pos - 1);
    render();
  };
  $("reset").onclick = setup;
  $("timeline").oninput = () => {
    pause();
    pos = +$("timeline").value;
    render();
  };
  $("play").onclick = () => {
    if (timer) {
      pause();
      return;
    }
    if (pos === steps.length - 1) pos = 0;
    $("play").textContent = "Pause";
    render();
    timer = setInterval(() => {
      pos++;
      render();
      if (pos === steps.length - 1) pause();
    }, +$("speed").value);
  };
  for (const id of ["size", "tile", "pattern"]) $(id).onchange = setup;
  $("speed").onchange = pause;
  document.querySelectorAll("[data-mode]").forEach(
    (btn) =>
      (btn.onclick = () => {
        mode = btn.dataset.mode;
        document.querySelectorAll("[data-mode]").forEach((b) => {
          b.classList.toggle("active", b === btn);
          b.setAttribute("aria-pressed", b === btn);
        });
        setup();
      }),
  );
  setup();
})();
