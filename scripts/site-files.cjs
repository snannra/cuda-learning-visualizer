const fs = require("node:fs"),
  path = require("node:path");
const root = path.resolve(__dirname, "..");
function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const p = path.join(directory, entry.name);
    if (entry.isSymbolicLink())
      throw Error("Public assets must not be symbolic links: " + p);
    return entry.isDirectory() ? files(p) : entry.isFile() ? [p] : [];
  });
}
function publicFiles() {
  return [
    ...fs
      .readdirSync(root)
      .filter((f) => f.endsWith(".html") || f === ".nojekyll")
      .map((f) => path.join(root, f)),
    ...files(path.join(root, "assets")),
    ...files(path.join(root, "kernels")),
  ].sort();
}
module.exports = { root, publicFiles };
