import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';
const names = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACM', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
for (const name of names) {
  const size = statSync(name).size;
  if (size >= 1_000_000) throw new Error(`${name} is ${size} bytes; refusing to publish a large source file.`);
}
console.log(`Verified ${names.length} staged source files below 1 MB each.`);
