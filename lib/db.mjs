import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { decryptBuffer, encryptBuffer, getSqliteTestKey } from './crypto-utils.mjs';

const DEFAULT_ENCRYPTED_PATH = 'bank.db.enc';

export function openDb(path = 'bank.db') {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON;');
  return db;
}

export function getOne(db, sql, ...params) {
  return db.prepare(sql).get(...params);
}

export function getAll(db, sql, ...params) {
  return db.prepare(sql).all(...params);
}

// --------------------------------------------------
// Encrypted DB: decrypt to a temp file to operate on it,
// re-encrypt back into bank.db.enc so writes persist.
// --------------------------------------------------

export function openEncryptedDb(encryptedPath = DEFAULT_ENCRYPTED_PATH, { readOnly = false } = {}) {
  const key = getSqliteTestKey();
  const encrypted = fs.readFileSync(encryptedPath);
  const decrypted = decryptBuffer(encrypted, key);

  const tempFile = path.join(
    os.tmpdir(),
    `crypto-bank-${randomBytes(8).toString('hex')}.db`
  );

  fs.writeFileSync(tempFile, decrypted, { mode: 0o600 });

  const db = new DatabaseSync(tempFile, { readOnly });
  db.exec('PRAGMA foreign_keys = ON;');

  function cleanupTemp() {
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }

  // Closes the db WITHOUT writing changes back to bank.db.enc.
  // Use this for read-only scripts (login, show-audit, verify-audit).
  function close() {
    db.close();
    cleanupTemp();
  }

  // Closes the db and re-encrypts the (possibly modified) temp file
  // back into bank.db.enc, so the change survives across scripts.
  function persist() {
    db.close();
    const updated = fs.readFileSync(tempFile);
    const reEncrypted = encryptBuffer(updated, key);

    const tmpOut = `${encryptedPath}.tmp`;
    fs.writeFileSync(tmpOut, reEncrypted);
    fs.renameSync(tmpOut, encryptedPath);

    cleanupTemp();
  }

  return { db, close, persist };
}
