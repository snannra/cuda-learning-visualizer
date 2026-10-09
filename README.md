# CUDA Learning Visualizer

A static educational platform for CPU/GPU architecture, CUDA matrix multiplication and performance reasoning. The interface is branded Core & Warp; the project folder is `cuda-learning-visualizer`. No GPU, backend, bundler or third-party runtime packages are required.

## Run

Open `index.html` for the landing page in your browser, or run from the visualizer project folder:

```sh
python3 -m http.server 8000
```

Then visit http://localhost:8000. From the parent `InferenceOptimization` folder, use `python3 -m http.server 8000 --directory cuda-learning-visualizer`. No npm install, build, CUDA toolkit, or GPU is needed.

## Explore

- Choose shared-memory tiling, naive CUDA, or sequential CPU.
- Change N, tile width, input pattern, and animation speed.
- Click any output cell to choose the thread (and its containing block).
- Step, play, go backward, or scrub through loads, barriers, multiply-accumulate operations, and output stores.
- Watch global tiles, shared-memory contents, register sum, and corresponding kernel operations.
- Use N=6, TILE=4 to see partial tiles; N=16, TILE=16 mirrors the original tile width.
- Identity inputs should reproduce A. All-ones inputs should produce N in every output cell.

The animation focuses on one selected block, or one output in CPU mode. Unselected blocks are not simulated on the timeline. Changing the selected thread preserves the current step; changing the algorithm, dimensions, or inputs resets execution. Colored operands reflect the most recently executed multiply. C is shown only after the output-store step; the inspector shows intermediate register sums.

Load statistics count valid requested global operands over the entire multiplication, excluding output stores and caching. Naive: 2N³. Tiled: 2N² ceil(N/TILE). Zero-padding slots do not read global memory. These counts are educational, not bandwidth or speed measurements. Small tiles here prioritize readability, not performance tuning. The browser computes with JavaScript numbers, using small exact integer inputs; it does not model float32 rounding, warps, memory transactions, caches, bank conflicts, occupancy, or actual CUDA execution.

`kernels/tiled_matmul.cu` provides a corrected float32 CUDA kernel and launch wrapper. It fixes the pasted apostrophe, supports partial tiles with guarded zero-padded loads, and keeps both barriers unconditional. It is a kernel example, not a standalone executable; device allocation, copies, synchronization, and error handling belong in the caller.

