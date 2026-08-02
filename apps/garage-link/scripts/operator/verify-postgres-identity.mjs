#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const [expectedRef, expectedDatabase, expectedLedger, targetVersion] = process.argv.slice(2);
if (!/^[a-z0-9]{20}$/.test(expectedRef || '') || expectedDatabase !== 'postgres' || !/^\d+$/.test(expectedLedger || '') || !/^\d{14}$/.test(targetVersion || '')) process.exit(2);
let identity;
try {
  identity = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(1);
}
const valid = identity.database === expectedDatabase
  && identity.currentUser === 'postgres'
  && identity.sessionUser === 'postgres'
  && Number(identity.ledgerCount) === Number(expectedLedger)
  && Number(identity.targetMigrationCount) === 0
  && Number(identity.garageSignatureCount) >= 3
  && Number(identity.requiredRelationMissing) === 0;
if (!valid) process.exit(1);
const fingerprint = createHash('sha256').update(expectedRef).digest('hex').slice(0, 12);
process.stdout.write(`${JSON.stringify({ status: 'IDENTITY_PASS', projectFingerprint: fingerprint, database: expectedDatabase, ledger: Number(expectedLedger) })}\n`);
