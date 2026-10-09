/* Package only public files. No bundling, rewriting, tests or CUDA binaries. */
const fs = require("node:fs"),
  path = require("node:path"),
  { root, publicFiles } = require("./site-files.cjs");
function stage() {
  const out = path.join(root, "dist/site");
  fs.rmSync(out, { recursive: true, force: true });
  for (const source of publicFiles()) {
    const target = path.join(out, path.relative(root, source));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
  return out;
}
if (require.main === module) console.log("Static site staged at " + stage());
module.exports = { stage };