Reference: [NVIDIA CUDA Programming Guide](https://docs.nvidia.com/cuda/archive/13.0.3/cuda-c-programming-guide/index.html), shared-memory matrix multiplication and thread synchronization.

## Grid explorer

Open `grid.html` (or use the top navigation tabs) for an unbounded, pannable, zoomable coordinate plane. Add colored grid layers, set independent column/row dimensions and origins, hide or delete layers, and repeat layers as partitions. Click cells to mark them and inspect partition/local coordinates. A configurable finite page boundary lets you compare matrix dimensions with block and tile partitions. Dimensions support 1–1,000,000 cells per axis, including 4096 × 4096. Rendering visits only visible lines and aggregates fine lines when zoomed out, rather than allocating a matrix of cells. Layer edits and cell marks last for the current session only.

Drag to pan, scroll to zoom, or pinch on touch screens. Focus the graph and use arrow keys, +/−, or F to fit. Coordinates follow matrix convention: x is the column and y is the row, increasing downward. Repeated grids are clipped to the page when its boundary is enabled; disable it for infinite partitions.

## Project layout

```text
cuda-learning-visualizer/
├── index.html, architecture.html, matmul.html, grid.html, performance.html
├── assets/css/                # Shared theme and visualization styles
├── assets/js/core/            # Storage/session interfaces, shared UI, module catalog
├── assets/js/models/          # Pure Matrix Lab model
├── assets/js/performance/     # Pure models, controllers, notebook layers
├── assets/js/                 # Architecture, grid and Matrix Lab controllers
├── kernels/                   # Downloadable CUDA examples
├── scripts/                   # Preview, packaging and automated checks
├── tests/                     # Pure-model, storage and browser suites
├── docs/architecture.md       # Boundaries and future backend integration
├── package.json               # Optional dependency-free tooling commands
└── .nojekyll                  # Static-hosting marker
```

The GitHub Actions workflow lives inside this project at `.github/workflows/visualizer.yml`, matching the standalone visualizer repository.

## Silicon explorer

Open `architecture.html` from the landing page or the top navigation tabs. No extra dependencies.

- CPU package → core → ALU, cache lookup, or memory path.
- GPU device → SM → execution partition → warp/thread, ALU, cache, or shared tile.
- Click a component for scope, purpose, and details; use its Open button to drill down. Breadcrumbs return to parent views.
- Drag components to rearrange diagrams; wires follow them. Drag the background to pan, scroll/pinch to zoom, and use Fit or Reset layout.
- Change core/SM counts, ALU/lane counts, partitions, threads per block, cache labels, shared-memory allocation, and tile width.
- Seven step/play/scrub traces explain CPU instruction processing, CPU cold/hit loads, GPU global loads, shared staging, constant-cache broadcast, and warp scheduling.
- Inspector experiments cover unsigned 8-bit ALU operations, a direct-mapped cache with hits and conflict evictions, final-warp masks, distinct constant addresses, and tiled shared-memory storage.

The original diagrams are educational abstractions, informed by the [Intel optimization manual](https://cdrdv2-public.intel.com/821614/356477-Optimization-Reference-Manual-V2-050.pdf), [Intel chip/cache diagrams](https://www.intel.com/content/www/us/en/developer/articles/technical/xeon-processor-scalable-family-technical-overview.html), [NVIDIA A100 whitepaper](https://images.nvidia.com/aem-dam/en-zz/Solutions/data-center/nvidia-ampere-architecture-whitepaper.pdf) (especially pp. 20–22), and [CUDA Programming Guide](https://docs.nvidia.com/cuda/archive/13.0.3/cuda-c-programming-guide/index.html). Sources are also linked within the page.

The CPU is a generic out-of-order model with private L1/L2 and a logical shared L3, not a specific Intel SKU. GPU structure is Ampere-inspired; custom counts and L1/shared allocations are hypothetical teaching settings. Cache sliders change capacity labels, not the separate 512-byte toy cache experiment. No timing, occupancy, cache coherence, physical die area, or performance is simulated. The global-to-shared trace shows the conventional register-mediated path used by the supplied kernel, not asynchronous copy instructions. Diagrams, experiments, and layouts reset on reload.

Architecture files: `architecture.html`, `assets/css/architecture.css`, `assets/js/architecture-data.js` (schematics/content), and `assets/js/architecture.js` (interaction/experiments).

## Navigation

`index.html` is the DieScope landing page. `matmul.html` retains the original kernel walkthrough. Every page has top navigation tabs linking Overview, Architecture, Matrix lab, and Grid canvas. Shared navigation styles live in `assets/css/navigation.css`; `assets/css/theme.css` applies the black theme and page-specific layout refinements.

## Hardware exploration

The Silicon explorer opens in Hardware view: an original interactive logical floorplan with clickable internal unit patterns, cache lines, register rows, arithmetic symbols, DRAM banks, shared-memory banks, and final-warp lanes. Hardware view omits arrows; Data flow restores the original draggable graph. Focus magnifies the selected component; Fit restores the overall view. CPU/GPU preset configurations remain editable and are illustrative rather than real processor SKU specifications.

In the cache close-up, click a line to load its address in the independent 8-slot/64-byte teaching cache, see valid tags, and inspect 64 byte offsets. Cache values are not simulated. Shared-memory bank clicks explain word-index mapping; thread-lane clicks show logical thread IDs. These schematics convey organization, not physical transistor placement or literal images of software threads. Source implementation: `assets/js/architecture-hardware.js`. The project folder is now `cuda-learning-visualizer`; use the updated local server command above.

## Architecture boundaries and navigation

GPU overview shows SMs, the chip-wide interconnect/L2, memory controllers, and external device DRAM. The SM close-up contains only SM-local resources: execution partitions, constant cache, L1, shared memory, and block synchronization. Its L1/shared allocation labels divide a conceptual common capacity budget. The overview's miniature SM previews direct you into the SM without repeating L1/shared labels at chip level.

Partition and warp views mark SM-wide memory resources as external references; they do not allocate another cache per partition or warp. CPU core views similarly mark shared L3 and external DRAM. Memory walkthroughs intentionally cross these boundaries. CUDA blocks are labeled logical thread groups, distinct from SM hardware.

Use **Back**, **Chip overview**, breadcrumbs, or Alt+Left to return without resetting the model. Back restores the previous selection, pan/zoom, view mode, and trace position; configuration edits remain applied. No browser reload is needed.

## Performance Lab — all three phases

Open `performance.html` or the **Performance lab** top tab. The home lists all ten requested modules: all ten modules available. Nothing in Performance Lab collects real hardware profiler metrics. It uses original educational models and synthetic snapshots, labeled throughout.

### Available modules

- **Memory Coalescing:** 32 active/masked lanes, int8/fp16/bf16/fp32/fp64, contiguous/strided/broadcast/reverse/column/custom arithmetic mappings, byte alignment, linked lane/sector highlighting, 32-byte sectors, and 128-byte cache-line groups. Predict, then reveal sector counts, lane-demand bytes, distinct useful bytes, sector bytes and efficiency. Broadcast is deduplicated for byte efficiency. All-masked warps make zero modeled requests. Custom expressions are parsed with a small arithmetic grammar, never eval/Function.
- **Occupancy:** generic and RTX 4090/Ada-style editable reference presets; threads, baseline register estimates, static/dynamic shared memory and 1/2/4/8-output accumulator projections. Predict the binding resource, then reveal all five per-SM block limits, resident warps, occupancy estimates, shared-memory reservation and configuration errors. Side-by-side output-blocking comparisons discuss reuse versus residency without declaring a winner.
- **Diagnosis Trainer:** seven causal scenario families × beginner/intermediate/advanced difficulties. Synthetic Nsight-like metrics, first-attempt scoring, optional evidence notes, detailed feedback on correct and incorrect choices, competing signals, and an optimization/investigation follow-up. Scenarios cover access coalescing, global latency, bandwidth saturation, registers/residency, shared/MIO dependencies, barriers, and compute pipelines.

### State and implementation

Each module has its own controller and session state. Hash routes switch modules without reloading; Back to Performance Lab, browser Back, Esc, and Alt+Left return while keeping module inputs and quiz progress. `sessionStorage` also restores settings across a same-tab reload or navigation to another platform page. Storage failure falls back to in-memory state. The Experiment Notebook stores snapshots separately in localStorage and provides JSON backup/import.

```text
performance.html
assets/css/performance.css
assets/js/performance/
  lab.js                  # routing, module home, UI helpers, session state
  models.js               # pure arithmetic parser, sector and occupancy models
  memory.js
  occupancy.js
  diagnosis-data.js       # causal scenario definitions and seeded generation
  diagnosis.js
tests/performance-models.test.cjs
```

Shared navigation adds Performance Lab on every page. `assets/js/navigation.js` keeps the active tab visible on narrow screens. Existing architecture/matrix/grid controllers and kernels remain intact.

### Deliberate simplifications

Sector counts model one warp load and distinct touched sectors, not DRAM transactions, measured bandwidth, cache hits, actual instruction splitting, or memory-controller behavior. Unique-byte efficiency differs from per-lane requested bytes for broadcast. Cache-line grouping follows Nsight terminology; it is independent of the architecture explorer's 64-byte toy cache.

Occupancy uses scalar budgets and warp-rounded register storage. It omits allocation granularity, subpartition constraints, compiler register allocation/spills, actual carveout selection and achieved occupancy. The Ada-style reference includes 48 warps/SM, 64K 32-bit registers, 24 blocks/SM, 100 KiB shared/SM, 99 KiB shared/block and 1 KiB reserved/block; it assumes any needed dynamic-memory opt-in. Output-blocking estimates add accumulator count, not compiler-accurate temporaries or measured reuse.

Trainer values are deterministic synthetic examples for causal reasoning, not performance predictions. Metrics are signals, not universal proof. Long/Short Scoreboard, Not Selected, occupancy, cache hits, memory latency and bandwidth saturation are distinguished in feedback.

Reference sources: [NVIDIA Ada tuning guide](https://docs.nvidia.com/cuda/ada-tuning-guide/), [Nsight Compute profiling guide](https://docs.nvidia.com/nsight-compute/ProfilingGuide/).

### Validation

From the visualizer project folder:

```sh
node --test tests/*.test.cjs
```

Six Phase 1 model test groups cover dtype sector counts, alignment, sector-crossing lanes, stride/reverse/broadcast/masks, expression rejection, register/shared bounds, invalid launches, output estimates and seeded synthetic scenarios.

Headless Chrome browser checks were run after each feature: memory masks/alignment/focus/reveal/errors/state; occupancy predictions/bounds/invalid resources/editable presets/comparisons/state; all seven quiz cases at all three difficulties, empty/wrong/correct choices, scoring lock, follow-up choices and preserved feedback. Integration checks cover five-page navigation, existing tools, ten active module cards, 390/768/1600px layouts and reload restoration.

All three requested phases are implemented. Recommended next step: guided, equal-work experiments connecting an optimization to before/after evidence, with optional user-entered real profiler results.

### Phase 2 modules

- **Warp Scheduler:** step/play/pause/reset a deterministic issue simulation with five presets, 1–64 resident warps, 1/2/4 scheduler partitions, adjustable global-load latency, six visible warp states, ready/issued/active history, and no-eligible-cycle counts. Each partition issues at most one instruction per cycle. Four-warps-per-block barriers release only their own block, including partial final blocks. Register-pressure mode illustrates fewer resident warps rather than estimating register allocation. Simulator cycles are not GPU timing predictions.
- **Roofline Explorer:** editable FLOPs, global bytes, compute peak and memory bandwidth; logarithmic chart with an interactive, keyboard-accessible point; theoretical bound, arithmetic intensity and knee; vector-add/naive/tiled GEMM examples; halve-traffic and double-FLOP experiments. Vertical dragging controls an explicitly hypothetical attainment fraction. Logical example byte counts ignore cache reuse and transaction overhead. The chart does not estimate measured throughput or runtime.
- **Mapping Lab:** independently configure physical blocks, logical tiles, matrix dimensions, block indices and direct/flattened/transposed mappings. Click linked block/tile/matrix canvases or choose a thread ID. Select or animate warps, inspect x-fastest physical IDs and row-major FP32 store addresses, reveal sector efficiency, tile coverage gaps and boundary masks. One block is drawn; it is not repeated across the matrix. Matrix dimensions are up to 4096² without allocating a full matrix array.

Controllers: `assets/js/performance/{scheduler,roofline,mapping}.js`. Pure models: `assets/js/performance/phase2-models.js`. Styling remains in `assets/css/performance.css`. All module settings survive same-tab navigation/reload; leaving a module stops its animation.

The first ten model test groups include issue width, scoreboard waits, all presets at multiple residency levels, barrier completion, latency hiding, Roofline units/ceilings/reuse, x-fastest thread IDs, transposed locality, independent tile/block coverage, partial warps and matrix boundaries.

The automated browser runner starts an isolated local server and Chrome profile, runs the platform/Phase 2/Phase 3 suites, and closes both. Node 22+ and Chrome/Chromium are required only for development checks:

```sh
cd cuda-learning-visualizer
npm test
npm run test:browser
npm run test:pages
```

No `npm install` is needed for these checks; the optional Prettier development dependency is separate from the runtime and test harness. Set `CHROME_BIN` if Chrome is not on PATH. The `test:pages` command serves only `/cuda-learning-visualizer/` to catch repository-subpath asset/link mistakes. Test profiles contain synthetic test data and do not alter your normal browser's saved notebook. Logs and downloads go to ignored `.test-artifacts/`.

Browser validation covers all three Phase 2 modules, simulator completion/playback, presets, Roofline keyboard control and input validation, mapping locality and launch bounds, state restoration and layouts at 390/768/1600 pixels. Separate pointer checks confirmed chart dragging, canvas selection and animation cleanup. Phase 1 checks and existing architecture/matrix/grid interactions also passed.

### Phase 3 modules

- **Register Blocking:** 1/2/4 outputs per thread, actual integer-valued FP32 teaching operands and accumulator sums, A reuse, B/output column highlights, initialize/load/accumulate/store steps, playback and scrubbing, selectable physical thread and block shape, shared K depth, reference architecture and baseline register estimate. A comparison table shows accumulator/register/shared-memory cost, resident warps and estimated occupancy; no configuration is called best. The same controller is embedded below the existing Matrix Lab walkthrough, with separate settings and controls.
- **Software Pipeline:** sequential and double-buffered schedules on a shared timeline scale; separate issue/wait/compute segments; step/play/pause/scrub/reset; a horizontally scrollable timeline on phones; per-buffer empty/loading/ready/being-consumed states; tile count, toy durations and tile storage controls. One independent copy engine and one compute engine are assumed. Copy operations serialize, compute operations serialize, and a buffer cannot be reused until its consumer finishes. Startup/drain remain exposed; one tile gains no overlap. Toy ticks are not measured GPU cycles. The modern-hardware panel links NVIDIA’s asynchronous-copy documentation and explains completion, ownership, extra storage and hardware/API constraints.
- **Decision Tree:** evidence-driven branches for bandwidth/coalescing, eligible warps, occupancy/resources, long/short scoreboard, barriers and compute throughput. Missing evidence leads to measurement guidance. Every leaf gives a likely hypothesis, next controlled experiment and caveat. Back, change-an-earlier-answer, reset, evidence notes and related-lab links preserve the reasoning trail.
- **Experiment Notebook:** save snapshots from all nine other Performance Lab modules, or add manual experiments. Versioned localStorage records contain title, kernel, dimensions when known, registers, shared bytes, sectors/request, theoretical occupancy, hypothesis, notes, timestamp, source, configuration and module-specific details. Unknown metrics remain null. Select up to four records and choose a baseline; deltas show selected minus baseline, with occupancy expressed in percentage points. Edit, search, delete/undo, export/import JSON, and restore all nine module configurations. Export/import are bounded to 200 records and 1 MiB; existing IDs are skipped during merge. Restore validates module-specific configuration before applying it.

Metric sources are distinguished per record: educational estimate, synthetic exercise, or **user-entered real profiler values**. The platform never collects or verifies real profiler results. Mixed-source comparisons remain labeled and do not rank performance. Storage failure retains changes in the current tab with an explicit warning and JSON export available. Same-origin localStorage is required for persistence; changing localhost port or browser creates a separate notebook.

Implementation additions:

```text
assets/css/phase3.css                 responsive diagrams, notebook, scoped Matrix Lab embed
assets/js/performance/phase3-models.js pure blocking/pipeline models and decision graph
assets/js/performance/blocking.js     reusable controller for both pages
assets/js/performance/pipeline.js     timeline and buffer inspection
assets/js/performance/tree.js         branching investigation controller
assets/js/performance/notebook-records.js record schema / import validation
assets/js/performance/experiment-adapters.js pure capture / restore logic
assets/js/performance/notebook-store.js injected notebook repository
assets/js/performance/notebook-service.js application integration
assets/js/performance/notebook.js     CRUD, comparison and JSON UI
tests/phase3-models.test.cjs          five additional model/schema test groups
tests/phase3-browser.cjs             end-to-end Phase 3 and notebook checks
```

The existing `lab.js` router adds reusable snapshot controls, rather than coupling every old controller to notebook internals. `performance.html` loads the new modules; `matmul.html` embeds the reusable blocking controller and snapshot store without loading Performance Lab’s global styles. `index.html` describes the expanded tools. No runtime packages, backend or GPU requirement were added.

Validation:

```sh
node --test tests/*.test.cjs
# Automated, isolated browser checks:
node scripts/test-browser.cjs
node scripts/test-browser.cjs --base-path /cuda-learning-visualizer/
```

The original **15 model test groups** remain covered, with additional storage, repository and matrix-model checks. Phase 3 browser checks cover numerical accumulators, comparison, Matrix Lab integration, pipeline schedules/buffers, tree backtracking/unknown paths, all nine capture/restore adapters, manual and unknown metrics, comparison deltas, edits, deletion/undo, reload persistence, actual JSON downloads, valid/invalid imports, markup escaping, invalid-configuration rejection, storage failure, animation cleanup and 390/768/1600-pixel layouts. Earlier memory/occupancy/diagnosis checks and five-page architecture/matrix/grid regression checks were also run.

Known simplifications: register/shared counts are educational resource projections; blocking comparisons keep the physical block fixed while logical work changes, so they are not equal-work performance benchmarks. Pipeline overlap assumes independent engines and omits contention and occupancy changes. The decision tree is guidance, not a classifier. Notebook deltas compare recorded quantities and cannot establish causality or verify measurement provenance.

## GitHub Pages deployment

The static site is prepared for GitHub Pages; publishing does not require a frontend build system.

1. Push the `cuda-learning-visualizer` repository, including `.github/workflows/visualizer.yml`.
2. In GitHub **Settings → Pages**, select **GitHub Actions** as the source.
3. Push to the default branch or run **CUDA visualizer checks and Pages** from Actions.

The workflow runs model/storage/syntax/link checks and all browser suites at both the root and a repository prefix. It uploads only `dist/site/`, then deploys after checks pass. Pull requests and non-default branches run checks without publishing. The deployment URL appears in the `github-pages` environment.

Reference: [GitHub custom Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages). The workflow uses the [Ubuntu 24.04 runner's Chrome installation](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md).

The workflow runs from this project's repository root. If you later move the project into a larger repository, move the workflow to that repository's `.github/workflows/` and adjust its working directory and artifact paths.

To inspect the exact public artifact locally:

```sh
cd cuda-learning-visualizer
npm run stage
npm start
# Preview a GitHub Pages-style repository path:
npm start -- --port 8002 --base-path /my-repository/
```

The app is still usable through the Python server or by opening `index.html`; Node and Chrome are not required by visitors. Deployment changes the browser origin, so export/import JSON to transfer a local notebook to the hosted site.

## Maintainability and future state storage

Models, rendering, routing and storage now have explicit boundaries. The Matrix Lab numerical model and experiment capture/restore adapters can run under Node without a DOM. Session settings use `core/session-state.js`; only `core/storage.js` touches browser storage. Notebook records, repository and application integration are separate files. Existing storage keys and record schema are retained.

See [architecture and backend extension points](docs/architecture.md) for the storage contract and how to add asynchronous backend synchronization later. This refactor adds no backend or account system. All visualizations continue to run locally.

The hosting refactor is verified with **21 model/storage test groups**, static checks for all public files and relative references, and all three browser suites at both `/` and `/cuda-learning-visualizer/`. Run `npm test`, `npm run test:browser` and `npm run test:pages` from the project folder to repeat the same checks used by GitHub Actions.
