"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("request rows keep the Bruno-style quiet surface while preserving context actions", () => {
  const sidebar = read("app/playground/features/collection/collection-sidebar.tsx");
  const workbenchSidebar = read("app/playground/features/shell/workbench-sidebar.tsx");

  assert.match(sidebar, /const requestKindLabel =/);
  assert.match(sidebar, /request\.method\?\.toUpperCase\(\) \|\| "HTTP"/);
  assert.match(sidebar, /request\.kind === "websocket"[\s\S]{0,140}\? "WS"[\s\S]{0,140}grpcMode === "Unary"[\s\S]{0,100}\? "RPCU"[\s\S]{0,80}: "RPCS"/);
  assert.match(sidebar, /width: 32,[\s\S]{0,220}color: requestKindColor\(requestKindLabel\)/);
  assert.match(sidebar, /normalized === "RPCU"[\s\S]{0,80}#7aa2f7/);
  assert.match(sidebar, /normalized === "RPCS"[\s\S]{0,80}#69b7ff/);
  assert.match(sidebar, /normalized === "WS"[\s\S]{0,80}#2ac3de/);
  assert.doesNotMatch(sidebar, /<Chip/);
  assert.doesNotMatch(sidebar, /secondary=\{request\.kind === "grpc"/);
  assert.match(sidebar, /mb: 0/);
  assert.match(sidebar, /<WorkbenchTree aria-label="Requests">/);
  assert.match(sidebar, /workbenchTreeGroupSx/);
  assert.match(sidebar, /className="tree-row-action"/);
  assert.match(sidebar, /title="Add inside folder"[\s\S]{0,520}ml: "auto"[\s\S]{0,180}opacity: 1/);
  assert.match(sidebar, /title="Add to collection"[\s\S]{0,520}ml: "auto"[\s\S]{0,180}opacity: 1/);
  assert.doesNotMatch(sidebar, /<Folder\s+aria-hidden="true"/);
  assert.match(sidebar, /my: "1px"/);
  assert.match(sidebar, /event\.key === "ContextMenu" \|\| \(event\.shiftKey && event\.key === "F10"\)/);
  assert.match(sidebar, /onContextMenu=/);
  assert.match(sidebar, /grpcStatusPresentation\?\.error/);
  assert.match(sidebar, /WarningIcon/);
  assert.match(sidebar, /folderHasWarning/);
  assert.match(sidebar, /collectionHasWarning/);
  assert.doesNotMatch(sidebar, /MoreHoriz/);
  assert.doesNotMatch(sidebar, /requestOpen/);
  assert.doesNotMatch(sidebar, /requestRunning/);

  assert.match(workbenchSidebar, /aria-label="New request or collection"/);
  assert.match(workbenchSidebar, />\s*\+\s*<\/Button>/);
  assert.match(workbenchSidebar, />\s*Import\s*<\/Button>/);
  assert.doesNotMatch(workbenchSidebar, /<Add\b/);
});

test("schema workspace can create every RPC method in one batch", () => {
  const schema = read("app/playground/features/proto-registry/proto-schema-workspace.tsx");
  const actions = read("app/playground/features/collection/use-collection-actions.ts");
  const dialogs = read("app/playground/features/shell/workbench-dialogs.tsx");
  const sidebar = read("app/playground/features/shell/workbench-sidebar.tsx");

  assert.match(schema, /loadProtoFiles\(version\.files\)/);
  assert.match(schema, /Create all \{methods\.length \|\| ""\} requests/);
  assert.match(schema, /openGrpcMethodsRequestDialog\(methods, library\.id, version\.id\)/);
  assert.match(schema, /Create all \{serviceMethods\.length\} requests/);
  assert.match(schema, /openGrpcMethodsRequestDialog\(serviceMethods, library\.id, version\.id\)/);
  assert.match(sidebar, /<SchemaSidebarTree/);
  assert.doesNotMatch(sidebar, /Create all \{methodCount\} requests/);
  assert.match(actions, /function openGrpcMethodsRequestDialog\([\s\S]{0,180}libraryId = activeProtoLibraryId,[\s\S]{0,120}versionId = activeProtoVersionId/);
  assert.match(actions, /findProtoVersion\(protoLibraries, libraryId, versionId\)/);
  assert.match(actions, /function addGrpcMethodsToCollection/);
  assert.match(actions, /workingCollection = \{ \.\.\.workingCollection, requests: \[\.\.\.workingCollection\.requests, request\] \}/);
  assert.doesNotMatch(actions, /for \([^)]*methods[^)]*\)[\s\S]{0,220}addCollectionRequest/);
  assert.match(dialogs, /Quick Create/);
  assert.match(dialogs, /Select all \{selectedRequestMethods\.length\}/);
  assert.match(dialogs, /Skip existing requests/);
});

test("compat tooltip supports delayed pointer hover without delaying keyboard focus", () => {
  const compat = read("components/shadcn/compat.tsx");

  assert.match(compat, /enterDelay = 0/);
  assert.match(compat, /show\(event\.currentTarget, true\)/);
  assert.match(compat, /setTimeout\(\(\) =>/);
  assert.match(compat, /onFocus:[\s\S]{0,180}show\(event\.currentTarget\)/);
});
