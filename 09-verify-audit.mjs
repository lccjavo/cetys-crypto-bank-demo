import { openEncryptedDb } from './lib/db.mjs';
import {
  GENESIS_HASH,
  buildEventHash,
  verifyEventSignature
} from './lib/audit.mjs';

const { db, close } = openEncryptedDb(undefined, { readOnly: true });

const logs = db.prepare(`
  SELECT *
  FROM activity_log
  ORDER BY id
`).all();

if (logs.length === 0) {
  console.log('No hay eventos en activity_log. Ejecuta primero node 07-transfer.mjs');
  close();
  process.exit(0);
}

let previous = GENESIS_HASH;
let allValid = true;

console.log('\n=== Verificando activity_log ===');

for (const log of logs) {
  const payload = JSON.parse(log.payload);
  const expectedHash = buildEventHash(log.previous_hash, log.payload);
  const hashOk = expectedHash === log.event_hash;
  const previousOk = log.previous_hash === previous;
  const signatureOk = verifyEventSignature(log.event_hash, log.signature);

  const transfer = db.prepare(`
    SELECT
      id AS transfer_id,
      from_account_id,
      to_account_id,
      amount_cents,
      currency,
      created_at
    FROM transfers
    WHERE id = ?
  `).get(log.transfer_id);

  const transferMatchesPayload = transfer &&
    transfer.transfer_id === payload.transfer_id &&
    transfer.from_account_id === payload.from_account_id &&
    transfer.to_account_id === payload.to_account_id &&
    transfer.amount_cents === payload.amount_cents &&
    transfer.currency === payload.currency &&
    transfer.created_at === payload.created_at;

  const valid = hashOk && previousOk && signatureOk && transferMatchesPayload;
  allValid = allValid && valid;

  console.log(`\nEvento #${log.id} / Transfer #${log.transfer_id}`);
  console.log(`- previous_hash correcto: ${previousOk ? '✓' : '✗'}`);
  console.log(`- event_hash correcto:    ${hashOk ? '✓' : '✗'}`);
  console.log(`- firma válida:          ${signatureOk ? '✓' : '✗'}`);
  console.log(`- transferencia coincide con payload firmado: ${transferMatchesPayload ? '✓' : '✗'}`);

  if (!transferMatchesPayload) {
    console.log('  Payload firmado:', payload);
    console.log('  Transfer en DB: ', transfer);
  }

  previous = log.event_hash;
}

console.log(`\nResultado final de auditoría: ${allValid ? 'VALID ✓' : 'COMPROMISED ✗'}`);

close();

if (!allValid) {
  process.exitCode = 1;
}
