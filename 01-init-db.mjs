import fs from 'node:fs';
import { openDb } from './lib/db.mjs';
import { createSigningKeysIfMissing } from './lib/audit.mjs';
import { centsToMoney, printTable } from './lib/money.mjs';

if (fs.existsSync('bank.db')) fs.rmSync('bank.db');
if (fs.existsSync('bank.db.enc')) fs.rmSync('bank.db.enc');
if (fs.existsSync('bank-restored.db')) fs.rmSync('bank-restored.db');
if (fs.existsSync('bank-private.pem')) fs.rmSync('bank-private.pem');
if (fs.existsSync('bank-public.pem')) fs.rmSync('bank-public.pem');
if (fs.existsSync('webhook-deposit-request.json')) fs.rmSync('webhook-deposit-request.json');
// webhook-private.pem / webhook-public.pem NO se borran aquí: representan
// la identidad del proveedor externo (OXXO, banco emisor), que existe
// independientemente de que reiniciemos la base del banco.

createSigningKeysIfMissing();

const db = openDb('bank.db');

db.exec(`
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_plain TEXT,
    password_salt TEXT,
    password_hash TEXT,
    password_algorithm TEXT,
    password_params TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE accounts (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    balance_cents INTEGER NOT NULL CHECK(balance_cents >= 0),
    currency TEXT NOT NULL DEFAULT 'MXN',
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE transfers (
    id INTEGER PRIMARY KEY,
    from_account_id INTEGER NOT NULL,
    to_account_id INTEGER NOT NULL,
    amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
    currency TEXT NOT NULL DEFAULT 'MXN',
    created_at TEXT NOT NULL,
    FOREIGN KEY(from_account_id) REFERENCES accounts(id),
    FOREIGN KEY(to_account_id) REFERENCES accounts(id)
  );

  CREATE TABLE activity_log (
    id INTEGER PRIMARY KEY,
    event_type TEXT NOT NULL,
    transfer_id INTEGER,
    payload TEXT NOT NULL,
    previous_hash TEXT NOT NULL,
    event_hash TEXT NOT NULL,
    signature TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(transfer_id) REFERENCES transfers(id)
  );
`);

const now = new Date().toISOString();

const insertUser = db.prepare(`
  INSERT INTO users (name, email, password_plain, created_at)
  VALUES (?, ?, ?, ?)
`);

insertUser.run('Ana López', 'ana@example.com', 'Password123!', now);
insertUser.run('Carlos Ruiz', 'carlos@example.com', 'Carlos123!', now);
insertUser.run('Admin Demo', 'admin@example.com', 'Admin123!', now);

// Beatriz, Diego y Elena usan la MISMA contraseña que Ana ("Password123!") a
// propósito: 05-hash-passwords.mjs y 06-login-demo.mjs usan a este grupo para
// mostrar que el salt hace que 4 contraseñas idénticas produzcan 4 hashes
// completamente distintos en la base de datos.
insertUser.run('Beatriz Torres', 'beatriz@example.com', 'Password123!', now);
insertUser.run('Diego Fernández', 'diego@example.com', 'Password123!', now);
insertUser.run('Elena Martínez', 'elena@example.com', 'Password123!', now);
insertUser.run('Fernando Gómez', 'fernando@example.com', 'Fernando2024!', now);
insertUser.run('Gabriela Sánchez', 'gabriela@example.com', 'Gabriela2024!', now);
insertUser.run('Hugo Ramírez', 'hugo@example.com', 'Hugo2024!', now);
insertUser.run('Isabel Castro', 'isabel@example.com', 'Isabel2024!', now);

const insertAccount = db.prepare(`
  INSERT INTO accounts (user_id, balance_cents, currency)
  VALUES (?, ?, 'MXN')
`);

insertAccount.run(1, 100000); // $1,000.00
insertAccount.run(2, 50000);  // $500.00
insertAccount.run(3, 0);      // $0.00
insertAccount.run(4, 20000);  // $200.00
insertAccount.run(5, 15000);  // $150.00
insertAccount.run(6, 30000);  // $300.00
insertAccount.run(7, 0);      // $0.00
insertAccount.run(8, 5000);   // $50.00
insertAccount.run(9, 100000); // $1,000.00
insertAccount.run(10, 2500);  // $25.00

const users = db.prepare(`
  SELECT id, name, email, password_plain
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

printTable('Usuarios iniciales: passwords en texto plano (mal diseño intencional)', users);
printTable('Cuentas iniciales', accounts);

console.log('\nArchivos generados:');
console.log('- bank.db');
console.log('- bank-private.pem');
console.log('- bank-public.pem');
console.log('\nSiguiente paso: node 02-show-db.mjs');

db.close();
