import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import CipherDatabase from 'better-sqlite3-multiple-ciphers';
import { decryptBuffer, encryptBuffer, getCipherPassphrase, getSqliteTestKey } from './crypto-utils.mjs';

const DEFAULT_ENCRYPTED_PATH = 'bank.db.enc';
const DEFAULT_CIPHER_PATH = 'bank-cipher.db';

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

// --------------------------------------------------
// SQLCipher (real, page-level encryption): opens bank-cipher.db directly,
// no temp file needed -- better-sqlite3-multiple-ciphers en/decrypts pages
// on the fly, so writes are already durable on close(). Readable straight
// from DBeaver (sqlite-jdbc-crypt driver) or DB Browser for SQLite with the
// same passphrase.
// --------------------------------------------------

export function openCipherDb(dbPath = DEFAULT_CIPHER_PATH, { readOnly = false } = {}) {
  const passphrase = getCipherPassphrase();
  const db = new CipherDatabase(dbPath, { readonly: readOnly });

  db.pragma(`cipher='sqlcipher'`);
  db.pragma('legacy=4');
  db.pragma(`key='${passphrase}'`);
  db.exec('PRAGMA foreign_keys = ON;');

  function close() {
    db.close();
  }

  return { db, close, persist: close };
}
