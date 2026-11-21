#!/usr/bin/env node
"use strict";

/**
 * Adds a Content-Security-Policy <meta> tag to every HTML page of the static
 * export in `out/`. The packaged desktop app loads these pages from file://,
 * where there are no response headers, so the policy has to live in the page.
 *
 * Next.js writes inline bootstrap scripts into each page; each one is allowed
 * by its SHA-256 hash, so no other inline script can run.
 *
 * Notes on the policy:
 * - No 'unsafe-eval': protobufjs generates codecs with `new Function`, so
 *   everything that needs it runs in the file-based workers under
 *   out/workers/ (built by scripts/build-proto-catalog-worker.cjs). A worker
 *   loaded from its own file does not inherit this page policy; blob: workers
 *   do, and only run hand-written decoders. Inline scripts stay blocked.
 * - connect-src allows any http(s)/ws(s) endpoint because Layang is an API
 *   client: gRPC-Web and WebSocket requests go straight from the renderer to
 *   whatever server the user targets.
 */

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const CSP_META_MARKER = 'http-equiv="Content-Security-Policy"';

function hashInlineScripts(html) {
  const hashes = new Set();
  const pattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(pattern)) {
    const attributes = match[1] || "";
    const body = match[2] || "";
    if (/\bsrc\s*=/i.test(attributes) || !body) continue;
    const type = /\btype\s*=\s*["']?([^"'\s>]+)/i.exec(attributes)?.[1]?.toLowerCase();
    // Data blocks such as application/json or application/ld+json are not executed.
    if (type && type !== "text/javascript" && type !== "module" && type !== "application/javascript") continue;
    hashes.add(`'sha256-${crypto.createHash("sha256").update(body, "utf8").digest("base64")}'`);
  }
  return [...hashes];
}

function buildContentSecurityPolicy(scriptHashes = []) {
  return [
    "default-src 'self'",
    ["script-src 'self'", ...scriptHashes].join(" "),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' http: https: ws: wss: blob: data:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-src 'none'",
  ].join("; ");
}

function applyContentSecurityPolicy(html) {
  if (html.includes(CSP_META_MARKER)) {
    html = html.replace(/<meta[^>]*http-equiv="Content-Security-Policy"[^>]*>/i, "");
  }
  const policy = buildContentSecurityPolicy(hashInlineScripts(html));
  const meta = `<meta ${CSP_META_MARKER} content="${policy.replaceAll('"', "&quot;")}"/>`;
  // The policy must come before any script, so it goes right after <head>.
  if (!/<head(\s[^>]*)?>/i.test(html)) throw new Error("HTML page has no <head> element.");
  return html.replace(/<head(\s[^>]*)?>/i, (head) => `${head}${meta}`);
}

function applyToDirectory(directory) {
  const pages = [];
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "_next") visit(full);
      } else if (entry.isFile() && entry.name.endsWith(".html")) {
        fs.writeFileSync(full, applyContentSecurityPolicy(fs.readFileSync(full, "utf8")));
        pages.push(path.relative(directory, full));
      }
    }
  };
  visit(directory);
  return pages;
}

if (require.main === module) {
  const outDirectory = path.resolve(process.argv[2] || path.join(__dirname, "..", "out"));
  if (!fs.existsSync(outDirectory)) {
    console.error(`[csp] ${outDirectory} does not exist. Run next build first.`);
    process.exit(1);
  }
  const pages = applyToDirectory(outDirectory);
  if (!pages.length) {
    console.error(`[csp] no HTML pages found in ${outDirectory}.`);
    process.exit(1);
  }
  console.log(`[csp] Content-Security-Policy added to ${pages.length} page(s).`);
}

module.exports = { applyContentSecurityPolicy, applyToDirectory, buildContentSecurityPolicy, hashInlineScripts };
