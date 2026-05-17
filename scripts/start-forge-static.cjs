const { spawnSync } = require("node:child_process");

const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const result = spawnSync(command, ["exec", "electron-forge", "start"], {
  stdio: "inherit",
  env: {
    ...process.env,
    ELECTRON_LOAD_STATIC: "1",
  },
});

process.exit(result.status === null ? 1 : result.status);
