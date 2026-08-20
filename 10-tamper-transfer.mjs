import { openCipherDb } from './lib/db.mjs';

const { db, close, persist } = openCipherDb();

const targetTransferId = Number(process.argv[2] ?? 1);
const newAmountCents = Number(process.argv[3] ?? 900000); // $9,000.00

const before = db.prepare(`
  SELECT id, amount_cents
  FROM transfers
  WHERE id = ?
`).get(targetTransferId);

if (!before) {
  console.error(`No existe transfer id=${targetTransferId}. Ejecuta node 07-transfer.mjs primero.`);
  close();
  process.exit(1);
}

db.prepare(`
  UPDATE transfers
  SET amount_cents = ?
  WHERE id = ?
`).run(newAmountCents, targetTransferId);

const after = db.prepare(`
  SELECT id, amount_cents
  FROM transfers
  WHERE id = ?
`).get(targetTransferId);

console.log('Transferencia alterada directamente en SQLite.');
console.log('Antes:', before);
console.log('Después:', after);

persist();
console.log('\nManipulación guardada en bank-cipher.db (SQLCipher).');
console.log('Ahora ejecuta: node 09-verify-audit.mjs');
