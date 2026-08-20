import fs from 'node:fs';
import { openDb, openCipherDb } from './lib/db.mjs';

// Crea bank-cipher.db: una copia de bank.db cifrada con SQLCipher v4 real
// (páginas cifradas en disco, no un blob AES-GCM de archivo completo como
// bank.db.enc). Se puede abrir directo en DBeaver (driver sqlite-jdbc-crypt)
// o DB Browser for SQLite con la passphrase de SQLCIPHER_PASSPHRASE (.env).

const TABLE_ORDER = ['users', 'accounts', 'transfers', 'activity_log'];

const plainDb = openDb('bank.db');

const schemaByName = Object.fromEntries(
  plainDb.prepare(`
    SELECT name, sql FROM sqlite_master
    WHERE type = 'table' AND sql IS NOT NULL
  `).all().map(row => [row.name, row.sql])
);

if (fs.existsSync('bank-cipher.db')) {
  fs.unlinkSync('bank-cipher.db');
}

const { db: cipherDb, close } = openCipherDb('bank-cipher.db');

for (const table of TABLE_ORDER) {
  cipherDb.exec(schemaByName[table]);
}

for (const table of TABLE_ORDER) {
  const rows = plainDb.prepare(`SELECT * FROM ${table}`).all();
  if (rows.length === 0) continue;

  const columns = Object.keys(rows[0]);
  const insert = cipherDb.prepare(`
    INSERT INTO ${table} (${columns.join(', ')})
    VALUES (${columns.map(() => '?').join(', ')})
  `);

  for (const row of rows) {
    insert.run(...columns.map(col => row[col]));
  }

  console.log(`${table}: ${rows.length} filas copiadas.`);
}

plainDb.close();
close();

console.log('\nbank-cipher.db creado (SQLCipher v4, cifrado real a nivel de página).');
console.log('sqlite3 bank-cipher.db ".tables" debería fallar (no es texto plano ni SQLite sin cifrar).');
console.log('Ábrelo en DBeaver o DB Browser for SQLite con la passphrase de SQLCIPHER_PASSPHRASE.');
