// PreToolUse hook (Bash): main changes only through a pull request, so CI and CodeQL run first
// (the same rule as the branch ruleset on GitHub). Denies a push to main, a push while on main
// with no branch named, and any force push. Other commands pass straight through.

import { execFileSync } from 'node:child_process';

let input = '';
for await (const chunk of process.stdin) input += chunk;
const command = JSON.parse(input || '{}').tool_input?.command ?? '';

const pushes = command.split(/&&|\|\||;|\n/).map((part) => part.trim()).filter((part) => /^git\s+push\b/.test(part));
if (!pushes.length) process.exit(0);

function currentBranch() {
  try {
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function reason(push) {
  const words = push.split(/\s+/).slice(2);
  if (words.some((w) => w === '--force' || w === '-f' || w.startsWith('--force-with-lease') || /^\+/.test(w))) return 'Force pushes are blocked here.';
  if (words.some((w) => /(^|:)(refs\/heads\/)?(main|master)$/.test(w))) return 'Pushing to main is blocked: open a pull request instead.';
  const named = words.filter((w) => !w.startsWith('-'));
  if (named.length <= 1 && ['main', 'master'].includes(currentBranch())) return 'You are on main: create a branch, push that, and open a pull request.';
  return null;
}

const blocked = pushes.map(reason).find(Boolean);
if (!blocked) process.exit(0);
process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: blocked },
  }),
);
