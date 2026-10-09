/* Shared rendering helpers. Models and persistence live elsewhere. */
"use strict";
window.LabUI = {
  escape(value) {
    return String(value).replace(
      /[&<>"']/g,
      (ch) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[ch],
    );
  },
  metrics(items) {
    return (
      '<div class="metrics">' +
      items
        .map(
          ([value, label, note]) =>
            `<div class="metric"><strong>${this.escape(value)}</strong><span>${this.escape(label)}</span>${note ? `<small>${this.escape(note)}</small>` : ""}</div>`,
        )
        .join("") +
      "</div>"
    );
  },
  heading(
    title,
    description,
    badge = "CONCEPTUAL MODEL / EDUCATIONAL ESTIMATE",
  ) {
    return `<div class="module-heading"><div><div class="eyebrow">PERFORMANCE LAB</div><h1>${title}</h1><p class="lead">${description}</p></div><span class="model-badge">${badge}</span></div>`;
  },
  sources() {
    return '<div class="sources"><span>Reference definitions: </span><a href="https://docs.nvidia.com/nsight-compute/ProfilingGuide/" target="_blank" rel="noreferrer">Nsight Compute profiling guide</a><a href="https://docs.nvidia.com/cuda/ada-tuning-guide/" target="_blank" rel="noreferrer">NVIDIA Ada reference limits</a></div>';
  },
};
