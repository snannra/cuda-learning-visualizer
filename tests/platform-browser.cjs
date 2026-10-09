const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
(async () => {
  const c = await require("./browser-driver.cjs")();
  try {
    await c.open("index.html");
    await c.run("sessionStorage.clear()");
    assert.equal(await c.run('document.querySelectorAll(".card").length'), 4);
    const prefix = new URL(c.base).pathname;
    for (const page of [
      "index.html",
      "architecture.html",
      "matmul.html",
      "grid.html",
      "performance.html",
    ]) {
      await c.open(page);
      assert.equal(await c.run("location.pathname"), prefix + page);
      assert.equal(
        await c.run('document.querySelectorAll(".page-tabs a").length'),
        5,
      );
      const urls = await c.run(
        '[...document.querySelectorAll(".page-tabs a")].map(a=>a.pathname)',
      );
      assert.ok(
        urls.every((p) => p.startsWith(prefix)),
        page + " escapes repository path",
      );
      if (page === "architecture.html") {
        assert.equal(await c.run("sceneKey"), "cpu");
        await c.run(
          'navigate("core");document.getElementById("back-level").click()',
        );
        assert.equal(await c.run("sceneKey"), "cpu");
        await c.run('document.getElementById("gpu").click();navigate("sm")');
        assert.equal(await c.run("sceneKey"), "sm");
        assert.ok(await c.run('scene.nodes.some(n=>n.type==="shared")'));
        assert.ok(
          await c.run('!scene.nodes.some(n=>n.type==="l2"||n.type==="global")'),
        );
        await c.run('document.getElementById("back-level").click()');
        assert.equal(await c.run("sceneKey"), "gpu");
      }
      if (page === "matmul.html") {
        await c.run('document.getElementById("next").click()');
        assert.equal(
          await c.run('document.querySelectorAll("#C .cell").length'),
          36,
        );
        await c.run(
          'document.querySelector("[data-mode=cpu]").click();document.getElementById("pattern").value="ones";document.getElementById("pattern").dispatchEvent(new Event("change"));document.getElementById("timeline").value=document.getElementById("timeline").max;document.getElementById("timeline").dispatchEvent(new Event("input"))',
        );
        assert.equal(
          await c.run('document.getElementById("sum").textContent'),
          "6",
        );
        assert.ok(await c.run('!!document.getElementById("reg-outputs")'));
      }
      if (page === "grid.html") {
        assert.ok(await c.run("layers.every(l=>!l.repeat)"));
        await c.run('document.getElementById("add").click()');
        assert.equal(
          await c.run('document.querySelectorAll(".layer").length'),
          4,
        );
      }
      for (const width of [390, 768, 1600]) {
        await c.call("Emulation.setDeviceMetricsOverride", {
          width,
          height: 1000,
          deviceScaleFactor: 1,
          mobile: false,
        });
        await c.delay(50);
        assert.ok(
          await c.run("document.documentElement.scrollWidth<=innerWidth"),
          `${page} overflow at ${width}`,
        );
      }
    }
    await c.open("performance.html#memory");
    await c.call("Page.reload");
    await c.delay(200);
    await c.run('document.getElementById("mem-run").click()');
    assert.equal(await c.run('document.querySelectorAll(".sector").length'), 4);
    await c.run(
      'document.getElementById("mem-offset").value=4;document.getElementById("mem-offset").dispatchEvent(new Event("input"));document.getElementById("mem-run").click()',
    );
    assert.equal(await c.run('document.querySelectorAll(".sector").length'), 5);
    await c.run(
      'document.getElementById("mask-none").click();document.getElementById("mem-run").click()',
    );
    assert.equal(await c.run('document.querySelectorAll(".sector").length'), 0);
    await c.open("performance.html#occupancy");
    await c.run(
      'document.getElementById("occ-threads").value=64;document.getElementById("occ-threads").dispatchEvent(new Event("input"));document.getElementById("occ-registers").value=112;document.getElementById("occ-registers").dispatchEvent(new Event("input"));document.getElementById("occ-run").click()',
    );
    assert.match(
      await c.run('document.getElementById("occ-result").textContent'),
      /37.5%/,
    );
    await c.open("performance.html#diagnosis");
    await c.run('document.getElementById("quiz-submit").click()');
    assert.match(
      await c.run('document.getElementById("quiz-status").textContent'),
      /Choose/,
    );
    for (const difficulty of ["beginner", "intermediate", "advanced"]) {
      await c.run(
        `document.getElementById('quiz-difficulty').value='${difficulty}';document.getElementById('quiz-difficulty').dispatchEvent(new Event('change'))`,
      );
      for (let i = 0; i < 7; i++) {
        const id = await c.run(
          "DiagnosisData.scenarios[PerformanceLab.states.diagnosis.index].id",
        );
        await c.run(
          `document.querySelector('input[value="${id}"]').click();document.getElementById('quiz-submit').click()`,
        );
        assert.equal(
          await c.run('document.getElementById("quiz-feedback").hidden'),
          false,
        );
        assert.equal(
          await c.run('document.getElementById("quiz-submit").disabled'),
          true,
        );
        await c.run('document.getElementById("quiz-new").click()');
      }
    }
    const kernel = await fetch(new URL("kernels/tiled_matmul.cu", c.base));
    assert.equal(kernel.status, 200);
    assert.match(await kernel.text(), /__syncthreads/);
    if (process.env.VISUALIZER_TEST_ARTIFACTS) {
      const shot = await c.call("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(
        path.join(process.env.VISUALIZER_TEST_ARTIFACTS, "platform.png"),
        Buffer.from(shot.result.data, "base64"),
      );
    }
    assert.equal(c.responseErrors.length, 0, JSON.stringify(c.responseErrors));
    assert.equal(c.errors.length, 0, JSON.stringify(c.errors));
    console.log(
      "Platform passed: five-page links/assets, CPU/GPU drill-down, matrix results, bounded grid layers, Phase 1 labs, kernel download and responsive layouts.",
    );
  } finally {
    c.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
