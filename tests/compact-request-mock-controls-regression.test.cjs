"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("WebSocket and REST request body controls stay compact and remove redundant helper badges", () => {
  const source = read("app/playground/features/shell/workbench-main-panel.tsx");
  assert.doesNotMatch(source, /Connect from the request header/);
  assert.doesNotMatch(source, /Configure body mode for this REST request/);
  assert.match(source, /aria-label": "REST body type"/);
  assert.match(source, /\n\s+Send\n/);
});

test("REST and WebSocket mock headers keep endpoint and runtime actions on one compact row", () => {
  const rest = read("app/playground/features/rest/rest-panels.tsx");
  const websocket = read("app/playground/features/websocket/websocket-panels.tsx");
  assert.match(rest, /status\.url \?\? `http:\/\/\$\{project\.bindHost\}:\$\{project\.port\}`/);
  assert.match(websocket, /status\.url \?\? "ws:\/\/127\.0\.0\.1"/);
  assert.match(rest, />Start<\/Button>/);
  assert.match(rest, />Stop<\/Button>/);
  assert.match(websocket, />Start<\/Button>/);
  assert.match(websocket, />Stop<\/Button>/);
  assert.match(rest, /overflowX: "auto"/);
  assert.match(websocket, /overflowX: "auto"/);
  assert.doesNotMatch(websocket, /Variables: count, incoming/);
  assert.doesNotMatch(rest, /Variables: now, uuid, and request/);
});

test("shared mock execution controls render as a single horizontally scrollable control row", () => {
  const source = read("app/playground/features/mock-server/workspace/MockExecutionControls.tsx");
  assert.match(source, /overflowX: inline \? "visible" : "auto"/);
  assert.match(source, /scrollbarWidth: "thin"/);
  assert.doesNotMatch(source, /helperText="0 = unlimited"/);
  assert.doesNotMatch(source, /Hybrid races the enabled triggers/);
  assert.match(source, /label=\{inline \? undefined : grpcStream \? "Interval" : "Interval \(ms\)"\}/);
  assert.match(source, /label=\{inline \? undefined : grpcStream \? "Max" : "Max executions"\}/);
  assert.match(source, /inline \? \([\s\S]*grpcStream \? "Interval" : "Interval \(ms\)"/);
});
