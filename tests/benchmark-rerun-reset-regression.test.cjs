"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const source = fs.readFileSync(
  path.join(process.cwd(), "app/playground/hooks/use-benchmark-runner.ts"),
  "utf8",
);

test("each benchmark run clears previous results before choosing unary or streaming execution", () => {
  const runStart = source.indexOf("const runBenchmark = useCallback");
  const streamBranch = source.indexOf("if (selectedMethod.responseStream)", runStart);
  const reset = source.indexOf("setResults([])", runStart);

  assert.ok(runStart >= 0 && reset > runStart && reset < streamBranch);
});

test("late benchmark callbacks cannot append results to a newer run", () => {
  assert.match(source, /const runGenerationRef = useRef\(0\)/);
  assert.match(source, /runGeneration === runGenerationRef\.current/);
  assert.match(source, /runStreamingBenchmark\(parsedJson, runGeneration\)/);
});
