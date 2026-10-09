"use strict";
const performanceSession = SessionState.createSessionState(StorageService);
window.PerformanceLab = {
  ...LabUI,
  modules: {},
  states: performanceSession.states,
  cleanup: null,
  getState(key, defaults) {
    return performanceSession.get(key, defaults);
  },
  save(key) {
    return performanceSession.save(key);
  },
  home() {
    const modules = PerformanceCatalog;
    return (
      this.heading(
        "Learn to explain kernel performance.",
        "Connect kernel structure to memory requests, resource limits, profiler signals, and the next experiment.",
      ) +
      '<div class="learning-chain"><span>Kernel behavior</span><b>→</b><span>Hardware behavior</span><b>→</b><span>Profiler signals</span><b>→</b><span>Diagnosis</span><b>→</b><span>Optimization choice</span></div><div class="module-cards">' +
      modules
        .map(
          ([key, name, desc, phase]) =>
            `<${!!this.modules[key] ? "a" : "article"} ${!!this.modules[key] ? `href="#${key}"` : ""} class="module-card ${!!this.modules[key] ? "available" : "planned"}"><small>PHASE ${phase}</small><h3>${name}</h3><p>${desc}</p><span class="card-status">${!!this.modules[key] ? "Open module" : "Planned · not implemented yet"}</span></${!!this.modules[key] ? "a" : "article"}>`,
        )
        .join("") +
      '</div><p class="small">All ten modules are available. Save a lab snapshot to the local notebook to compare configurations and explain your next experiment.</p>' +
      this.sources()
    );
  },
  route() {
    if (this.cleanup) {
      this.cleanup();
      this.cleanup = null;
    }
    const key = location.hash.slice(1) || "home",
      content = document.getElementById("module-content");
    document.querySelectorAll(".lab-nav nav a").forEach((a) => {
      const active = a.hash === "#" + key;
      a.classList.toggle("active", active);
      if (active) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    document.getElementById("module-back").hidden = key === "home";
    document.getElementById("module-label").textContent =
      key === "home"
        ? "TEN AVAILABLE MODULES · LOCAL EDUCATIONAL LABS"
        : key === "notebook"
          ? "LOCAL STORAGE · SOURCES LABELED PER RECORD"
          : "SYNTHETIC / EDUCATIONAL · NO GPU REQUIRED";
    if (key === "home") content.innerHTML = this.home();
    else if (this.modules[key]) {
      this.cleanup = this.modules[key].mount(content) || null;
      if (key !== "notebook" && key !== "blocking") {
        const toolbar = document.createElement("div");
        toolbar.className = "capture-toolbar";
        toolbar.innerHTML =
          '<button id="capture-experiment">Save experiment snapshot</button><a href="#notebook">Open notebook →</a><span id="capture-status" role="status">Configuration and educational values only.</span>';
        content.append(toolbar);
        toolbar.querySelector("button").onclick = () => {
          toolbar.querySelector("span").textContent =
            ExperimentNotebook.capture(key).message;
        };
      }
    } else
      content.innerHTML =
        this.heading(
          "Module not available",
          "Choose an available module from the sidebar.",
        ) + '<a href="#home">Return to Performance Lab</a>';
  },
  start() {
    window.addEventListener("hashchange", () => this.route());
    window.addEventListener("keydown", (e) => {
      if (
        e.altKey &&
        e.key === "ArrowLeft" &&
        location.hash &&
        location.hash !== "#home"
      ) {
        e.preventDefault();
        location.hash = "home";
      }
      if (
        e.key === "Escape" &&
        !["INPUT", "SELECT", "TEXTAREA"].includes(
          document.activeElement.tagName,
        )
      )
        location.hash = "home";
    });
    this.route();
  },
};
