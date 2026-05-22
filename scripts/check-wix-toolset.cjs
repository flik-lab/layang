const { spawnSync } = require("node:child_process");

const requiredBinaries = ["candle", "light"];
const missing = requiredBinaries.filter((binary) => {
  const result = spawnSync("where", [binary], {
    shell: true,
    stdio: "ignore",
  });
  return result.status !== 0;
});

if (missing.length > 0) {
  console.error(
    [
      "WiX Toolset v3 is required to build the Layang MSI installer.",
      `Missing binaries: ${missing.join(", ")}`,
      "Install it on Windows with: choco install wixtoolset --version=3.14.0",
    ].join("\n"),
  );
  process.exit(1);
}

console.log("WiX Toolset detected.");
