"use strict";

const fs = require("node:fs");
const path = require("node:path");
const protobuf = require("protobufjs");
const protoLoader = require("@grpc/proto-loader");

function loadGrpcProtoWorkspace(directory, files) {
  const base = path.resolve(directory);
  const canonical = file => path.resolve(file).split(path.sep).join("/");
  const inside = file => {
    const relative = path.relative(base, file);
    return relative && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative);
  };
  const root = new protobuf.Root();
  root.resolvePath = (origin, target) => {
    const from = origin ? path.dirname(origin) : base;
    const candidates = path.isAbsolute(target) ? [path.resolve(target)] :
      target.startsWith(".") ? [path.resolve(from, target)] :
        [path.resolve(base, target), path.resolve(from, target)];
    const allowed = candidates.filter(inside);
    if (!allowed.length) throw new Error(`Proto import escapes its workspace: ${target}`);
    return canonical(allowed.find(file => fs.existsSync(file)) ?? allowed[0]);
  };
  // Imported and explicitly listed files must resolve to one identity on Windows.
  root.loadSync(files.map(file => path.resolve(base, file)), { keepCase: false }).resolveAll();
  return protoLoader.fromJSON(root.toJSON(), {
    longs: String, enums: String, defaults: true, oneofs: true,
  });
}

module.exports = { loadGrpcProtoWorkspace };
