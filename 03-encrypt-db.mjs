import fs from 'node:fs';
import { encryptBuffer, getSqliteTestKey } from './lib/crypto-utils.mjs';

const key = getSqliteTestKey();
const plaintextDb = fs.readFileSync('bank.db');
const encryptedDb = encryptBuffer(plaintextDb, key);

fs.writeFileSync('bank.db.enc', encryptedDb);

console.log('bank.db fue cifrada con AES-256-GCM.');
console.log(`Archivo original: ${plaintextDb.length} bytes`);
console.log(`Archivo cifrado:  ${encryptedDb.length} bytes`);
console.log('\nPrueba: sqlite3 bank.db.enc "SELECT * FROM users;"');
console.log('SQLite no debería poder interpretar el archivo cifrado.');
