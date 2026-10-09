const assert = require("node:assert/strict");
(async () => {
  const c = await require("./browser-driver.cjs")();
  try {
    await c.open("performance.html");
    await c.run("sessionStorage.clear();location.reload()");
    await c.delay(300);
    assert.equal(
      await c.run('document.querySelectorAll(".module-card.available").length'),
      10,
    );
    await c.open("performance.html#scheduler");
    assert.ok(await c.run('document.querySelector("#sched-step")!==null'));
    await c.run('document.querySelector("#sched-step").click()');
    assert.equal(await c.run("PerformanceLab.states.scheduler.cycles"), 1);
    await c.run(
      'document.querySelector("#sched-preset").value="barrier";document.querySelector("#sched-preset").dispatchEvent(new Event("change"));for(let i=0;i<500;i++)document.querySelector("#sched-step").click()',
    );
    assert.ok(
      (
        await c.run('document.querySelector("#sched-explain").textContent')
      ).includes("All warps completed"),
    );
    await c.run(
      'document.querySelector("#sched-reset").click();document.querySelector("#sched-play").click()',
    );
    await c.delay(500);
    assert.ok(await c.run("PerformanceLab.states.scheduler.cycles>=2"));
    await c.open("performance.html#roofline");
    const before = await c.run(
      "Phase2Models.roofline(PerformanceLab.states.roofline).ceiling",
    );
    await c.run('document.querySelector("#roof-reuse").click()');
    assert.equal(
      await c.run(
        "Phase2Models.roofline(PerformanceLab.states.roofline).ceiling",
      ),
      before * 2,
    );
    await c.run(
      'document.querySelector("#roof-point").focus();document.querySelector("#roof-point").dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowUp",bubbles:true}))',
    );
    assert.ok(await c.run("PerformanceLab.states.roofline.attainment>.65"));
    await c.run(
      'document.querySelector("#roof-bytes").value="0";document.querySelector("#roof-bytes").dispatchEvent(new Event("change"))',
    );
    assert.ok(
      await c.run('Number(document.querySelector("#roof-bytes").value)>0'),
    );
    await c.open("performance.html#mapping");
    await c.run('document.querySelector("#map-run").click()');
    assert.equal(
      await c.run(
        "Phase2Models.mapping(PerformanceLab.states.mapping).sectors.length",
      ),
      4,
    );
    await c.run(
      'document.querySelector("#map-mode").value="transpose";document.querySelector("#map-mode").dispatchEvent(new Event("change"));document.querySelector("#map-run").click()',
    );
    assert.equal(
      await c.run(
        "Phase2Models.mapping(PerformanceLab.states.mapping).sectors.length",
      ),
      16,
    );
    await c.run(
      'document.querySelector("#map-thread").value="33";document.querySelector("#map-thread").dispatchEvent(new Event("change"))',
    );
    assert.equal(await c.run("PerformanceLab.states.mapping.warp"), 1);
    await c.run(
      'document.querySelector("#map-bx").value="1024";document.querySelector("#map-bx").dispatchEvent(new Event("change"))',
    );
    assert.equal(await c.run("PerformanceLab.states.mapping.bx"), 16);
    await c.open("performance.html#home");
    await c.open("performance.html#mapping");
    assert.equal(await c.run("PerformanceLab.states.mapping.selected"), 33);
    await c.call("Page.reload");
    await c.delay(300);
    assert.equal(await c.run("PerformanceLab.states.mapping.selected"), 33);
    for (const width of [390, 768, 1600]) {
      await c.call("Emulation.setDeviceMetricsOverride", {
        width,
        height: 950,
        deviceScaleFactor: 1,
        mobile: false,
      });
      for (const module of ["home", "scheduler", "roofline", "mapping"]) {
        await c.open("performance.html#" + module);
        assert.ok(
          await c.run("document.documentElement.scrollWidth<=innerWidth"),
          `${module} overflow at ${width}`,
        );
      }
    }
    assert.equal(c.responseErrors.length, 0, JSON.stringify(c.responseErrors));
    assert.equal(c.errors.length, 0, JSON.stringify(c.errors));
    console.log(
      "Phase 2 browser checks passed: controls, simulation, presets, keyboard, bounds, restoration, and responsive layouts.",
    );
  } finally {
    c.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
