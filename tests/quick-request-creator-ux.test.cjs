"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("collection quick create keeps destination context and seeds unified gRPC method selection", () => {
  const actions = read("app/playground/features/collection/use-collection-actions.ts");
  const collectionSidebar = read("app/playground/features/collection/collection-sidebar.tsx");

  assert.match(collectionSidebar, /onAddCollectionRequest\(collection\.id, kind, parentId\)/);
  assert.match(actions, /setRequestTargetCollectionId\(collectionId \|\| NEW_SCHEMA_COLLECTION_TARGET\)/);
  assert.match(actions, /setRequestTargetFolderId\(parentId\)/);
  assert.match(actions, /setRequestLocationEditable\(kind === "grpc" \|\| !kind\)/);
  assert.doesNotMatch(actions, /SelectionModeDraft/);
  assert.match(actions, /setRequestGrpcMethodKeysDraft\(firstMethod \? \[methodKey\(firstMethod\)\] : \[\]\)/);
  assert.match(actions, /layang:last-request-schema-id/);
  assert.match(actions, /layang:last-request-service-name/);
});

test("gRPC quick creator supports search, multi-select, service/schema select-all, and advanced revision", () => {
  const dialogs = read("app/playground/features/shell/workbench-dialogs.tsx");

  assert.match(dialogs, /placeholder="Search methods or services"/);
  assert.match(dialogs, /Select visible \(\{visibleRequestMethods\.length\}\)/);
  assert.match(dialogs, /Select service/);
  assert.match(dialogs, /Select all \{selectedRequestMethods\.length\}/);
  assert.match(dialogs, /Skip existing requests/);
  assert.match(dialogs, /Already exists/);
  assert.match(dialogs, /Requests stay pinned to the selected proto revision/);
  assert.match(dialogs, /Hide options/);
  assert.match(dialogs, /Proto revision/);
  assert.match(dialogs, /Import Proto/);
});

test("bulk create skips an existing schema RPC by identity in one state update", () => {
  const actions = read("app/playground/features/collection/use-collection-actions.ts");

  assert.match(actions, /existingMethodNames = new Set/);
  assert.match(actions, /request\.grpc\?\.libraryId === compiled\.library\.id/);
  assert.match(actions, /methods\.filter\(\(method\) => !existingMethodNames\.has/);
  assert.match(actions, /workingCollection = \{ \.\.\.workingCollection, requests: \[\.\.\.workingCollection\.requests, request\] \}/);
  assert.match(actions, /setCollections\(\(current\) =>[\s\S]{0,260}workingCollection/);
  assert.doesNotMatch(actions, /methodsToCreate\.forEach\([\s\S]{0,250}setCollections/);
});

test("schema and service actions use the same multi-method creator", () => {
  const schema = read("app/playground/features/proto-registry/proto-schema-workspace.tsx");
  const sidebar = read("app/playground/features/shell/workbench-sidebar.tsx");

  assert.match(schema, /Create all \{methods\.length \|\| ""\} requests/);
  assert.match(schema, /Create all \{serviceMethods\.length\} requests/);
  assert.match(schema, /openGrpcMethodsRequestDialog\(serviceMethods, library\.id, version\.id\)/);
  assert.match(sidebar, /<SchemaSidebarTree/);
  assert.doesNotMatch(sidebar, /Create all \{methodCount\} requests/);
});

test("new menu and keyboard shortcuts expose quick create without adding another creator implementation", () => {
  const sidebar = read("app/playground/features/shell/workbench-sidebar.tsx");

  assert.match(sidebar, /Request from schema/);
  assert.match(sidebar, /Blank HTTP request/);
  assert.match(sidebar, /Blank WebSocket request/);
  assert.match(sidebar, /event\.key\.toLowerCase\(\)/);
  assert.match(sidebar, /key === "n"/);
  assert.match(sidebar, /key === "k"/);
  assert.match(sidebar, /Command palette/);
  assert.match(sidebar, /openAddCollectionRequestDialog\(destination\.collectionId, kind, destination\.folderId\)/);
});



test("quick creator can target a collection or auto-create a schema collection grouped by service", () => {
  const actions = read("app/playground/features/collection/use-collection-actions.ts");
  const dialogs = read("app/playground/features/shell/workbench-dialogs.tsx");
  const domain = read("app/playground/features/collection/quick-request-creator-domain.ts");
  const sidebar = read("app/playground/features/shell/workbench-sidebar.tsx");

  assert.match(dialogs, /New collection · \$\{newSchemaCollectionName\}/);
  assert.match(dialogs, /Selected methods are grouped into service folders automatically/);
  assert.match(actions, /uniqueSchemaCollectionName\(compiled\.library\.name, collections\)/);
  assert.match(actions, /serviceFolderIds = new Map/);
  assert.match(actions, /createFolderEntity\(workingCollection, parentId, serviceName, now\)/);
  assert.match(actions, /requestParentId = groupByService \? serviceFolderIds\.get\(method\.serviceName\)/);
  assert.match(domain, /NEW_SCHEMA_COLLECTION_TARGET/);
  assert.match(domain, /collection\.name\.trim\(\)\.toLowerCase\(\) === schemaName\.trim\(\)\.toLowerCase\(\)/);
  assert.match(sidebar, /openAddCollectionRequestDialog\("", kind, null\)/);
});

test("quick creator stores recent schemas and services", () => {
  const dialogs = read("app/playground/features/shell/workbench-dialogs.tsx");

  assert.match(dialogs, /layang:recent-request-schema-ids/);
  assert.match(dialogs, /layang:recent-request-services/);
  assert.match(dialogs, /orderedGlobalProtoSchemas/);
  assert.match(dialogs, /orderedRequestServices/);
});

test("proto upload from request flow creates a schema collection and opens the created request", () => {
  const actions = read("app/playground/features/collection/use-collection-actions.ts");
  const io = read("app/playground/features/workspace/use-workspace-io-actions.ts");

  assert.match(io, /addGrpcMethodsToCollection\(\s*pendingCollectionId \|\| NEW_SCHEMA_COLLECTION_TARGET,\s*\[method\]/);
  assert.match(actions, /selectCollectionRequest\(workingCollection, requests\[0\]\)/);
  assert.match(actions, /setSideSection\("collections"\)/);
  assert.match(actions, /requestIds: requests\.map\(\(request\) => request\.id\)/);
});
