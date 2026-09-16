const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = (path) => fs.readFileSync(path, 'utf8');

test('message reader pins the selected record and freezes the message id list while reading', () => {
  const workspace = read('app/playground/features/response-viewer/message-list/MessageReadingWorkspace.tsx');
  const detail = read('app/playground/features/response-viewer/message-list/MessageDetailPane.tsx');
  const list = read('app/playground/features/response-viewer/message-list/MessageList.tsx');

  assert.match(workspace, /selectedRecord/);
  assert.match(workspace, /useDocumentSession/);
  assert.match(workspace, /frozenMessageIds/);
  assert.match(workspace, /pendingCount/);
  assert.match(workspace, /Resume live/);
  assert.match(workspace, /store\.getSnapshot\(\)\.orderedMessageIds/);
  assert.match(detail, /memo\(/);
  assert.match(detail, /selectedRecord: ResponseMessageRecord \| undefined/);
  assert.match(detail, /document: CommittedDocument \| undefined/);
  assert.doesNotMatch(detail, /store: ResponseStore/);
  assert.match(list, /orderedIds: readonly string\[\]/);
  assert.doesNotMatch(list, /useResponseSelector/);
});

test('pinned message pending status subscribes only to the latest-message slice without polling the full reader', () => {
  const workspace = read('app/playground/features/response-viewer/message-list/MessageReadingWorkspace.tsx');
  assert.match(workspace, /const PinnedMessageStatus = memo/);
  assert.match(workspace, /useResponseSelector\(store, \(snapshot\) => snapshot\.latestMessageId\)/);
  assert.match(workspace, /baselineSequence/);
  assert.match(workspace, /pendingCount/);
  assert.doesNotMatch(workspace, /MESSAGE_PENDING_POLL_MS/);
  assert.doesNotMatch(workspace, /window\.setInterval/);
});

test('latest automatically hydrates the newest coalesced response and no longer requires an inspect button', () => {
  const latest = read('app/playground/features/response-viewer/latest/LatestResponseViewer.tsx');
  const follow = read('app/playground/features/response-viewer/latest/useLatestFollow.ts');

  assert.doesNotMatch(latest, /Inspect latest JSON/);
  assert.match(latest, /state\.targetMessageId/);
  assert.match(latest, /session\.committed/);
  assert.match(latest, /JsonDocumentViewer/);
  assert.match(latest, /priority=\{state\.mode === "follow" \? "background" : "interactive"\}/);
  assert.match(follow, /LATEST_FOLLOW_QUIET_MS/);
  assert.match(follow, /LATEST_FOLLOW_MAX_STALENESS_MS/);
  assert.match(follow, /quietTimerRef/);
  assert.match(follow, /maxStalenessTimerRef/);
});

test('response workbench delegates message streaming updates to isolated message reading workspace', () => {
  const panel = read('app/playground/features/response-viewer/response-workbench-panel.tsx');
  assert.match(panel, /MessageReadingWorkspace/);
  assert.doesNotMatch(panel, /<MessageList /);
  assert.doesNotMatch(panel, /<MessageDetailPane /);
});


test('interactive hydration drops queued work for stale documents and pinned docs defer release', () => {
  const service = read('app/playground/features/response-viewer/payload-document/payloadDocument.service.ts');
  const scheduler = read('app/playground/features/response-viewer/document-session/documentHydrationScheduler.ts');
  assert.match(scheduler, /strategy === "latest-wins"/);
  assert.match(scheduler, /task\.sessionId === request\.sessionId/);
  assert.match(service, /pinCounts/);
  assert.match(service, /deferredReleaseIds/);
  assert.match(service, /pin\(id: string\)/);
  assert.match(service, /unpin\(id: string\)/);
});
