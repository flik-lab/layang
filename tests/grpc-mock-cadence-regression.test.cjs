"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { calculateNextCadenceDeadline } = require("../electron/services/grpc-mock-server.cjs");

test("mock stream cadence compensates for a late tick instead of accumulating drift", () => {
  const firstDeadline = calculateNextCadenceDeadline(0, 1000, 100);
  assert.equal(firstDeadline, 1100);

  const secondDeadline = calculateNextCadenceDeadline(firstDeadline, 1000, 1125);
  assert.equal(secondDeadline, 2100);
  assert.equal(secondDeadline - 1125, 975);
});
