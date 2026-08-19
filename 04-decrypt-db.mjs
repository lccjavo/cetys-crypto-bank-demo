import fs from 'node:fs';
import { decryptBuffer, getSqliteTestKey } from './lib/crypto-utils.mjs';

const key = getSqliteTestKey();
const encryptedDb = fs.readFileSync('bank.db.enc');

try {
  const restoredDb = decryptBuffer(encryptedDb, key);
  fs.writeFileSync('bank-restored.db', restoredDb);
  console.log('bank.db.enc fue descifrada correctamente.');
  console.log('Archivo recuperado: bank-restored.db');
  console.log('\nPrueba: node 02-show-db.mjs bank-restored.db');
} catch (error) {
  console.error('No se pudo descifrar la base de datos.');
  console.error('Posibles causas: llave incorrecta, auth tag inválido o ciphertext alterado.');
  console.error(`Detalle: ${error.message}`);
  process.exit(1);
}
