const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('release metadata is consistently 1.1.4', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.version, '1.1.4');

  const readme = read('README.md');
  assert.match(readme, /version-1\.1\.4-blue/);
  assert.match(readme, /## Release 1\.1\.4/);

  const landing = read('github-pages/index.html');
  assert.match(landing, /"softwareVersion": "1\.1\.4"/);
  assert.match(landing, /Layang v1\.1\.4 is officially released/);

  const changelog = read('CHANGELOG.md');
  assert.match(changelog, /^## 1\.1\.4\b/m);
});

test('performance diagnostics have an explicit disabled-by-default release contract', () => {
  const store = read('app/playground/shared/performance/performance-stats.store.ts');
  const statusBar = read('app/playground/features/shell/workbench-status-bar.tsx');
  const panel = read('app/playground/shared/performance/PerformanceStatsPanel.tsx');

  assert.match(store, /DEFAULT_PERFORMANCE_DIAGNOSTICS_ENABLED\s*=\s*false/);
  assert.match(store, /private enabled = DEFAULT_PERFORMANCE_DIAGNOSTICS_ENABLED/);
  assert.match(statusBar, /useState\(DEFAULT_PERFORMANCE_DIAGNOSTICS_ENABLED\)/);
  assert.match(panel, /performanceStats\.setEnabled\(true\)/);
  assert.match(panel, /performanceStats\.setEnabled\(false\)/);
});
