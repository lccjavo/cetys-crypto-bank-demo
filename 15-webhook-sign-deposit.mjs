import fs from 'node:fs';
import { createWebhookKeysIfMissing, signWebhookPayload, buildDepositPayload } from './lib/webhook.mjs';

// Corre este script haciendo de "proveedor externo" (OXXO, un banco vía
// SPEI, etc.): arma la notificación de depósito y la firma con
// webhook-private.pem, la llave que SOLO tiene el proveedor externo.

createWebhookKeysIfMissing();

const accountId = Number(process.argv[2] ?? 1);
const amountCents = Number(process.argv[3] ?? 30000); // $300.00
const operation = process.argv[4] ?? 'ADD_FUNDS_OXXO';

if (!Number.isInteger(accountId) || accountId <= 0) {
  throw new Error('accountId debe ser un entero positivo. Ejemplo: 1');
}

if (!Number.isInteger(amountCents) || amountCents <= 0) {
  throw new Error('amountCents debe ser un entero positivo. Ejemplo: 30000 para $300.00');
}

const payload = buildDepositPayload({ accountId, amountCents, operation });
const { canonicalPayload, signature } = signWebhookPayload(payload);

// También lo dejamos como archivo, simulando el body que llegaría por HTTP.
fs.writeFileSync(
  'webhook-deposit-request.json',
  JSON.stringify({ payload: canonicalPayload, signature }, null, 2)
);

console.log('=== Proveedor externo: firmando depósito con webhook-private.pem ===\n');
console.log('cuenta:    ', accountId);
console.log('monto:     ', amountCents, `($${(amountCents / 100).toFixed(2)})`);
console.log('operacion: ', operation);
console.log('firma:     ', signature);

console.log('\nArchivo generado: webhook-deposit-request.json (simula el body por HTTP)');

console.log('\nPara la demo en vivo, copia y pega esta línea en la consola del "banco":\n');
console.log(`node 16-webhook-receive-deposit.mjs ${accountId} ${amountCents} ${operation} ${signature}`);
