import { openDb } from './lib/db.mjs';
import { centsToMoney, printTable } from './lib/money.mjs';

const path = process.argv[2] ?? 'bank.db';
const db = openDb(path);

console.log(`Mostrando contenido de: ${path}`);

const users = db.prepare(`
  SELECT
    id,
    name,
    email,
    password_plain,
    substr(password_hash, 1, 18) || CASE WHEN password_hash IS NULL THEN '' ELSE '...' END AS password_hash_preview,
    substr(password_salt, 1, 12) || CASE WHEN password_salt IS NULL THEN '' ELSE '...' END AS salt_preview
  FROM users
  ORDER BY id
`).all();

const accounts = db.prepare(`
  SELECT a.id, u.email, a.balance_cents, a.currency
  FROM accounts a
  JOIN users u ON u.id = a.user_id
  ORDER BY a.id
`).all().map(row => ({
  ...row,
  balance: centsToMoney(row.balance_cents, row.currency)
}));

const transfers = db.prepare(`
  SELECT id, from_account_id, to_account_id, amount_cents, currency, created_at
  FROM transfers
  ORDER BY id
`).all().map(row => ({
  ...row,
  amount: centsToMoney(row.amount_cents, row.currency)
}));

const logs = db.prepare(`
  SELECT
    id,
    event_type,
    transfer_id,
    substr(previous_hash, 1, 16) AS previous_hash,
    substr(event_hash, 1, 16) AS event_hash,
    substr(signature, 1, 16) || '...' AS signature,
    created_at
  FROM activity_log
  ORDER BY id
`).all();

printTable('Users', users);
printTable('Accounts', accounts);
printTable('Transfers', transfers);
printTable('Activity Log', logs);

db.close();
