const http = require("node:http"),
  fs = require("node:fs"),
  path = require("node:path");
function normalizeBase(value = "/") {
  if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(value))
    throw Error("Base path must be / or a path such as /my-repository/.");
  return value;
}
function createStaticServer(root, basePath = "/") {
  basePath = normalizeBase(basePath);
  root = path.resolve(root);
  const types = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".json": "application/json",
    ".cu": "text/plain; charset=utf-8",
  };
  return http.createServer((req, res) => {
    if (!["GET", "HEAD"].includes(req.method)) {
      res.writeHead(405);
      res.end();
      return;
    }
    let pathname;
    try {
      pathname = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      );
    } catch {
      res.writeHead(400);
      res.end();
      return;
    }
    if (basePath !== "/" && pathname === basePath.slice(0, -1)) {
      res.writeHead(301, { Location: basePath });
      res.end();
      return;
    }
    if (!pathname.startsWith(basePath)) {
      res.writeHead(404);
      res.end("Outside configured site path");
      return;
    }
    const relative = pathname.slice(basePath.length) || "index.html",
      target = path.resolve(root, relative);
    if (!target.startsWith(root + path.sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    try {
      if (!fs.statSync(target).isFile()) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, {
        "Content-Type":
          types[path.extname(target)] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      if (req.method === "HEAD") res.end();
      else fs.createReadStream(target).pipe(res);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  });
}
module.exports = { createStaticServer, normalizeBase };
