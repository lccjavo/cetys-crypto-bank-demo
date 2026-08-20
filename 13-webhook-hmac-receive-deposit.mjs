import fs from 'node:fs';
import { openCipherDb } from './lib/db.mjs';
import { verifyWebhookSignatureHmac } from './lib/webhook-hmac.mjs';
import { buildDepositPayload } from './lib/webhook.mjs';
import { canonicalJson } from './lib/audit.mjs';
import { centsToMoney, printTable } from './lib/money.mjs';

// Misma idea que 16-webhook-receive-deposit.mjs pero verificando con
// HMAC-SHA256 + secreto compartido (webhook-hmac-secret.txt) en vez de la
// llave pública Ed25519. SOLO confía en cuenta / monto / operación si el
// HMAC recalculado coincide con el recibido.
//
// Dos formas de correrlo:
//
//   node 13-webhook-hmac-receive-deposit.mjs
//     -> lee webhook-hmac-deposit-request.json (lo generó 12-webhook-hmac-sign.mjs)
//
//   node 13-webhook-hmac-receive-deposit.mjs <cuenta> <monto> <operacion> <firma>
//     -> recibe los datos por consola, como la línea que imprime 12-webhook-hmac-sign.mjs

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

  console.log('=== Banco: recibiendo webhook HMAC (parámetros por consola) ===');
} else {
  const requestPath = 'webhook-hmac-deposit-request.json';

  if (!fs.existsSync(requestPath)) {
    console.error(`No existe ${requestPath}. Ejecuta primero node 12-webhook-hmac-sign.mjs`);
    console.error('O pasa los datos directo por consola:');
    console.error('  node 13-webhook-hmac-receive-deposit.mjs <cuenta> <monto> <operacion> <firma>');
    process.exit(1);
  }

  ({ payload: canonicalPayload, signature } = JSON.parse(fs.readFileSync(requestPath, 'utf8')));
  console.log('=== Banco: recibiendo webhook HMAC (desde webhook-hmac-deposit-request.json) ===');
}

const signatureOk = verifyWebhookSignatureHmac(canonicalPayload, signature);
console.log(`HMAC verificado con webhook-hmac-secret.txt: ${signatureOk ? 'VALIDO ✓' : 'INVALIDO ✗'}`);

if (!signatureOk) {
  console.error('\nRECHAZADO: el HMAC no corresponde a estos datos exactos con este secreto.');
  console.error('Cambiar un solo dígito de la cuenta, el monto, la operación o la firma');
  console.error('invalida todo el mensaje. No se modifica bank-cipher.db.');
  process.exit(1);
}

const deposit = JSON.parse(canonicalPayload);

if (!/^ADD_FUNDS/.test(deposit.operation ?? '')) {
  console.error(`RECHAZADO: operation "${deposit.operation}" no soportada por este endpoint.`);
  process.exit(1);
}

console.log(`Operación: ${deposit.operation} | Cuenta: ${deposit.account_id} | Monto: ${centsToMoney(deposit.amount_cents, 'MXN')}`);

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
  console.log('\nCambios guardados en bank-cipher.db (SQLCipher).');

  console.log('\nNota para clase: esta ruta usa el MISMO secreto para firmar y verificar.');
  console.log('Si ese secreto se filtra (log, repo, variable de entorno mal protegida),');
  console.log('cualquiera puede forjar depósitos válidos — a diferencia del ejemplo Ed25519');
  console.log('(15/16), donde filtrar la llave pública no sirve para firmar nada.');
} catch (error) {
  db.exec('ROLLBACK;');
  console.error('Depósito rechazado.');
  console.error(error.message);
  close();
  process.exit(1);
}
