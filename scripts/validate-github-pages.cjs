const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const siteDir = path.join(rootDir, "github-pages");
const requiredFiles = [
  "index.html",
  ".nojekyll",
  "assets/styles.css",
  "assets/layang-logo.png",
  "assets/layang-app-screenshot.png",
];

const missing = requiredFiles.filter((file) => !fs.existsSync(path.join(siteDir, file)));
if (missing.length > 0) {
  console.error(`GitHub Pages site is incomplete. Missing:\n${missing.map((file) => `- ${file}`).join("\n")}`);
  process.exit(1);
}

console.log("GitHub Pages site is ready in github-pages/.");
