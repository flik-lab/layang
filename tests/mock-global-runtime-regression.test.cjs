const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');

const {
  getRestMockServerStatus,
  sendRestMockResponse,
  startRestMockServer,
  stopRestMockServer,
  updateRestMockServer,
} = require('../electron/services/rest-mock-server.cjs');
const { normalizeWebSocketMockConfig } = require('../electron/services/ws-mock-server.cjs');

async function reservePort() {
  const server = http.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function request(port, path = '/jobs/42') {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    req.on('error', reject);
  });
}

function scenario(mode, executionPatch = {}) {
  return {
    id: `rest-${mode}`,
    requestId: 'legacy-request-id',
    name: `REST ${mode}`,
    enabled: true,
    method: 'GET',
    path: '/jobs/:id',
    status: 200,
    headers: [{ key: 'content-type', value: 'application/json' }],
    body: JSON.stringify({ ok: true, id: '{{request.path.id}}' }),
    execution: {
      mode,
      incoming: mode === 'incoming',
      manual: mode === 'standby',
      periodic: { enabled: mode === 'periodic', intervalMs: 35, loop: true, maxExecutions: 0 },
      schedule: { enabled: false },
      timeoutMs: 1000,
      ...executionPatch,
    },
  };
}

test('REST standby keeps request pending until a global manual release', async (t) => {
  const port = await reservePort();
  await startRestMockServer({ port, bindHost: '127.0.0.1', scenarios: [scenario('standby')] });
  t.after(async () => { await stopRestMockServer(); });

  const responsePromise = request(port);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(getRestMockServerStatus().pendingCount, 1);

  const release = sendRestMockResponse({ scenarioId: 'rest-standby' });
  assert.equal(release.sent, 1);

  const response = await responsePromise;
  assert.equal(response.status, 200);
  assert.equal(response.headers['x-layang-rest-mock-trigger'], 'manual');
  assert.match(response.body, /"id":"42"/);
  assert.equal(getRestMockServerStatus().pendingCount, 0);
});

test('REST periodic execution releases pending requests without request-owned runtime state', async (t) => {
  const port = await reservePort();
  await startRestMockServer({ port, bindHost: '127.0.0.1', scenarios: [scenario('periodic')] });
  t.after(async () => { await stopRestMockServer(); });

  const response = await request(port);
  assert.equal(response.status, 200);
  assert.equal(response.headers['x-layang-rest-mock-trigger'], 'periodic');
});

test('REST hot update changes execution mode without restarting the endpoint', async (t) => {
  const port = await reservePort();
  await startRestMockServer({ port, bindHost: '127.0.0.1', scenarios: [scenario('incoming')] });
  t.after(async () => { await stopRestMockServer(); });
  const startedAt = getRestMockServerStatus().startedAt;

  await updateRestMockServer({ port, bindHost: '127.0.0.1', scenarios: [scenario('standby')] });
  assert.equal(getRestMockServerStatus().startedAt, startedAt);

  const responsePromise = request(port);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(getRestMockServerStatus().pendingCount, 1);
  sendRestMockResponse({ scenarioId: 'rest-standby' });
  const response = await responsePromise;
  assert.equal(response.headers['x-layang-rest-mock-trigger'], 'manual');
});

test('WebSocket config migrates requestId to provenance and normalizes hybrid triggers globally', () => {
  const config = normalizeWebSocketMockConfig({
    port: 8090,
    scenarios: [{
      id: 'ws-global',
      requestId: 'legacy-request-id',
      name: 'Hybrid WS',
      path: '/events',
      enabled: true,
      responseText: '[{"event":"tick"}]',
      execution: {
        mode: 'hybrid',
        incoming: true,
        manual: true,
        periodic: { enabled: true, intervalMs: 250, loop: true, maxExecutions: 0 },
        schedule: { enabled: true, at: '2099-01-01T00:00:00.000Z', repeatMs: 0 },
      },
    }],
  });
  const item = config.scenarios[0];
  assert.equal(item.sourceRequestId, 'legacy-request-id');
  assert.equal(Object.hasOwn(item, 'requestId'), false);
  assert.equal(item.execution.incoming, true);
  assert.equal(item.execution.manual, true);
  assert.equal(item.execution.periodic.enabled, true);
  assert.equal(item.execution.schedule.enabled, true);
  assert.equal(item.streamOnConnect, true);
  assert.equal(item.sendOnMessage, true);
});
