const http = require("http");
const fs = require("fs");
const path = require("path");
const { handleVoteRequest } = require("./lib/votes");

const root = __dirname;
const port = Number(process.env.PORT) || 4173;
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function fileFrom(urlPath) {
  const requested = urlPath === "/" ? "index.html" : decodeURIComponent(urlPath.slice(1));
  const filePath = path.normalize(path.join(root, requested));
  const relative = path.relative(root, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  if (relative === "storage" || relative.startsWith(`storage${path.sep}`)) return null;
  return filePath;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  if (url.pathname === "/api/votes") {
    handleVoteRequest(req, res);
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.statusCode = 405;
    res.end();
    return;
  }

  const filePath = fileFrom(url.pathname);
  if (!filePath) {
    res.statusCode = 403;
    res.end();
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.statusCode = error.code === "ENOENT" ? 404 : 500;
      res.end(error.code === "ENOENT" ? "Não encontrado" : "Erro");
      return;
    }
    res.setHeader("Content-Type", types[path.extname(filePath)] || "application/octet-stream");
    res.end(req.method === "HEAD" ? undefined : data);
  });
});

server.listen(port, () => {
  console.log(`Sessão de Halloween em http://localhost:${port}`);
});
