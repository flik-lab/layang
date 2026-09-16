const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('response viewer no longer uses TanStack virtualizer on React 19 hot paths', () => {
  const messageList = read('app/playground/features/response-viewer/message-list/MessageList.tsx');
  const jsonViewer = read('app/playground/features/response-viewer/json-document/JsonDocumentViewer.tsx');
  assert.doesNotMatch(messageList, /@tanstack\/react-virtual|useVirtualizer/);
  assert.doesNotMatch(jsonViewer, /@tanstack\/react-virtual|useVirtualizer/);
  assert.match(jsonViewer, /useFixedVirtualWindow/);
});

test('mocking fixed-row virtualization does not use TanStack flushSync path', () => {
  const sidebar = read('app/playground/features/mock-server/sidebar/MockingSidebar.tsx');
  const catalog = read('app/playground/features/mock-server/workspace/MockCatalogList.tsx');
  assert.doesNotMatch(sidebar, /@tanstack\/react-virtual|useVirtualizer/);
  assert.doesNotMatch(catalog, /@tanstack\/react-virtual|useVirtualizer|measureElement/);
  assert.match(sidebar, /useFixedVirtualWindow/);
  assert.match(catalog, /useFixedVirtualWindow/);
});

test('hidden response stream defers heavy payload registration while Mocking is active', () => {
  const live = read('app/playground/features/request-runner/use-live-session-events.ts');
  assert.match(live, /getWorkbenchSideSection/);
  assert.match(live, /deferredEventsRef/);
  assert.match(live, /sideSection !== "collections"/);
  assert.match(live, /flushDeferredEvents/);
  assert.match(live, /subscribeWorkbenchSideSection/);
});
