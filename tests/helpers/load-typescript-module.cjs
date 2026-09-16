"use strict";

const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");

function loadTypeScript() {
  try {
    return require("typescript");
  } catch {
    return require("/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript/lib/typescript.js");
  }
}

function loadTypeScriptModule(filePath, { prelude = "", stripImports = true } = {}) {
  const ts = loadTypeScript();
  const absolute = path.resolve(filePath);
  let source = fs.readFileSync(absolute, "utf8");
  if (stripImports) source = source.replace(/^import[\s\S]*?;\s*$/gm, "");
  source = `${prelude}\n${source}`;
  const output = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
    fileName: absolute,
  }).outputText;
  const mod = new Module(absolute, module);
  mod.filename = absolute;
  mod.paths = Module._nodeModulePaths(path.dirname(absolute));
  mod._compile(output, absolute);
  return mod.exports;
}

module.exports = { loadTypeScriptModule };
