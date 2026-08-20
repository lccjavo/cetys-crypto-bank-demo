import { openCipherDb } from './lib/db.mjs';
import { centsToMoney, printTable } from './lib/money.mjs';
import { insertTransferAuditEvent } from './lib/audit.mjs';

const fromAccountId = Number(process.argv[2] ?? 1);
const toAccountId = Number(process.argv[3] ?? 2);
const amountCents = Number(process.argv[4] ?? 25000); // default $250.00
const currency = 'MXN';

if (!Number.isInteger(amountCents) || amountCents <= 0) {
  throw new Error('amountCents debe ser un entero positivo. Ejemplo: 25000 para $250.00');
}

const { db, close, persist } = openCipherDb();

function accountSummary() {
  return db.prepare(`
    SELECT a.id, u.email, a.balance_cents, a.currency
    FROM accounts a
    JOIN users u ON u.id = a.user_id
    ORDER BY a.id
  `).all().map(row => ({
    ...row,
    balance: centsToMoney(row.balance_cents, row.currency)
  }));
}

console.log(`Transferencia: ${centsToMoney(amountCents, currency)} de cuenta ${fromAccountId} a cuenta ${toAccountId}`);
printTable('Antes', accountSummary());

try {
  db.exec('BEGIN IMMEDIATE TRANSACTION;');

  const sender = db.prepare(`
    SELECT id, balance_cents, currency
    FROM accounts
    WHERE id = ?
  `).get(fromAccountId);

  const receiver = db.prepare(`
    SELECT id, balance_cents, currency
    FROM accounts
    WHERE id = ?
  `).get(toAccountId);

  if (!sender || !receiver) {
    throw new Error('Cuenta origen o destino no existe.');
  }

  if (sender.currency !== currency || receiver.currency !== currency) {
    throw new Error('Las monedas no coinciden.');
  }

  if (sender.balance_cents < amountCents) {
    throw new Error('Saldo insuficiente.');
  }

  db.prepare(`
    UPDATE accounts
    SET balance_cents = balance_cents - ?
    WHERE id = ?
  `).run(amountCents, fromAccountId);

  db.prepare(`
    UPDATE accounts
    SET balance_cents = balance_cents + ?
    WHERE id = ?
  `).run(amountCents, toAccountId);

  const createdAt = new Date().toISOString();

  const transferResult = db.prepare(`
    INSERT INTO transfers (
      from_account_id,
      to_account_id,
      amount_cents,
      currency,
      created_at
    ) VALUES (?, ?, ?, ?, ?)
  `).run(
    fromAccountId,
    toAccountId,
    amountCents,
    currency,
    createdAt
  );

  const transfer = {
    transfer_id: Number(transferResult.lastInsertRowid),
    from_account_id: fromAccountId,
    to_account_id: toAccountId,
    amount_cents: amountCents,
    currency,
    created_at: createdAt
  };

  insertTransferAuditEvent(db, transfer);

  db.exec('COMMIT;');

  console.log('\nTransferencia completada y registrada en activity_log.');
  printTable('Después', accountSummary());

  persist();
  console.log('\nCambios guardados en bank-cipher.db (SQLCipher).');
} catch (error) {
  db.exec('ROLLBACK;');
  console.error('Transferencia cancelada.');
  console.error(error.message);
  close();
  process.exit(1);
}
