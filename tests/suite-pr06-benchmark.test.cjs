'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {compareResults}=require('../scripts/benchmarks/compare-pr06.cjs');
const fixture=(node,scenarioCount,p95Ms)=>({environment:{node,platform:'linux',arch:'x64',cpu:'fixture'},config:{scenarioCount,payloadKb:1,seed:42},phases:{parseAllBundles:{p95Ms}}});
test('PR06 compares matching runtime and fixture',()=>{
  const result=compareResults(fixture('v22',100,20),fixture('v22',100,15));
  assert.equal(result.comparable,true);
  assert.equal(result.phases.parseAllBundles.deltaPercent,-25);
});
test('PR06 flags cross-machine or changed fixture comparisons',()=>{
  assert.equal(compareResults(fixture('v20',100,20),fixture('v22',100,15)).comparable,false);
  assert.equal(compareResults(fixture('v22',100,20),fixture('v22',1000,15)).comparable,false);
});
test('PR06 avoids division by zero',()=>{
  assert.equal(compareResults(fixture('v22',100,0),fixture('v22',100,15)).phases.parseAllBundles.deltaPercent,null);
});
