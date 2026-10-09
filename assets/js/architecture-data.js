"use strict";
// Original educational schematics; relationships are conceptual, not die layouts.
window.ArchitectureData = {
  info: {
    cpu: [
      "CPU package",
      "Chip-wide",
      "Several independent cores share an interconnect, last-level cache, and memory controllers. Each core runs instruction streams with private execution resources.",
      [
        "Cores are hardware engines; software threads are work scheduled onto them.",
        "L3 is drawn as one logical cache; physical implementations may distribute slices.",
      ],
      "The drawing omits coherence agents, IO, NUMA and prefetchers.",
    ],
    core: [
      "Out-of-order core",
      "Per core",
      "Instructions are fetched and decoded, renamed, scheduled when operands are ready, executed, and retired in program order.",
      [
        "Execution can happen out of order while architectural retirement stays ordered.",
        "Instruction fetch and data loads use distinct L1 caches in this model.",
      ],
      "Stage widths and execution ports depend on the processor. This trace follows one instruction, not a clock-accurate pipeline.",
    ],
    alu: [
      "Integer ALU",
      "Execution unit",
      "An arithmetic logic unit applies operations such as add, subtract and bitwise logic to register operands. Its result can feed dependent instructions.",
      [
        "The decoder selects the operation; operands come from the register file.",
        "Integer ALUs, floating-point units and vector units are different resources.",
      ],
      "The experiment uses unsigned 8-bit arithmetic to expose wraparound; real CPUs support other widths.",
    ],
    fetch: [
      "Fetch & branch prediction",
      "Core front end",
      "The instruction pointer identifies what to fetch. A predictor guesses control flow so the front end can continue before a branch is resolved.",
      ["A wrong prediction discards work from the wrong path."],
      "Prediction, translation, instruction caches and decoded-op caches are simplified here.",
    ],
    decode: [
      "Decode & rename",
      "Core front end",
      "Decode translates instructions into internal operations. Renaming maps architectural register names to physical registers.",
      ["Renaming removes false name dependencies, not true data dependencies."],
      "Instruction-to-operation mapping varies with instruction and microarchitecture.",
    ],
    schedule: [
      "Scheduler",
      "Core back end",
      "Ready operations wait for their inputs and a compatible execution resource. Independent work can execute while a load is waiting.",
      ["A scheduler can issue an operation once its dependencies are ready."],
      "The model omits issue ports, reservation stations and queue capacities.",
    ],
    rob: [
      "Reorder buffer / retirement",
      "Per core",
      "Tracks instructions in flight. Completed instructions commit architectural state in program order, preserving precise exceptions.",
      ["The execution order and retirement order need not match."],
      "This is a logical view; bookkeeping is distributed in actual designs.",
    ],
    registers: [
      "Register file",
      "Per core or SM partition",
      "Holds working operands and results close to execution units. CPU physical registers support renaming; GPU threads each have their own logical register state.",
      ["Registers are distinct from L1 and shared memory."],
      "GPU register demand can limit resident warps; this page does not compute occupancy.",
    ],
    lsu: [
      "Load / store units",
      "Execution resources",
      "Compute or receive addresses and move values between registers and the memory hierarchy.",
      ["Loads can wait for memory while other independent work proceeds."],
      "Translation, queues, ordering rules and memory coalescing are not rendered cycle by cycle.",
    ],
    cache: [
      "Cache organization",
      "Teaching model",
      "A cache keeps copies of recently used memory lines. Address bits select a set, tags identify the resident line, and an offset selects bytes within it.",
      [
        "Try repeated addresses for hits and conflicting addresses for eviction.",
        "The experiment is a small direct-mapped cache with 64-byte lines.",
      ],
      "This experiment is not the associativity or replacement policy of the drawn L1, L2 or L3.",
    ],
    l1i: [
      "L1 instruction cache",
      "Per CPU core",
      "Stores instruction bytes close to the fetch unit.",
      ["Code fetch differs from the data-load path."],
      "Modern cores may also have decoded-operation caches; they are omitted.",
    ],
    l1: [
      "L1 data cache",
      "Per CPU core / GPU SM",
      "A near-execution cache that can satisfy data loads without going to a lower level.",
      ["A hit can avoid a trip to L2 or device/system memory."],
      "GPU load policy may bypass L1. This diagram follows a conventional cached path.",
    ],
    l2: [
      "L2 cache",
      "CPU: private in this model; GPU: chip-wide",
      "An intermediate cache serving requests that cannot be satisfied closer to execution.",
      [
        "CPU organization varies: private L2 is a model choice.",
        "GPU L2 is shared across SMs.",
      ],
      "Inclusion, allocation, eviction and coherence policies vary by architecture.",
    ],
    l3: [
      "Last-level cache (L3)",
      "Shared CPU cache",
      "A last on-chip cache level before a request needs external memory.",
      [
        "Cores communicate with cache slices and memory controllers over an interconnect.",
      ],
      "A miss is not always satisfied from DRAM: another core may hold the line.",
    ],
    dram: [
      "System DRAM",
      "Off-chip",
      "Large-capacity memory connected through CPU memory controllers. A cold demand load can require an off-chip access.",
      ["Data returns in cache-line units rather than one scalar at a time."],
      "Latency is not measured or modeled. Virtual memory and address translation are omitted.",
    ],
    gpu: [
      "GPU device",
      "Chip-wide",
      "Many streaming multiprocessors execute thread blocks. They share an L2 cache and access device DRAM through memory controllers.",
      [
        "A CUDA block is assigned to one SM in the conventional model.",
        "An SM can host multiple blocks when resources permit.",
      ],
      "Clusters and distributed shared memory on newer GPUs are outside this Ampere-style view.",
    ],
    sm: [
      "Streaming multiprocessor",
      "Per SM",
      "An SM contains scheduling partitions, register files, execution resources, and local memory structures.",
      [
        "A CUDA core is an arithmetic execution lane, not a CPU-like core.",
        "Block-local shared memory is explicitly addressed by your kernel.",
      ],
      "Partitions are simplified. The default four is inspired by Ampere; custom counts are hypothetical.",
    ],
    partition: [
      "SM execution partition",
      "Within one SM",
      "A warp scheduler chooses a ready warp and dispatches an instruction to suitable execution resources. Register files hold the assigned threads’ operands.",
      ["Resident warps can alternate to hide dependency and memory stalls."],
      "Warp issue and execution throughput are different; 32 logical threads do not imply 32 physical units for every instruction type.",
    ],
    block: [
      "CUDA thread block",
      "Logical execution group",
      "A kernel launch groups threads into blocks. In this model a block is assigned to one SM, where its threads can cooperate through shared memory and block barriers.",
      [
        "Blocks are software execution groups; an SM is hardware.",
        "A block contributes ceil(threads / 32) warps.",
      ],
      "This is a membership diagram, not a physical area allocated on the die.",
    ],
    warp: [
      "Warp & thread state",
      "32 logical threads",
      "A warp groups 32 threads for instruction scheduling. Each thread has its own lane index, register values, and addresses.",
      [
        "A partial block produces an incomplete final warp.",
        "Divergent paths use different active masks; independent thread scheduling does not remove divergence costs.",
      ],
      "The lane display shows logical participation, not a cycle-accurate execution unit mapping.",
    ],
    vector: [
      "Floating-point / vector units",
      "CPU execution resources",
      "Separate arithmetic resources operate on floating-point values and SIMD vectors. Vector instructions apply an operation to several data elements.",
      [
        "Instruction support and execution width depend on the CPU.",
        "Integer ALUs and floating-point/vector resources are not interchangeable.",
      ],
      "This schematic omits port sharing and does not model vector throughput.",
    ],
    fp: [
      "FP / INT execution lanes",
      "SM execution resources",
      "Arithmetic instructions consume thread operands and produce per-thread results. Tensor units execute specialized matrix operations.",
      [
        "An ordinary scalar CUDA multiply does not automatically become a Tensor Core operation.",
      ],
      "The lane-count slider is a visual teaching setting, not an Ampere specification.",
    ],
    tensor: [
      "Tensor execution",
      "SM execution resources",
      "Specialized matrix multiply-accumulate instructions process matrix fragments cooperatively.",
      [
        "Tensor operations require supported instruction paths, layouts and data types.",
      ],
      "This page does not model Tensor Core throughput or fragment mapping.",
    ],
    shared: [
      "Shared memory",
      "Block-local address space on an SM",
      "Threads explicitly place reusable values into shared memory. Block barriers make cooperative producer/consumer phases safe.",
      [
        "In your tiled kernel, load → barrier → reuse → barrier.",
        "Two float tiles use 2 × TILE² × 4 bytes.",
      ],
      "Shared memory is not an automatic global-memory cache. Its storage shares a capacity budget with L1 in the Ampere-style model.",
    ],
    constant: [
      "Constant cache",
      "Read-only path on an SM",
      "Constant memory resides in device memory and is cached. A warp reading the same address benefits from broadcast; distinct addresses split the request.",
      ["Compare uniform and per-lane addresses in the warp experiment."],
      "Constant cache is a separate conceptual path, not a stage every global load passes through.",
    ],
    global: [
      "Device DRAM / global memory",
      "Device-wide address space",
      "Global-memory values physically reside in device memory and can be cached on chip. Normal cached loads consult L1 and L2 before a miss reaches DRAM.",
      ["Caching is automatic; shared-memory staging is explicit."],
      "Global is an address space. It is not an extra SRAM tier next to L2.",
    ],
    controller: [
      "Memory controller",
      "Chip edge",
      "Schedules requests to external memory and transfers returning data to the on-chip fabric.",
      ["Multiple channels can serve independent traffic."],
      "Controllers and fabric are drawn as logical blocks, not a physical floorplan.",
    ],
    fabric: [
      "On-chip interconnect",
      "Chip-wide",
      "Carries requests and data between cores or SMs, caches, and memory controllers.",
      [
        "Connections show possible communication, not a direct wire for every pair.",
      ],
      "Real fabrics have routing, arbitration, bandwidth and locality constraints.",
    ],
    barrier: [
      "Block barrier",
      "Synchronization",
      "__syncthreads() coordinates threads in a block before consuming shared data or reusing its storage.",
      ["Every participating thread must reach the matching barrier."],
      "A barrier does not synchronize different blocks or automatically copy data.",
    ],
  },
  node(id, type, x, y, subtitle, target, width = 190) {
    return { id, type, x, y, subtitle, target, width };
  },
  scene(name, c) {
    const n = (...args) => this.node(...args),
      nodes = [],
      edges = [];
    const connect = (a, b) => edges.push([a, b]);
    let title = "",
      caption = "",
      w = 1100,
      h = 780;
    if (name === "cpu" || name === "gpu") {
      const gpu = name === "gpu",
        count = gpu ? c.sms : c.cores,
        cols = Math.min(4, count),
        rows = Math.ceil(count / cols);
      w = Math.max(900, cols * 220 + 90);
      h = rows * 150 + 370;
      title = gpu ? "GPU device" : "CPU package";
      caption = gpu
        ? "SMs own local execution resources; L2 and device memory serve the chip."
        : "Private cores and caches connect to a logical shared last-level cache.";
      for (let i = 0; i < count; i++) {
        nodes.push(
          n(
            "unit" + i,
            gpu ? "sm" : "core",
            50 + (i % cols) * 220,
            50 + Math.floor(i / cols) * 150,
            (gpu ? "SM " : "Core ") + i,
            gpu ? "sm" : "core",
          ),
        );
        connect("unit" + i, "fabric");
      }
      nodes.push(
        n(
          "fabric",
          "fabric",
          50,
          rows * 150 + 60,
          "Requests & returning data",
          null,
          w - 100,
        ),
        n(
          "last",
          gpu ? "l2" : "l3",
          70,
          rows * 150 + 170,
          gpu ? `${c.l2} MiB logical shared cache` : "Logical shared cache",
          "cache",
          270,
        ),
        n("controller", "controller", 400, rows * 150 + 170, "Memory channels"),
        n(
          "dram",
          gpu ? "global" : "dram",
          680,
          rows * 150 + 170,
          "Off-chip storage",
          "memory",
          260,
        ),
      );
      connect("fabric", "last");
      connect("last", "controller");
      connect("controller", "dram");
    } else if (name === "core") {
      title = "Inside a CPU core";
      caption = "Control flow is above; operands and data flow are below.";
      nodes.push(
        n("fetch", "fetch", 50, 50, "Predict next instruction"),
        n("l1i", "l1i", 50, 230, "Instruction bytes", "cache"),
        n("decode", "decode", 300, 50, "Internal operations + rename"),
        n("schedule", "schedule", 550, 50, "Issue ready operations"),
        n("rob", "rob", 800, 50, "Retire in program order"),
        n("registers", "registers", 300, 230, "Physical operand storage"),
        n("alu", "alu", 550, 230, `${c.alus} modeled integer units`, "alu"),
        n("lsu", "lsu", 800, 230, "Address generation + loads"),
        n("vector", "vector", 1050, 230, "Floating-point and SIMD operands"),
        n("l1", "l1", 800, 430, `${c.l1} KiB data cache`, "cache"),
        n("l2", "l2", 540, 430, "Private cache in this model", "cache"),
        n("l3", "l3", 280, 430, "Request to shared LLC", "cache"),
        n("dram", "dram", 50, 430, "Cold load reaches DRAM", "memory"),
      );
      [
        ["l1i", "fetch"],
        ["fetch", "decode"],
        ["decode", "schedule"],
        ["schedule", "alu"],
        ["schedule", "lsu"],
        ["registers", "alu"],
        ["alu", "rob"],
        ["lsu", "l1"],
        ["l1", "l2"],
        ["l2", "l3"],
        ["l3", "dram"],
        ["lsu", "registers"],
        ["schedule", "vector"],
        ["registers", "vector"],
        ["vector", "rob"],
      ].forEach((e) => connect(...e));
      h = 640;
      w = 1280;
    } else if (name === "sm") {
      title = "Inside a streaming multiprocessor";
      caption =
        "SM-local resources only. L1 and shared memory share a physical capacity budget; GPU-wide L2 and device DRAM are outside this SM.";
      for (let i = 0; i < c.parts; i++) {
        nodes.push(
          n(
            "part" + i,
            "partition",
            50 + (i % 4) * 250,
            50 + Math.floor(i / 4) * 170,
            `Partition ${i} · scheduler + registers`,
            "partition",
            215,
          ),
        );
        connect("part" + i, "l1");
        connect("part" + i, "shared");
      }
      const y = 80 + Math.ceil(c.parts / 4) * 170;
      nodes.push(
        n("constant", "constant", 50, y, "Read-only broadcast path", "warp"),
        n(
          "l1",
          "l1",
          300,
          y,
          `${c.budget - c.shared} KiB conceptual allocation`,
          "cache",
          220,
        ),
        n(
          "shared",
          "shared",
          560,
          y,
          `${c.shared} KiB conceptual allocation`,
          "shared",
          220,
        ),
        n("barrier", "barrier", 820, y, "Block synchronization", "shared"),
      );
      connect("shared", "barrier");
      h = y + 180;
    } else if (name === "partition") {
      title = "Scheduler, registers & execution";
      caption =
        "A ready warp issues an instruction; its active threads consume their own register operands.";
      nodes.push(
        n(
          "warp",
          "warp",
          50,
          60,
          `${c.threads} threads/block · ${Math.ceil(c.threads / 32)} warps`,
          "warp",
          250,
        ),
        n(
          "schedule",
          "partition",
          390,
          60,
          "Choose a ready resident warp",
          null,
          250,
        ),
        n(
          "registers",
          "registers",
          730,
          60,
          "Per-thread logical values",
          null,
          250,
        ),
        n(
          "fp",
          "fp",
          390,
          280,
          `${c.lanes} illustrative arithmetic lanes`,
          "alu",
          250,
        ),
        n("tensor", "tensor", 50, 280, "Matrix instructions", null, 250),
        n("lsu", "lsu", 730, 280, "Memory instructions", null, 250),
        n("shared", "shared", 390, 500, "Block-local operands", "shared", 250),
        n("l1", "l1", 730, 500, "Cached loads", "cache", 250),
      );
      [
        ["warp", "schedule"],
        ["schedule", "registers"],
        ["registers", "fp"],
        ["schedule", "tensor"],
        ["schedule", "lsu"],
        ["lsu", "l1"],
        ["lsu", "shared"],
        ["fp", "registers"],
      ].forEach((e) => connect(...e));
    } else if (name === "alu") {
      title = "Inside an arithmetic operation";
      caption =
        "Read operands, select an operation, produce a result, and forward or write it back.";
      nodes.push(
        n("a", "registers", 70, 120, "Operand A"),
        n("b", "registers", 70, 350, "Operand B"),
        n("op", "decode", 380, 50, "Operation selector"),
        n("alu", "alu", 380, 260, "Unsigned 8-bit teaching ALU"),
        n("result", "registers", 740, 260, "Writeback / dependent operand"),
      );
      [
        ["a", "alu"],
        ["b", "alu"],
        ["op", "alu"],
        ["alu", "result"],
      ].forEach((e) => connect(...e));
      h = 600;
    } else if (name === "cache") {
      title = "Inside a cache lookup";
      caption =
        "Toy direct-mapped cache · 64-byte lines · independent of hardware capacity sliders.";
      nodes.push(
        n("address", "lsu", 50, 180, "Byte address"),
        n("tag", "cache", 350, 50, "Tag identifies the memory line"),
        n("set", "cache", 350, 220, "Index selects one cache slot"),
        n("offset", "cache", 350, 390, "Offset selects a byte"),
        n("compare", "cache", 650, 220, "Compare tag and valid bit"),
        n("hit", "registers", 900, 100, "Hit: deliver resident data"),
        n(
          "miss",
          c.mode === "gpu" ? "global" : "dram",
          900,
          370,
          "Miss: fetch line and replace",
        ),
      );
      [
        ["address", "tag"],
        ["address", "set"],
        ["address", "offset"],
        ["tag", "compare"],
        ["set", "compare"],
        ["compare", "hit"],
        ["compare", "miss"],
      ].forEach((e) => connect(...e));
      h = 600;
    } else if (name === "warp") {
      title = "Warp → threads → operands";
      caption =
        "The warp has 32 logical lanes. Active masks control which threads participate.";
      nodes.push(
        n("block", "block", 50, 60, `${c.threads} threads in one block`),
        n(
          "warp",
          "warp",
          370,
          60,
          `${Math.ceil(c.threads / 32)} warps · inspect final warp`,
        ),
        n("registers", "registers", 690, 60, "Distinct thread operands"),
        n("schedule", "partition", 370, 280, "Issue a ready warp"),
        n("fp", "fp", 690, 280, "Execute active lanes"),
        n("constant", "constant", 50, 280, "Uniform address: broadcast"),
        n("l1", "l1", 690, 500, "Global load requests", "cache"),
        n("shared", "shared", 370, 500, "Explicit cooperative reuse", "shared"),
      );
      [
        ["block", "warp"],
        ["warp", "registers"],
        ["warp", "schedule"],
        ["schedule", "fp"],
        ["constant", "registers"],
        ["fp", "l1"],
        ["fp", "shared"],
      ].forEach((e) => connect(...e));
    } else if (name === "shared") {
      title = "Global memory → shared tile → reuse";
      caption =
        "Conventional synchronous tiling path, like the kernel in your walkthrough.";
      nodes.push(
        n("global", "global", 60, 80, "Tile starts in device memory", "memory"),
        n("l2", "l2", 340, 80, "Cached demand load", "cache"),
        n("l1", "l1", 620, 80, "May satisfy or cache load", "cache"),
        n("registers", "registers", 900, 80, "Per-thread loaded value"),
        n("shared", "shared", 900, 320, "Explicit store into tile"),
        n("barrier", "barrier", 620, 320, "Wait for all tile writers"),
        n("fp", "fp", 340, 320, "Read tile and accumulate"),
        n("release", "barrier", 60, 320, "Wait before overwriting tile"),
      );
      [
        ["global", "l2"],
        ["l2", "l1"],
        ["l1", "registers"],
        ["registers", "shared"],
        ["shared", "barrier"],
        ["barrier", "fp"],
        ["fp", "release"],
        ["release", "global"],
      ].forEach((e) => connect(...e));
      h = 560;
    } else {
      title = "Demand load through memory";
      caption =
        "Requests travel toward lower levels on misses; data returns to the requesting execution context.";
      nodes.push(
        n("request", "lsu", 60, 100, "Issue a byte address"),
        n("l1", "l1", 340, 100, "First data-cache lookup", "cache"),
        n("l2", "l2", 620, 100, "Next cache lookup", "cache"),
        n(
          "dram",
          c.mode === "gpu" ? "global" : "dram",
          900,
          100,
          "Read external memory",
        ),
        n("fill", "cache", 620, 350, "Return a cache line", "cache"),
        n("registers", "registers", 340, 350, "Deliver requested operand"),
        n("alu", "alu", 60, 350, "Dependent arithmetic", "alu"),
      );
      [
        ["request", "l1"],
        ["l1", "l2"],
        ["l2", "dram"],
        ["dram", "fill"],
        ["fill", "registers"],
        ["registers", "alu"],
      ].forEach((e) => connect(...e));
      h = 580;
      caption += " CPU L3 and coherence routing are omitted in this close-up.";
    }
    for (const node of nodes) {
      if (node.id.startsWith("unit"))
        node.label = (name === "gpu" ? "SM " : "Core ") + node.id.slice(4);
      if (node.id.startsWith("part"))
        node.label = "Partition " + node.id.slice(4);
      if (name === "core" && ["l3", "dram"].includes(node.id))
        node.context =
          node.id === "l3" ? "OUTSIDE CORE · SHARED L3" : "OUTSIDE CHIP · DRAM";
      if (name === "partition" && ["shared", "l1"].includes(node.id))
        node.context = "SM RESOURCE · OUTSIDE PARTITION";
      if (name === "warp" && ["constant", "l1", "shared"].includes(node.id))
        node.context = "SM RESOURCE · NOT PER WARP";
      if (["shared", "memory"].includes(name))
        node.context = ["global", "dram"].includes(node.id)
          ? "OFF-CHIP STORAGE"
          : node.id === "l2"
            ? c.mode === "gpu"
              ? "GPU-WIDE CACHE"
              : "CPU CACHE"
            : "ON-CORE / ON-SM PATH";
    }
    return { title, caption, nodes, edges, w, h };
  },
  traces: {
    instruction: {
      name: "CPU · instruction lifecycle",
      scene: "core",
      steps: [
        [
          "fetch",
          "Fetch",
          "Predict the next instruction address and request instruction bytes.",
        ],
        [
          "decode",
          "Decode & rename",
          "Decode into internal operations and assign physical register names.",
        ],
        [
          "schedule",
          "Wait for operands",
          "Independent operations may issue first; true dependencies still constrain order.",
        ],
        ["registers", "Read operands", "Access the renamed source registers."],
        ["alu", "Execute", "Apply the selected arithmetic operation."],
        ["rob", "Retire", "Commit architectural state in program order."],
      ],
    },
    cold: {
      name: "CPU · cold data load",
      scene: "core",
      steps: [
        [
          "lsu",
          "Issue load",
          "A ready load computes its effective address. This simplified path assumes misses in every cache.",
        ],
        [
          "l1",
          "L1 miss",
          "The required cache line is not resident in the private L1 data cache.",
        ],
        ["l2", "L2 miss", "The line is also absent from private L2."],
        [
          "l3",
          "Last-level miss",
          "Assume no other core can supply the line; send a request to memory.",
        ],
        ["dram", "Fetch from DRAM", "The memory controller obtains the line."],
        [
          "l2",
          "Return / fill",
          "Data returns toward the core. Exact allocation policy depends on the CPU.",
        ],
        [
          "l1",
          "Deliver cached data",
          "The requested operand becomes available to the load.",
        ],
        [
          "registers",
          "Use the operand",
          "Write the value to its destination physical register.",
        ],
      ],
    },
    hit: {
      name: "CPU · L1 data hit",
      scene: "core",
      steps: [
        [
          "lsu",
          "Issue load",
          "Compute the address for a line that is already cached.",
        ],
        [
          "l1",
          "L1 hit",
          "Matching valid tag: the near-core cache serves the request.",
        ],
        [
          "registers",
          "Return operand",
          "No lower-level demand read is needed for this hit.",
        ],
      ],
    },
    tile: {
      name: "GPU · tiled global-to-shared load",
      scene: "shared",
      steps: [
        [
          "global",
          "Read global memory",
          "Assume a cold tile load; values must be obtained from device DRAM.",
        ],
        [
          "l2",
          "Return through L2",
          "The returning data passes the device-wide cache hierarchy.",
        ],
        [
          "l1",
          "On-SM cache path",
          "This trace uses conventional cached loads, not an asynchronous copy.",
        ],
        [
          "registers",
          "Thread register",
          "Each thread receives its loaded value.",
        ],
        [
          "shared",
          "Store shared tile",
          "Threads explicitly write their values to the shared array.",
        ],
        [
          "barrier",
          "First barrier",
          "All threads finish writing before other threads consume the tile.",
        ],
        [
          "fp",
          "Reuse & accumulate",
          "Read shared operands repeatedly to produce register partial sums.",
        ],
        [
          "release",
          "Second barrier",
          "All readers finish before shared storage is overwritten.",
        ],
      ],
    },
    global: {
      name: "GPU · global load misses",
      scene: "memory",
      steps: [
        [
          "request",
          "Issue memory instruction",
          "The warp issues a load. Compatible lane addresses can form coalesced memory transactions.",
        ],
        [
          "l1",
          "L1 miss",
          "With L1 caching enabled, check the local data cache.",
        ],
        ["l2", "L2 miss", "The device-wide L2 also misses in this example."],
        [
          "dram",
          "Device memory read",
          "Fetch the needed memory data from device DRAM.",
        ],
        [
          "fill",
          "Return data",
          "Caches may allocate the returning data according to the load policy.",
        ],
        [
          "registers",
          "Destination registers",
          "Each participating thread receives its requested value.",
        ],
      ],
    },
    constant: {
      name: "GPU · constant broadcast hit",
      scene: "warp",
      steps: [
        [
          "warp",
          "Uniform warp request",
          "All participating lanes request the same constant-memory address.",
        ],
        [
          "constant",
          "Constant cache hit",
          "The cached value can be broadcast to requesting lanes. This path is separate from normal global loads.",
        ],
        [
          "registers",
          "Per-thread operand",
          "Each active thread receives the value in its own operand state.",
        ],
      ],
    },
    issue: {
      name: "GPU · schedule a warp",
      scene: "partition",
      steps: [
        [
          "warp",
          "Resident work",
          "A block contributes warps to its assigned SM.",
        ],
        [
          "schedule",
          "Select a ready warp",
          "Choose a warp whose dependencies and target resources are ready.",
        ],
        [
          "registers",
          "Read thread operands",
          "Participating threads use their own logical register state.",
        ],
        [
          "fp",
          "Execute instruction",
          "Arithmetic resources process active lanes. A warp is not itself a physical core.",
        ],
        [
          "registers",
          "Write thread results",
          "Results become available to dependent instructions.",
        ],
      ],
    },
  },
};
