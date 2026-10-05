const assert = require('node:assert/strict');
const test = require('node:test');

const {
  executionAllows,
  executionSummary,
  getNextScheduleAt,
  normalizeMockExecution,
} = require('../lib/mock-execution-engine.cjs');

test('legacy live-push migrates to standby/manual execution', () => {
  const execution = normalizeMockExecution(undefined, { streamMode: 'live-push' });
  assert.equal(execution.mode, 'standby');
  assert.equal(execution.manual, true);
  assert.equal(execution.incoming, false);
  assert.equal(execution.periodic.enabled, false);
});

test('legacy scheduled stream migrates to periodic execution without losing cadence', () => {
  const execution = normalizeMockExecution(undefined, {
    streamMode: 'scheduled',
    intervalMs: 250,
    loop: true,
    maxLoops: 4,
  });
  assert.equal(execution.mode, 'periodic');
  assert.equal(execution.periodic.enabled, true);
  assert.equal(execution.periodic.intervalMs, 250);
  assert.equal(execution.periodic.loop, true);
  assert.equal(execution.periodic.maxExecutions, 4);
});

test('hybrid defaults to standby plus periodic so REST does not immediately bypass deferred triggers', () => {
  const execution = normalizeMockExecution({ mode: 'hybrid' });
  assert.equal(execution.incoming, false);
  assert.equal(execution.manual, true);
  assert.equal(execution.periodic.enabled, true);
  assert.equal(execution.schedule.enabled, false);
});

test('hybrid execution can combine incoming manual periodic and scheduled triggers', () => {
  const execution = normalizeMockExecution({
    mode: 'hybrid',
    incoming: true,
    manual: true,
    periodic: { enabled: true, intervalMs: 100, loop: true, maxExecutions: 0 },
    schedule: { enabled: true, at: '2026-09-27T12:00:00.000Z', repeatMs: 60000 },
  });
  assert.equal(executionAllows(execution, 'incoming'), true);
  assert.equal(executionAllows(execution, 'manual'), true);
  assert.equal(executionAllows(execution, 'periodic'), true);
  assert.equal(executionAllows(execution, 'scheduled'), true);
  assert.deepEqual(executionSummary(execution), ['incoming', 'manual', 'periodic', 'scheduled']);
});

test('recurring schedule advances to the next future occurrence', () => {
  const now = Date.parse('2026-09-27T12:05:30.000Z');
  const next = getNextScheduleAt({
    enabled: true,
    at: '2026-09-27T12:00:00.000Z',
    repeatMs: 60000,
  }, now);
  assert.equal(next, Date.parse('2026-09-27T12:06:00.000Z'));
});
