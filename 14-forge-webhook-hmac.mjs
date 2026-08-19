import fs from 'node:fs';
import { createHmac } from 'node:crypto';
import { buildDepositPayload } from './lib/webhook.mjs';
import { canonicalJson } from './lib/audit.mjs';
import { WEBHOOK_HMAC_SECRET_FILE } from './lib/webhook-hmac.mjs';

// Simula a un atacante que NUNCA corrió 12-webhook-hmac-sign.mjs pero de
// algún modo obtuvo webhook-hmac-secret.txt (quedó en un log, en un commit,
// en una variable de entorno mal protegida...). No necesita nuestro código:
// solo necesita saber DOS cosas públicas -- que el algoritmo es HMAC-SHA256
// y que firma el JSON canónico de { account_id, amount_cents, operation } --
// más el secreto filtrado. Con eso, cualquier implementación de HMAC-SHA256
// en cualquier lenguaje reproduce una firma indistinguible de una legítima.
//
// Compara con el equivalente Ed25519: ahí filtrar webhook-public.pem no le
// sirve de nada a un atacante, porque verificar y firmar son operaciones
// distintas con llaves distintas.

if (!fs.existsSync(WEBHOOK_HMAC_SECRET_FILE)) {
  console.error(`No existe ${WEBHOOK_HMAC_SECRET_FILE}. Ejecuta primero node 12-webhook-hmac-sign.mjs`);
  process.exit(1);
}

const accountId = Number(process.argv[2] ?? 3);
const amountCents = Number(process.argv[3] ?? 100000000); // $1,000,000.00
const operation = process.argv[4] ?? 'ADD_FUNDS_HMAC_DEMO';

const leakedSecret = fs.readFileSync(WEBHOOK_HMAC_SECRET_FILE, 'utf8').trim();

const payload = buildDepositPayload({ accountId, amountCents, operation });
const canonicalPayload = canonicalJson(payload);

// Esto es TODO lo que hace signWebhookPayloadHmac() en lib/webhook-hmac.mjs.
// No hay nada "secreto" en el algoritmo, solo en el valor de leakedSecret.
const forgedSignature = createHmac('sha256', leakedSecret)
  .update(canonicalPayload)
  .digest('hex');

fs.writeFileSync(
  'webhook-hmac-forged-request.json',
  JSON.stringify({ payload: canonicalPayload, signature: forgedSignature }, null, 2)
);

console.log('=== Atacante: forjando depósito solo con el secreto filtrado ===\n');
console.log('cuenta:    ', accountId);
console.log('monto:     ', amountCents, `($${(amountCents / 100).toFixed(2)})`);
console.log('operacion: ', operation);
console.log('firma:     ', forgedSignature, '(indistinguible de una firma legítima)');

console.log('\nArchivo generado: webhook-hmac-forged-request.json');

console.log('\nPruébalo contra el mismo verificador que usa el proveedor "legítimo":\n');
console.log(`node 13-webhook-hmac-receive-deposit.mjs ${accountId} ${amountCents} ${operation} ${forgedSignature}`);

console.log('\nNota para clase: 13-webhook-hmac-receive-deposit.mjs va a decir VALIDO ✓,');
console.log('porque criptográficamente ESTA firma es tan válida como cualquier otra --');
console.log('HMAC no distingue "el proveedor externo firmó esto" de "alguien con el');
console.log('secreto firmó esto". Ese es el costo de usar un secreto compartido en vez');
console.log('de un par de llaves: intenta este mismo ataque contra 15/16-webhook-*-deposit.mjs');
console.log('(Ed25519) sin webhook-private.pem -- no hay forma de lograrlo.');
