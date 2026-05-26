"use strict";

let electronApp = null;
try {
  const electron = require("electron");
  electronApp = electron && electron.app ? electron.app : null;
} catch {
  electronApp = null;
}
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { safeRelativePath } = require("./path-utils.cjs");

const bundledWellKnownProtos = {
  "google/protobuf/any.proto": `syntax = "proto3";
package google.protobuf;

message Any {
  string type_url = 1;
  bytes value = 2;
}
`,
  "google/protobuf/duration.proto": `syntax = "proto3";
package google.protobuf;

message Duration {
  int64 seconds = 1;
  int32 nanos = 2;
}
`,
  "google/protobuf/empty.proto": `syntax = "proto3";
package google.protobuf;

message Empty {}
`,
  "google/protobuf/field_mask.proto": `syntax = "proto3";
package google.protobuf;

message FieldMask {
  repeated string paths = 1;
}
`,
  "google/protobuf/struct.proto": `syntax = "proto3";
package google.protobuf;

message Struct {
  map<string, Value> fields = 1;
}

message Value {
  oneof kind {
    NullValue null_value = 1;
    double number_value = 2;
    string string_value = 3;
    bool bool_value = 4;
    Struct struct_value = 5;
    ListValue list_value = 6;
  }
}

enum NullValue {
  NULL_VALUE = 0;
}

message ListValue {
  repeated Value values = 1;
}
`,
  "google/protobuf/timestamp.proto": `syntax = "proto3";
package google.protobuf;

message Timestamp {
  int64 seconds = 1;
  int32 nanos = 2;
}
`,
  "google/protobuf/wrappers.proto": `syntax = "proto3";
package google.protobuf;

message DoubleValue { double value = 1; }
message FloatValue { float value = 1; }
message Int64Value { int64 value = 1; }
message UInt64Value { uint64 value = 1; }
message Int32Value { int32 value = 1; }
message UInt32Value { uint32 value = 1; }
message BoolValue { bool value = 1; }
message StringValue { string value = 1; }
message BytesValue { bytes value = 1; }
`,
};

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    throw error;
  }
}

async function writeTextInside(rootDir, relativePath, text) {
  const targetPath = path.resolve(rootDir, relativePath);
  const normalizedRoot = path.resolve(rootDir);
  if (targetPath !== normalizedRoot && !targetPath.startsWith(`${normalizedRoot}${path.sep}`)) {
    throw new Error(`Refusing to write outside workspace: ${relativePath}`);
  }
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, text, "utf8");
}

function getRuntimeTempPath() {
  if (electronApp && typeof electronApp.getPath === "function") {
    try {
      const electronTempPath = electronApp.getPath("temp");
      if (electronTempPath) return electronTempPath;
    } catch {
      // Plain Node tests do not have a ready Electron app. Fall through to os.tmpdir().
    }
  }
  return os.tmpdir();
}

async function writeProtoWorkspace(protoFiles, options = {}) {
  const id = crypto.randomBytes(8).toString("hex");
  const tempRoot = options.tempRoot || getRuntimeTempPath();
  const workspaceDir = path.join(tempRoot, `layang-${id}`);
  await fs.mkdir(workspaceDir, { recursive: true });

  for (const file of protoFiles) {
    const relativePath = safeRelativePath(file.name);
    const absolutePath = path.join(workspaceDir, relativePath);
    const normalizedAbsolute = path.normalize(absolutePath);

    if (!normalizedAbsolute.startsWith(path.normalize(workspaceDir))) {
      throw new Error(`Unsafe proto path: ${file.name}`);
    }

    await fs.mkdir(path.dirname(normalizedAbsolute), { recursive: true });
    await fs.writeFile(normalizedAbsolute, String(file.text || ""), "utf8");
  }

  for (const [fileName, text] of Object.entries(bundledWellKnownProtos)) {
    const targetPath = path.join(workspaceDir, fileName);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, text, "utf8");
  }

  return workspaceDir;
}

async function walkDirectory(directoryPath, visitor) {
  let entries;
  try {
    entries = await fs.readdir(directoryPath, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === "ENOENT") return;
    throw error;
  }

  for (const entry of entries) {
    const childPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) await walkDirectory(childPath, visitor);
    else if (entry.isFile()) await visitor(childPath);
  }
}

module.exports = { getRuntimeTempPath, readJsonIfExists, walkDirectory, writeProtoWorkspace, writeTextInside };
