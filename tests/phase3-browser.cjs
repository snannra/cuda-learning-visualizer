const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
(async () => {
  const c = await require("./browser-driver.cjs")();
  try {
    await c.open("performance.html#home");
    await c.run(
      'sessionStorage.clear();localStorage.removeItem("diescope.notebook.v1");location.reload()',
    );
    await c.delay(250);
    assert.equal(
      await c.run('document.querySelectorAll(".module-card.available").length'),
      10,
    );
    await c.open("performance.html#blocking");
    await c.run(
      'document.querySelector("#reg-outputs").value="4";document.querySelector("#reg-outputs").dispatchEvent(new Event("change"));document.querySelector("#reg-compare").click();document.querySelector("#reg-timeline").value=document.querySelector("#reg-timeline").max;document.querySelector("#reg-timeline").dispatchEvent(new Event("input"))',
    );
    assert.deepEqual(
      await c.run("Phase3Models.blocking(PerformanceLab.states.blocking).acc"),
      [65, 50, 65, 60],
    );
    await c.run(
      'document.querySelector("#reg-bx").value=0;document.querySelector("#reg-bx").dispatchEvent(new Event("change"))',
    );
    assert.equal(await c.run("PerformanceLab.states.blocking.bx"), 8);
    assert.equal(await c.run("PerformanceLab.states.blocking.tx"), 0);
    await c.run('document.querySelector("#reg-save").click()');
    assert.equal(await c.run("ExperimentNotebook.load().length"), 1);
    await c.open("matmul.html");
    assert.equal(
      await c.run('Number(document.querySelector("#reg-outputs").value)'),
      4,
    );
    await c.run('document.querySelector("#next").click()');
    assert.equal(
      await c.run('document.querySelectorAll("#C .cell").length'),
      36,
    );
    await c.open("performance.html#pipeline");
    await c.run('document.querySelector("#pipe-run").click()');
    assert.deepEqual(
      await c.run(
        "(()=>{const r=Phase3Models.pipeline(PerformanceLab.states.pipeline);return [r.sequential.total,r.overlap.total,r.saved]})()",
      ),
      [155, 103, 52],
    );
    await c.run(
      'document.querySelector("#pipe-time").value=20;document.querySelector("#pipe-time").dispatchEvent(new Event("input"))',
    );
    assert.ok(
      (
        await c.run('document.querySelector("#pipe-buffers").textContent')
      ).includes("being consumed"),
    );
    await c.run('document.querySelector("#capture-experiment").click()');
    await c.open("performance.html#tree");
    await c.run(
      'document.querySelector("[data-answer=no]").click();document.querySelector("[data-answer=yes]").click();document.querySelector("[data-answer=no]").click();document.querySelector("[data-answer=short]").click()',
    );
    assert.equal(
      await c.run("Phase3Models.walkTree(PerformanceLab.states.tree.path).key"),
      "short",
    );
    await c.run('document.querySelector("#tree-back").click()');
    assert.equal(
      await c.run("Phase3Models.walkTree(PerformanceLab.states.tree.path).key"),
      "dependency",
    );
    await c.run(
      'document.querySelector("[data-trail]").click();document.querySelector("[data-answer=unknown]").click();document.querySelector("#tree-save").click()',
    );
    assert.equal(
      await c.run("Phase3Models.walkTree(PerformanceLab.states.tree.path).key"),
      "measure",
    );
    for (const module of [
      "memory",
      "occupancy",
      "scheduler",
      "diagnosis",
      "mapping",
      "roofline",
    ]) {
      await c.open("performance.html#" + module);
      await c.run('document.querySelector("#capture-experiment").click()');
      assert.ok(
        !(
          await c.run('document.querySelector("#capture-status").textContent')
        ).startsWith("Could not save"),
        module,
      );
    }
    assert.equal(await c.run("ExperimentNotebook.load().length"), 9);
    // Every captured module can be restored through its validated adapter.
    for (const module of [
      "blocking",
      "pipeline",
      "tree",
      "memory",
      "occupancy",
      "scheduler",
      "diagnosis",
      "mapping",
      "roofline",
    ]) {
      await c.open("performance.html#notebook");
      await c.run(
        `ExperimentNotebook.restore(ExperimentNotebook.load().find(r=>r.module==='${module}'))`,
      );
      await c.delay(120);
      assert.equal(await c.run("location.hash"), "#" + module);
    }
    await c.open("performance.html#mapping");
    await c.run(
      'document.querySelector("#map-mode").value="transpose";document.querySelector("#map-mode").dispatchEvent(new Event("change"));document.querySelector("#map-run").click();document.querySelector("#capture-experiment").click()',
    );
    await c.open("performance.html#notebook");
    assert.equal(
      await c.run('document.querySelectorAll(".notebook-record").length'),
      10,
    );
    await c.run(
      'document.querySelector("#note-title").value="<img src=x onerror=window.notebookXss=true>";document.querySelector("#note-kernel").value="Manual profile";document.querySelector("#note-source").value="user-profiler";document.querySelector("#note-sharedKB").value="2";document.querySelector("#note-occupancyPercent").value="50";document.querySelector("#note-form").requestSubmit()',
    );
    assert.equal(await c.run("ExperimentNotebook.load().length"), 11);
    assert.equal(
      await c.run('document.querySelectorAll(".notebook-record img").length'),
      0,
    );
    assert.equal(await c.run("window.notebookXss===true"), false);
    assert.equal(
      await c.run("ExperimentNotebook.load().at(-1).sectorsPerRequest"),
      null,
    );
    const ids = await c.run(
      'ExperimentNotebook.load().filter(r=>r.module==="mapping").map(r=>r.id)',
    );
    for (const id of ids)
      await c.run(`document.querySelector('[data-select="${id}"]').click()`);
    assert.ok(
      (
        await c.run('document.querySelector("#note-comparison").textContent')
      ).includes("Δ +12"),
    );
    await c.run(
      'document.querySelector("[data-edit]").click();document.querySelector("#note-notes").value="Verified manual evidence";document.querySelector("#note-form").requestSubmit()',
    );
    assert.equal(
      await c.run("ExperimentNotebook.load().at(-1).notes"),
      "Verified manual evidence",
    );
    await c.run('document.querySelector("[data-delete]").click()');
    assert.equal(await c.run("ExperimentNotebook.load().length"), 10);
    await c.run('document.querySelector("#note-undo").click()');
    assert.equal(await c.run("ExperimentNotebook.load().length"), 11);
    await c.call("Page.reload");
    await c.delay(250);
    assert.equal(await c.run("ExperimentNotebook.load().length"), 11);
    assert.equal(
      await c.run("PerformanceLab.states.notebook.selected.length"),
      2,
    );
    const downloads = path.join(
      process.env.VISUALIZER_TEST_ARTIFACTS || require("node:os").tmpdir(),
      "downloads",
    );
    fs.mkdirSync(downloads, { recursive: true });
    await c.call("Page.setDownloadBehavior", {
      behavior: "allow",
      downloadPath: downloads,
    });
    await c.run('document.querySelector("#note-export").click()');
    let files = [];
    for (let attempt = 0; attempt < 50; attempt++) {
      files = fs.readdirSync(downloads).filter((n) => n.endsWith(".json"));
      if (files.length) break;
      await c.delay(100);
    }
    assert.ok(files.length);
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(downloads, files.at(-1)), "utf8"))
        .experiments.length,
      11,
    );
    await c.run(
      '(()=>{const r=ExperimentNotebook.create({title:"Imported experiment"}),dt=new DataTransfer();dt.items.add(new File([JSON.stringify({version:1,experiments:[r]})],"test.json",{type:"application/json"}));const input=document.querySelector("#note-import");input.files=dt.files;input.dispatchEvent(new Event("change"));})()',
    );
    await c.delay(200);
    assert.equal(await c.run("ExperimentNotebook.load().length"), 12);
    await c.run(
      '(()=>{const dt=new DataTransfer();dt.items.add(new File(["{bad}"],"bad.json"));const input=document.querySelector("#note-import");input.files=dt.files;input.dispatchEvent(new Event("change"));})()',
    );
    await c.delay(150);
    assert.equal(await c.run("ExperimentNotebook.load().length"), 12);
    assert.ok(
      (
        await c.run('document.querySelector("#note-status").textContent')
      ).includes("Import rejected"),
    );
    await c.run(
      '(()=>{const r=ExperimentNotebook.load().find(r=>r.module==="mapping");const bad={...r,configuration:{...r.configuration,bx:1000000}};try{ExperimentNotebook.restore(bad)}catch(e){window.rejectedRestore=true}})()',
    );
    assert.equal(await c.run("window.rejectedRestore"), true);
    assert.equal(await c.run("location.hash"), "#notebook");
    await c.run(
      'document.querySelector("#note-search").value="Imported experiment";document.querySelector("#note-search").dispatchEvent(new Event("input"))',
    );
    assert.equal(
      await c.run('document.querySelectorAll(".notebook-record").length'),
      1,
    );
    await c.run(
      'document.querySelector("#note-search").value="";document.querySelector("#note-search").dispatchEvent(new Event("input"))',
    );
    for (const width of [390, 768, 1600]) {
      await c.call("Emulation.setDeviceMetricsOverride", {
        width,
        height: 1000,
        deviceScaleFactor: 1,
        mobile: false,
      });
      for (const module of [
        "home",
        "blocking",
        "pipeline",
        "tree",
        "notebook",
      ]) {
        await c.open("performance.html#" + module);
        assert.ok(
          await c.run("document.documentElement.scrollWidth<=innerWidth"),
          `${module} overflow at ${width}`,
        );
      }
      await c.open("matmul.html");
      assert.ok(
        await c.run("document.documentElement.scrollWidth<=innerWidth"),
        `Matrix Lab overflow at ${width}`,
      );
    }
    // Playing controllers must stop on route exit.
    await c.open("performance.html#pipeline");
    await c.run(
      'document.querySelector("#pipe-reset").click();document.querySelector("#pipe-play").click()',
    );
    await c.delay(250);
    await c.open("performance.html#home");
    const time = await c.run("PerformanceLab.states.pipeline.time");
    await c.delay(250);
    assert.equal(await c.run("PerformanceLab.states.pipeline.time"), time);
    await c.open("performance.html#notebook");
    await c.run(
      'window.originalStorageWrite=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new Error("test quota failure")};ExperimentNotebook.add(ExperimentNotebook.create({title:"Storage failure example"}));Storage.prototype.setItem=window.originalStorageWrite;PerformanceLab.route()',
    );
    assert.ok(
      (
        await c.run('document.querySelector("#note-status").textContent')
      ).includes("only in this tab"),
    );
    assert.equal(c.responseErrors.length, 0, JSON.stringify(c.responseErrors));
    assert.equal(c.errors.length, 0, JSON.stringify(c.errors));
    console.log(
      "Phase 3 browser checks passed: 10 modules, blocking + Matrix Lab, pipeline, tree, all snapshot/restore adapters, notebook CRUD/deltas/reload/export/import/XSS handling/storage fallback, timer cleanup, and 390/768/1600px layouts.",
    );
  } finally {
    c.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
