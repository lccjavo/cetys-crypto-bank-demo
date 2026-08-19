import fs from 'node:fs';
import { createHmacSecretIfMissing, signWebhookPayloadHmac } from './lib/webhook-hmac.mjs';
import { buildDepositPayload } from './lib/webhook.mjs';

// Misma idea que 15-webhook-sign-deposit.mjs (proveedor externo firmando un
// depósito) pero con HMAC-SHA256 + secreto compartido en vez de Ed25519.
// Corre este script haciendo de "proveedor externo".

createHmacSecretIfMissing();

const accountId = Number(process.argv[2] ?? 1);
const amountCents = Number(process.argv[3] ?? 30000); // $300.00
const operation = process.argv[4] ?? 'ADD_FUNDS_HMAC_DEMO';

if (!Number.isInteger(accountId) || accountId <= 0) {
  throw new Error('accountId debe ser un entero positivo. Ejemplo: 1');
}

if (!Number.isInteger(amountCents) || amountCents <= 0) {
  throw new Error('amountCents debe ser un entero positivo. Ejemplo: 30000 para $300.00');
}

const payload = buildDepositPayload({ accountId, amountCents, operation });
const { canonicalPayload, signature } = signWebhookPayloadHmac(payload);

// También lo dejamos como archivo, simulando el body que llegaría por HTTP.
fs.writeFileSync(
  'webhook-hmac-deposit-request.json',
  JSON.stringify({ payload: canonicalPayload, signature }, null, 2)
);

console.log('=== Proveedor externo: firmando depósito con HMAC-SHA256 (secreto compartido) ===\n');
console.log('cuenta:    ', accountId);
console.log('monto:     ', amountCents, `($${(amountCents / 100).toFixed(2)})`);
console.log('operacion: ', operation);
console.log('firma:     ', signature);

console.log('\nArchivo generado: webhook-hmac-deposit-request.json (simula el body por HTTP)');

console.log('\nPara la demo en vivo, copia y pega esta línea en la consola del "banco":\n');
console.log(`node 13-webhook-hmac-receive-deposit.mjs ${accountId} ${amountCents} ${operation} ${signature}`);

console.log('\nNota: webhook-hmac-secret.txt es el MISMO secreto que usa quien verifica');
console.log('(13-webhook-hmac-receive-deposit.mjs). Cualquiera que lo tenga puede generar');
console.log('esta misma firma para cualquier payload que invente — a diferencia de Ed25519');
console.log('(15-webhook-sign-deposit.mjs), donde solo quien tiene webhook-private.pem puede firmar.');
