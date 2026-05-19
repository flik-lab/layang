const http = require("node:http");
const { URL } = require("node:url");

const port = Number(process.env.LAYANG_GRPC_WEB_PROXY_PORT || 31081);

const blockedRequestHeaders = new Set(["connection", "content-length", "host", "transfer-encoding"]);
const blockedResponseHeaders = new Set(["connection", "content-length", "keep-alive", "transfer-encoding"]);

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", req.headers["access-control-request-headers"] || "*");
  res.setHeader("Access-Control-Max-Age", "600");
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const requestUrl = new URL(req.url || "/", `http://${req.headers.host || `127.0.0.1:${port}`}`);
  if (req.method !== "POST" || requestUrl.pathname !== "/grpc-web-proxy") {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  const target = requestUrl.searchParams.get("url")?.trim() || "";
  let targetUrl;
  try {
    targetUrl = new URL(target);
  } catch {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid upstream url" }));
    return;
  }

  if (targetUrl.protocol !== "http:" && targetUrl.protocol !== "https:") {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "Unsupported upstream protocol" }));
    return;
  }

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (!value || blockedRequestHeaders.has(key.toLowerCase())) continue;
    headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  }

  try {
    const body = await readRequestBody(req);
    const upstream = await fetch(targetUrl, {
      method: "POST",
      headers,
      body: body.length > 0 ? body : undefined,
    });

    const responseHeaders = {};
    upstream.headers.forEach((value, key) => {
      if (blockedResponseHeaders.has(key.toLowerCase())) return;
      responseHeaders[key] = value;
    });

    res.writeHead(upstream.status, responseHeaders);
    if (!upstream.body) {
      res.end();
      return;
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.end(buffer);
  } catch (error) {
    res.writeHead(502, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        error: "Failed to reach upstream gRPC-Web target",
        details: error instanceof Error ? error.message : String(error),
        target: targetUrl.toString(),
      }),
    );
  }
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`[layang] gRPC-Web dev proxy listening on http://127.0.0.1:${port}\n`);
});
