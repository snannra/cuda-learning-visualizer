"use strict";
// Interactive logical floorplans, deliberately distinct from physical die photos.
window.HardwareView = {
  presets: {
    cpu: [
      { name: "Balanced · 4-core CPU", values: { cores: 4, alus: 4, l1: 32 } },
      { name: "Compact · 2-core CPU", values: { cores: 2, alus: 2, l1: 32 } },
      { name: "Wide · 8-core CPU", values: { cores: 8, alus: 6, l1: 64 } },
    ],
    gpu: [
      {
        name: "Balanced · 8-SM GPU",
        values: {
          sms: 8,
          parts: 4,
          lanes: 16,
          threads: 256,
          l2: 40,
          shared: 64,
          tile: 16,
        },
      },
      {
        name: "Compact · 4-SM GPU",
        values: {
          sms: 4,
          parts: 2,
          lanes: 8,
          threads: 128,
          l2: 8,
          shared: 32,
          tile: 8,
        },
      },
      {
        name: "Wide · 16-SM GPU",
        values: {
          sms: 16,
          parts: 4,
          lanes: 32,
          threads: 512,
          l2: 48,
          shared: 96,
          tile: 32,
        },
      },
    ],
  },
  layout(scene, key) {
    const gap = 12,
      cell = 252;
    let cols = 4;
    if (key === "cache") {
      const pick = (id) => scene.nodes.find((n) => n.id === id);
      scene.nodes = [
        pick("address"),
        {
          id: "array",
          type: "cache",
          x: 340,
          y: 74,
          width: 690,
          hardwareHeight: 480,
          subtitle: "8 slots × 64-byte lines · direct-mapped experiment",
        },
        pick("hit"),
        pick("miss"),
      ];
      Object.assign(scene.nodes[0], { x: 48, y: 74, width: 252 });
      Object.assign(scene.nodes[2], { x: 48, y: 334, width: 252 });
      Object.assign(scene.nodes[3], {
        x: 340,
        y: 580,
        width: 690,
        hardwareHeight: 215,
      });
      scene.w = 1100;
      scene.h = 850;
      scene.caption =
        "Logical cache array · click a line, then read an address to see valid tags and conflict replacement.";
      return scene;
    }

    if (key === "cpu" || key === "gpu") {
      const units = scene.nodes.filter((n) => n.id.startsWith("unit"));
      cols = Math.min(4, units.length);
      const rows = Math.ceil(units.length / cols);
      for (let i = 0; i < units.length; i++)
        Object.assign(units[i], {
          x: 48 + (i % cols) * (cell + gap),
          y: 74 + Math.floor(i / cols) * 260,
          width: cell,
        });
      const base = 74 + rows * 260;
      const fabric = scene.nodes.find((n) => n.id === "fabric");
      Object.assign(fabric, {
        x: 48,
        y: base,
        width: cols * (cell + gap) - gap,
        hardwareHeight: 95,
      });
      const bottom = ["last", "controller", "dram"];
      bottom.forEach((id, i) =>
        Object.assign(
          scene.nodes.find((n) => n.id === id),
          { x: 48 + i * 352, y: base + 110, width: 340, hardwareHeight: 215 },
        ),
      );
      scene.w = Math.max(1140, cols * 264 + 96);
      scene.h = base + 365;
    } else {
      const nodes = scene.nodes;
      cols = Math.min(4, nodes.length);
      for (let i = 0; i < nodes.length; i++)
        Object.assign(nodes[i], {
          x: 48 + (i % cols) * 264,
          y: 74 + Math.floor(i / cols) * 260,
          width: 252,
        });
      scene.w = cols * 264 + 96;
      scene.h = Math.ceil(nodes.length / cols) * 260 + 124;
    }
    scene.caption += " · Logical layout, not to scale.";
    return scene;
  },
  illustration(n, c, inspect, navigate) {
    const box = document.createElement("div");
    box.className = "hardware-art art-" + n.type;
    box.setAttribute("aria-label", "Conceptual " + n.type + " structure");
    const hotspot = (label, type, target) => {
      const b = document.createElement("button");
      b.className = "hardware-hotspot";
      b.textContent = label;
      b.title = "Inspect " + label;
      b.setAttribute("aria-label", "Inspect " + label);
      b.onpointerdown = (e) => e.stopPropagation();
      b.onclick = (e) => {
        e.stopPropagation();
        inspect({ id: n.id, type, target });
      };
      b.ondblclick = (e) => {
        e.stopPropagation();
        if (target) navigate(target);
      };
      return b;
    };
    const add = (label, type, target) =>
      box.append(hotspot(label, type, target));
    if (["core", "sm", "partition", "cpu", "gpu"].includes(n.type)) {
      box.classList.add("unit-floorplan");
      const gpu = ["sm", "partition", "gpu"].includes(n.type);
      add(
        gpu ? "Warp scheduler" : "Fetch / decode",
        gpu ? "partition" : "decode",
        gpu ? "partition" : null,
      );
      add("Registers", "registers");
      add(gpu ? "FP / INT lanes" : "Integer ALUs", gpu ? "fp" : "alu", "alu");
      add(gpu ? "Tensor" : "Vector / FP", gpu ? "tensor" : "vector");
      add("Load / store", "lsu");
      if (n.type === "sm" && sceneKey === "gpu")
        add("Explore this SM", "sm", "sm");
      else if (n.type === "partition") add("Dispatch", "partition");
      else
        add(
          gpu ? "L1 / shared" : "L1 cache",
          gpu ? "shared" : "l1",
          gpu ? "shared" : "cache",
        );
    } else if (
      ["l1", "l1i", "l2", "l3", "cache", "constant"].includes(n.type)
    ) {
      box.classList.add("cache-array");
      if (n.id === "array") box.classList.add("large-cache");
      for (let i = 0; i < 8; i++) {
        const b = hotspot("", "cache", "cache");
        b.className += " visual-cache-line";
        b.dataset.slot = i;
        const index = document.createElement("span");
        index.textContent = String(i).padStart(2, "0");
        const tag = document.createElement("span");
        tag.className = "visual-tag";
        tag.textContent = "TAG";
        const bytes = document.createElement("span");
        bytes.className = "visual-data";
        for (let k = 0; k < 8; k++) bytes.append(document.createElement("i"));
        b.append(index, tag, bytes);
        b.title = `Inspect illustrative cache line ${i}`;
        b.setAttribute("aria-label", b.title);
        b.onclick = (e) => {
          e.stopPropagation();
          if (sceneKey !== "cache") navigate("cache");
          else inspect(n);
          const input = document.getElementById("address");
          if (input) {
            input.value = i * 64;
            const read = document.getElementById("read-cache");
            if (read) read.click();
          }
        };
        box.append(b);
      }
    } else if (n.type === "block") {
      box.classList.add("thread-array");
      for (let i = 0; i < Math.ceil(c.threads / 32); i++)
        add("W" + i, "warp", "warp");
    } else if (n.type === "warp") {
      box.classList.add("thread-array");
      const valid = c.threads % 32 || 32;
      for (let i = 0; i < 32; i++) {
        const b = hotspot(String(i), "warp", "warp");
        b.classList.toggle("inactive", i >= valid);
        b.title = `Final warp lane ${i} · ${i < valid ? "valid" : "outside block"}`;
        b.onclick = (e) => {
          e.stopPropagation();
          inspect({ id: n.id, type: "warp", target: "warp" });
          window.HardwareView.lane = i;
          const detail = document.createElement("div");
          detail.className = "result";
          detail.textContent = `Lane ${i} · thread ${Math.floor((c.threads - 1) / 32) * 32 + i} · ${i < valid ? "valid thread in final warp" : "outside block"}`;
          document.getElementById("experiment").prepend(detail);
        };
        box.append(b);
      }
    } else if (n.type === "shared") {
      box.classList.add("shared-array");
      for (let i = 0; i < 32; i++) {
        const b = hotspot(String(i), "shared", "shared");
        b.title = `Illustrative shared-memory bank ${i}`;
        b.onclick = (e) => {
          e.stopPropagation();
          inspect({ id: n.id, type: "shared", target: "shared" });
          const detail = document.createElement("div");
          detail.className = "result";
          detail.textContent = `Bank ${i}: 32-bit word indices ${i}, ${i + 32}, ${i + 64}, … map here in the standard 32-bank model.`;
          document.getElementById("experiment").prepend(detail);
        };
        box.append(b);
      }
    } else if (n.type === "registers") {
      box.classList.add("register-array");
      for (let i = 0; i < 16; i++) add("R" + i, "registers");
    } else if (["alu", "fp", "vector", "tensor"].includes(n.type)) {
      box.classList.add("execution-array");
      const count =
        n.type === "alu" ? c.alus : n.type === "fp" ? Math.min(c.lanes, 16) : 4;
      for (let i = 0; i < count; i++) {
        const b = hotspot(
          n.type === "alu"
            ? "ALU"
            : n.type === "tensor"
              ? "MMA"
              : n.type === "vector"
                ? "SIMD"
                : "FMA",
          n.type,
          n.type === "alu" || n.type === "fp" ? "alu" : null,
        );
        b.classList.add("execution-cell");
        box.append(b);
      }
    } else if (["dram", "global"].includes(n.type)) {
      box.classList.add("dram-array");
      for (let i = 0; i < 4; i++) {
        const b = hotspot("BANK " + i, n.type, "memory");
        b.classList.add("dram-bank");
        for (let j = 0; j < 6; j++) b.append(document.createElement("i"));
        box.append(b);
      }
    } else if (n.type === "fabric") {
      box.classList.add("fabric-array");
      for (let i = 0; i < 12; i++) add("◇", "fabric");
    } else {
      box.classList.add("queue-array");
      for (let i = 0; i < 8; i++)
        add(
          n.type === "barrier"
            ? "SYNC"
            : n.type === "controller"
              ? "CH " + i
              : "µ" + i,
          n.type,
        );
    }
    return box;
  },
};
