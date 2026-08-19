import fs from 'node:fs';
import {
  generateKeyPairSync,
  sign,
  verify
} from 'node:crypto';
import { sha256Hex } from './crypto-utils.mjs';

export const PRIVATE_KEY_FILE = 'bank-private.pem';
export const PUBLIC_KEY_FILE = 'bank-public.pem';
export const GENESIS_HASH = 'GENESIS';

export function createSigningKeysIfMissing() {
  if (fs.existsSync(PRIVATE_KEY_FILE) && fs.existsSync(PUBLIC_KEY_FILE)) {
    return;
  }

  const { publicKey, privateKey } = generateKeyPairSync('ed25519');

  fs.writeFileSync(
    PRIVATE_KEY_FILE,
    privateKey.export({ type: 'pkcs8', format: 'pem' }),
    { mode: 0o600 }
  );

  fs.writeFileSync(
    PUBLIC_KEY_FILE,
    publicKey.export({ type: 'spki', format: 'pem' })
  );
}

export function canonicalJson(object) {
  return JSON.stringify(object, Object.keys(object).sort());
}

export function buildEventHash(previousHash, payload) {
  return sha256Hex(`${previousHash}|${payload}`);
}

export function signEventHash(eventHash) {
  const privateKey = fs.readFileSync(PRIVATE_KEY_FILE, 'utf8');
  return sign(null, Buffer.from(eventHash), privateKey).toString('base64');
}

export function verifyEventSignature(eventHash, signatureBase64) {
  const publicKey = fs.readFileSync(PUBLIC_KEY_FILE, 'utf8');
  return verify(
    null,
    Buffer.from(eventHash),
    publicKey,
    Buffer.from(signatureBase64, 'base64')
  );
}

export function getLastEventHash(db) {
  const row = db.prepare(`
    SELECT event_hash
    FROM activity_log
    ORDER BY id DESC
    LIMIT 1
  `).get();

  return row?.event_hash ?? GENESIS_HASH;
}

export function insertTransferAuditEvent(db, transfer) {
  const previousHash = getLastEventHash(db);
  const payload = canonicalJson(transfer);
  const eventHash = buildEventHash(previousHash, payload);
  const signature = signEventHash(eventHash);

  db.prepare(`
    INSERT INTO activity_log (
      event_type,
      transfer_id,
      payload,
      previous_hash,
      event_hash,
      signature,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    'TRANSFER_COMPLETED',
    transfer.transfer_id,
    payload,
    previousHash,
    eventHash,
    signature,
    transfer.created_at
  );

  return { previousHash, eventHash, signature };
}
