/* Starts and cleans up an isolated site server and Chrome profile. */
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { spawn, spawnSync } = require("node:child_process");
const { stage } = require("./stage-site.cjs"),
  { root } = require("./site-files.cjs"),
  { createStaticServer, normalizeBase } = require("./static-server.cjs");
const args = process.argv.slice(2),
  baseIndex = args.indexOf("--base-path"),
  basePath = normalizeBase(baseIndex < 0 ? "/" : args[baseIndex + 1]);
function chromeBinary() {
  for (const executable of [
    process.env.CHROME_BIN,
    "google-chrome",
    "chromium",
    "chromium-browser",
  ].filter(Boolean)) {
    if (spawnSync(executable, ["--version"], { stdio: "ignore" }).status === 0)
      return executable;
  }
  throw Error(
    "Chrome/Chromium is required for browser checks. Install it or set CHROME_BIN.",
  );
}
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
(async () => {
  let server, chrome, profile, url, endpoint;
  let chromeLog = "";
  const artifacts = path.join(
    root,
    ".test-artifacts",
    basePath === "/" ? "root" : "subpath",
  );
  fs.mkdirSync(artifacts, { recursive: true });
  try {
    const executable = chromeBinary();
    server = createStaticServer(stage(), basePath);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    url = "http://127.0.0.1:" + server.address().port + basePath;
    profile = fs.mkdtempSync(path.join(os.tmpdir(), "cuda-visualizer-chrome-"));
    chrome = spawn(
      executable,
      [
        "--headless",
        "--no-sandbox",
        "--disable-gpu",
        "--disable-extensions",
        "--remote-debugging-port=0",
        "--remote-debugging-address=127.0.0.1",
        "--user-data-dir=" + profile,
        "about:blank",
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    chrome.stderr.on("data", (data) => {
      chromeLog = (chromeLog + data).slice(-12000);
    });
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      if (chrome.exitCode !== null)
        throw Error("Chrome exited during startup: " + chromeLog);
      try {
        const port = fs
          .readFileSync(path.join(profile, "DevToolsActivePort"), "utf8")
          .split("\n")[0];
        endpoint = "http://127.0.0.1:" + port;
        const response = await fetch(endpoint + "/json");
        if (response.ok) break;
      } catch {}
      await wait(100);
      endpoint = null;
    }
    if (!endpoint) throw Error("Chrome debugger did not start: " + chromeLog);
    console.log("Browser checks against " + url);
    for (const suite of [
      "platform-browser.cjs",
      "phase2-browser.cjs",
      "phase3-browser.cjs",
    ]) {
      const child = spawn(process.execPath, [path.join(root, "tests", suite)], {
        stdio: "inherit",
        env: {
          ...process.env,
          VISUALIZER_BASE_URL: url,
          VISUALIZER_CDP_URL: endpoint,
          VISUALIZER_TEST_ARTIFACTS: artifacts,
        },
      });
      const code = await new Promise((resolve, reject) => {
        child.on("error", reject);
        child.on("exit", resolve);
      });
      if (code !== 0) throw Error(suite + " failed (exit " + code + ").");
    }
    console.log("All browser suites passed for " + basePath);
  } catch (error) {
    if (endpoint && url && chrome?.exitCode === null) {
      let driver;
      try {
        driver = await require("../tests/browser-driver.cjs")({
          endpoint,
          base: url,
        });
        const shot = await driver.call("Page.captureScreenshot", {
          format: "png",
        });
        fs.writeFileSync(
          path.join(artifacts, "failure.png"),
          Buffer.from(shot.result.data, "base64"),
        );
        const html = await driver.run("document.documentElement.outerHTML");
        fs.writeFileSync(path.join(artifacts, "failure.html"), html);
      } catch (diagnosticError) {
        fs.writeFileSync(
          path.join(artifacts, "diagnostic-error.txt"),
          diagnosticError.message,
        );
      } finally {
        driver?.close();
      }
    }
    throw error;
  } finally {
    if (chrome) {
      chrome.kill("SIGTERM");
      await Promise.race([
        new Promise((resolve) => chrome.once("exit", resolve)),
        wait(1500),
      ]);
      if (chrome.exitCode === null) chrome.kill("SIGKILL");
    }
    if (server) await new Promise((resolve) => server.close(resolve));
    if (profile)
      fs.rmSync(profile, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 200,
      });
    fs.writeFileSync(path.join(artifacts, "chrome.log"), chromeLog);
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
