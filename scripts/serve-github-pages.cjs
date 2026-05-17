const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const url = require("node:url");

const rootDir = path.resolve(__dirname, "..", "github-pages");
const port = Number(process.env.PORT || 4173);
const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
]);

function resolveSafePath(requestPath) {
  const decodedPath = decodeURIComponent(requestPath);
  const normalizedPath = path.normalize(decodedPath).replace(/^([.][.][/\\])+/, "");
  const filePath = path.join(rootDir, normalizedPath === "/" ? "index.html" : normalizedPath);
  return filePath.startsWith(rootDir) ? filePath : path.join(rootDir, "index.html");
}

const server = http.createServer((request, response) => {
  const { pathname } = url.parse(request.url || "/");
  let filePath = resolveSafePath(pathname || "/");

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "content-type": contentTypes.get(path.extname(filePath).toLowerCase()) || "application/octet-stream",
    });
    response.end(content);
  });
});

server.listen(port, () => {
  console.log(`Serving github-pages/ at http://localhost:${port}`);
});
