#!/usr/bin/env node

import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const outputDir = process.argv[2];
const expectedRef = process.argv[3];
if (!outputDir || !expectedRef || !/^[a-z0-9]{20}$/.test(expectedRef)) process.exit(2);

const raw = readFileSync(0, 'utf8').trim();
if (!raw || raw.length > 4096 || /[\r\n\0]/.test(raw)) process.exit(3);
let parsed;
try {
  parsed = new URL(raw);
} catch {
  process.exit(3);
}
if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) process.exit(4);
if (parsed.hash) process.exit(4);
for (const [key, value] of parsed.searchParams) {
  if (key !== 'sslmode' || !['require', 'verify-full'].includes(value)) process.exit(4);
}

const host = parsed.hostname.toLowerCase();
const port = parsed.port || '5432';
const user = decodeURIComponent(parsed.username);
const password = decodeURIComponent(parsed.password);
const database = decodeURIComponent(parsed.pathname.replace(/^\//, '')) || 'postgres';
if (!host || !user || !password || !database || !/^\d+$/.test(port)) process.exit(6);
if (database !== 'postgres' || port !== '5432') process.exit(6);

const directMatch = host.match(/^db\.([a-z0-9]{20})\.supabase\.co$/);
const poolerHost = /^(?:[a-z0-9-]+\.)+pooler\.supabase\.com$/.test(host);
const poolerUserMatch = user.match(/^postgres\.([a-z0-9]{20})$/);
let connectionKind;
let projectRef;
if (directMatch && user === 'postgres') {
  connectionKind = 'direct';
  projectRef = directMatch[1];
} else if (poolerHost && poolerUserMatch) {
  connectionKind = 'session_pooler';
  projectRef = poolerUserMatch[1];
} else {
  process.exit(5);
}
if (projectRef !== expectedRef) process.exit(5);

const escapePgpass = (value) => value.replaceAll('\\', '\\\\').replaceAll(':', '\\:');
mkdirSync(outputDir, { recursive: true, mode: 0o700 });
writeFileSync(resolve(outputDir, 'pgpass'), `${escapePgpass(host)}:${port}:${escapePgpass(database)}:${escapePgpass(user)}:${escapePgpass(password)}\n`, { mode: 0o600 });
writeFileSync(resolve(outputDir, 'connection-meta.json'), `${JSON.stringify({ host, port, user, database, sslmode: 'require', connectionKind, projectRef })}\n`, { mode: 0o600 });
chmodSync(resolve(outputDir, 'pgpass'), 0o600);
chmodSync(resolve(outputDir, 'connection-meta.json'), 0o600);
