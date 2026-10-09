const { stage } = require("./stage-site.cjs"),
  { createStaticServer, normalizeBase } = require("./static-server.cjs");
const args = process.argv.slice(2);
function argument(name, fallback) {
  const i = args.indexOf(name);
  return i < 0 ? fallback : args[i + 1];
}
const port = Number(argument("--port", "8000")),
  base = normalizeBase(argument("--base-path", "/"));
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw Error("Choose a port from 1 to 65535.");
const server = createStaticServer(stage(), base);
server.listen(port, "127.0.0.1", () =>
  console.log("CUDA Learning Visualizer: http://127.0.0.1:" + port + base),
);
