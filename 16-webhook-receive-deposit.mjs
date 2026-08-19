import fs from 'node:fs';
import { openEncryptedDb } from './lib/db.mjs';
import { verifyWebhookSignature, buildDepositPayload } from './lib/webhook.mjs';
import { canonicalJson } from './lib/audit.mjs';
import { centsToMoney, printTable } from './lib/money.mjs';

// Simula nuestro endpoint recibiendo el webhook: SOLO confía en cuenta /
// monto / operación si la firma es válida.
//
// Dos formas de correrlo:
//
//   node 16-webhook-receive-deposit.mjs
//     -> lee webhook-deposit-request.json (lo generó 15-webhook-sign-deposit.mjs)
//
//   node 16-webhook-receive-deposit.mjs <cuenta> <monto> <operacion> <firma>
//     -> recibe los datos por consola, como si te los hubieran dictado o
//        copiado de otro sistema (la línea que imprime 15-webhook-sign-deposit.mjs)

const [accountArg, amountArg, operationArg, signatureArg] = process.argv.slice(2);

let canonicalPayload;
let signature;

if (signatureArg) {
  const payload = buildDepositPayload({
    accountId: Number(accountArg),
    amountCents: Number(amountArg),
    operation: operationArg
  });

  canonicalPayload = canonicalJson(payload);
  signature = signatureArg;

  console.log('=== Banco: recibiendo webhook (parámetros por consola) ===');
} else {
  const requestPath = 'webhook-deposit-request.json';

  if (!fs.existsSync(requestPath)) {
    console.error(`No existe ${requestPath}. Ejecuta primero node 15-webhook-sign-deposit.mjs`);
    console.error('O pasa los datos directo por consola:');
    console.error('  node 16-webhook-receive-deposit.mjs <cuenta> <monto> <operacion> <firma>');
    process.exit(1);
  }

  ({ payload: canonicalPayload, signature } = JSON.parse(fs.readFileSync(requestPath, 'utf8')));
  console.log('=== Banco: recibiendo webhook (desde webhook-deposit-request.json) ===');
}

const signatureOk = verifyWebhookSignature(canonicalPayload, signature);
console.log(`Firma verificada con webhook-public.pem: ${signatureOk ? 'VALIDA ✓' : 'INVALIDA ✗'}`);

if (!signatureOk) {
  console.error('\nRECHAZADO: la firma no corresponde a estos datos exactos.');
  console.error('Cambiar un solo dígito de la cuenta, el monto, la operación o la');
  console.error('firma invalida todo el mensaje. No se modifica bank.db.enc.');
  process.exit(1);
}

const deposit = JSON.parse(canonicalPayload);

if (!/^ADD_FUNDS/.test(deposit.operation ?? '')) {
  console.error(`RECHAZADO: operation "${deposit.operation}" no soportada por este endpoint.`);
  process.exit(1);
}

console.log(`Operación: ${deposit.operation} | Cuenta: ${deposit.account_id} | Monto: ${centsToMoney(deposit.amount_cents, 'MXN')}`);

const { db, close, persist } = openEncryptedDb();

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

printTable('Antes', accountSummary());

try {
  db.exec('BEGIN IMMEDIATE TRANSACTION;');

  const account = db.prepare(`
    SELECT id FROM accounts WHERE id = ?
  `).get(deposit.account_id);

  if (!account) {
    throw new Error(`Cuenta ${deposit.account_id} no existe.`);
  }

  db.prepare(`
    UPDATE accounts SET balance_cents = balance_cents + ? WHERE id = ?
  `).run(deposit.amount_cents, deposit.account_id);

  db.exec('COMMIT;');

  console.log('\nDepósito aplicado.');
  printTable('Después', accountSummary());

  persist();
  console.log('\nCambios cifrados y guardados de nuevo en bank.db.enc.');

  console.log('\nNota para clase: este depósito actualiza el saldo pero NO se');
  console.log('encadena en activity_log (a diferencia de las transferencias).');
  console.log('Pregunta para discutir: ¿qué agregarías para que también quede');
  console.log('en la cadena de auditoría con hash chain + firma?');
} catch (error) {
  db.exec('ROLLBACK;');
  console.error('Depósito rechazado.');
  console.error(error.message);
  close();
  process.exit(1);
}
