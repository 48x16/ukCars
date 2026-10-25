// PostToolUse hook (Edit|Write): after Claude changes a file in pipeline/ or src/, run the unit
// tests that import it (`vitest related`). A failure exits 2, which hands the output back to
// Claude so it fixes the break straight away. Anything else passes through silently.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
let input = '';
for await (const chunk of process.stdin) input += chunk;

const file = JSON.parse(input || '{}').tool_input?.file_path;
if (!file) process.exit(0);
const rel = relative(root, resolve(file)).replaceAll('\\', '/');
if (!/^(pipeline|src)\/.+\.js$/.test(rel) && !/^test\/.+\.test\.js$/.test(rel)) process.exit(0);

const vitest = resolve(root, 'node_modules/vitest/vitest.mjs');
if (!existsSync(vitest)) process.exit(0); // not installed yet: nothing to run

const run = spawnSync(process.execPath, [vitest, 'related', rel, '--run', '--passWithNoTests', '--reporter=dot'], {
  cwd: root,
  encoding: 'utf8',
  timeout: 110_000,
});
if (run.status === 0) process.exit(0);

const output = `${run.stdout ?? ''}${run.stderr ?? ''}`.trim().split('\n').slice(-40).join('\n');
process.stderr.write(`Unit tests related to ${rel} failed:\n${output}\n`);
process.exit(2);
