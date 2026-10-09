/* Validate the public artifact, syntax and pure model/storage tests. */
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict"),
  { spawnSync } = require("node:child_process");
const { root, publicFiles } = require("./site-files.cjs"),
  { stage } = require("./stage-site.cjs");
const files = publicFiles(),
  published = new Set(
    files.map((f) => path.relative(root, f).split(path.sep).join("/")),
  );
let refs = 0;
for (const file of files) {
  if (file.endsWith(".js")) {
    const r = spawnSync(process.execPath, ["--check", file], {
      encoding: "utf8",
    });
    assert.equal(r.status, 0, r.stderr);
  }
  if (!file.endsWith(".html")) continue;
  const html = fs.readFileSync(file, "utf8"),
    name = path.basename(file);
  for (const match of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
    const ref = match[1];
    if (/^(?:https?:|data:|mailto:|#)/.test(ref)) continue;
    assert.ok(
      !ref.startsWith("/"),
      `${name}: use relative links for repository hosting: ${ref}`,
    );
    const url = new URL(ref, "https://test.invalid/repository/" + name),
      target = decodeURIComponent(url.pathname.replace("/repository/", ""));
    assert.ok(published.has(target), `${name}: missing public resource ${ref}`);
    refs++;
  }
  const nav = html.match(/<nav class="page-tabs"[\s\S]*?<\/nav>/)?.[0];
  assert.ok(nav, name + " needs main navigation");
  assert.deepEqual(
    [...nav.matchAll(/href="([^"]+)"/g)].map((m) => m[1]),
    [
      "index.html",
      "architecture.html",
      "matmul.html",
      "grid.html",
      "performance.html",
    ],
    name + " navigation differs",
  );
}
const artifact = stage();
for (const rel of published)
  assert.ok(fs.existsSync(path.join(artifact, rel)), "Missing staged " + rel);
for (const privatePath of [
  "tests",
  "scripts",
  "package.json",
  "README.md",
  ".git",
])
  assert.ok(
    !fs.existsSync(path.join(artifact, privatePath)),
    privatePath + " must not be published",
  );
const tests = fs
  .readdirSync(path.join(root, "tests"))
  .filter((f) => f.endsWith(".test.cjs"))
  .map((f) => path.join(root, "tests", f));
const result = spawnSync(process.execPath, ["--test", ...tests], {
  stdio: "inherit",
});
if (result.status !== 0) process.exit(result.status || 1);
console.log(
  `Static checks passed: ${published.size} public files, ${refs} relative references, consistent navigation, and public-only staging.`,
);
