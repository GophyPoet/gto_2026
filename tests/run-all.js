#!/usr/bin/env node
/**
 * tests/run-all.js — simple runner so `node tests/run-all.js` executes
 * every *.test.js in this folder and fails with a non-zero status if any
 * individual suite fails.  Keeps the project build-system-free.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const dir = __dirname;
const suites = fs.readdirSync(dir)
  .filter((f) => /\.test\.js$/.test(f))
  .sort();

if (!suites.length) {
  console.log('No test suites found.');
  process.exit(0);
}

let failures = 0;
for (const suite of suites) {
  const full = path.join(dir, suite);
  console.log('\n=== ' + suite + ' ===');
  const res = spawnSync('node', [full], { stdio: 'inherit', env: process.env });
  if (res.status !== 0) failures += 1;
}

console.log(failures ? '\n' + failures + ' suite(s) failed' : '\nAll suites passed');
process.exit(failures ? 1 : 0);
