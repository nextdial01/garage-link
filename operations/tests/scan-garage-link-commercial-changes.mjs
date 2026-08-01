#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? '.');
const base = process.env.GARAGE_LINK_GATE_BASE_SHA ?? 'c92d799a2dce9af423b65fc13b312965efc34aa1';
const committed = execFileSync('git', ['-C', root, 'diff', '--name-only', `${base}..HEAD`], { encoding: 'utf8' });
const unstaged = execFileSync('git', ['-C', root, 'diff', '--name-only'], { encoding: 'utf8' });
const staged = execFileSync('git', ['-C', root, 'diff', '--cached', '--name-only'], { encoding: 'utf8' });
const untracked = execFileSync('git', ['-C', root, 'ls-files', '--others', '--exclude-standard'], { encoding: 'utf8' });
const files = [...new Set(`${committed}\n${unstaged}\n${staged}\n${untracked}`.split(/\r?\n/).filter(Boolean))]
  .filter((file) => fs.existsSync(path.join(root, file)) && fs.statSync(path.join(root, file)).isFile());
const secretPatterns = [
  ['stripe-live-key', /sk_live_[A-Za-z0-9]{16,}/g],
  ['database-credential-url', /postgres(?:ql)?:\/\/[^\s:/]+:[^\s@]+@[^\s/?]+/g],
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ['jwt', /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g],
];
const piiPatterns = [
  ['email', /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi],
  ['japanese-phone', /(?<![A-Za-z0-9])(?:0\d{1,4}[- ]?\d{1,4}[- ]?\d{3,4})(?![A-Za-z0-9])/g],
];
const findings = [];
for (const file of files) {
  if (/\.(?:png|jpg|jpeg|gif|webp|ico|woff2?)$/i.test(file)) continue;
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  for (const [kind, pattern] of [...secretPatterns, ...piiPatterns]) {
    for (const match of text.matchAll(pattern)) {
      const value = match[0];
      if (kind === 'email' && (value.endsWith('@example.invalid') || value.endsWith('@host.docker.internal'))) continue;
      if (kind === 'database-credential-url' && /@(127\.0\.0\.1|host\.docker\.internal)(?::|\/)/.test(value)) continue;
      if (kind === 'japanese-phone' && /(?:sha256|version|2026|0000|127\.0\.0\.1)/i.test(text.slice(Math.max(0, match.index - 24), match.index + value.length + 24))) continue;
      findings.push({ file, kind, offset: match.index });
    }
  }
}
if (findings.length) {
  process.stderr.write(`${JSON.stringify({status:'FAIL',findings},null,2)}\n`);
  process.exit(2);
}
process.stdout.write(`${JSON.stringify({status:'PASS',files:files.length,secretFindings:0,piiFindings:0})}\n`);
