import fs from 'node:fs';
import { generateKeyPairSync, sign, verify } from 'node:crypto';
import { canonicalJson } from './audit.mjs';

export const WEBHOOK_PRIVATE_KEY_FILE = 'webhook-private.pem';
export const WEBHOOK_PUBLIC_KEY_FILE = 'webhook-public.pem';

// Identidad del "proveedor externo" (OXXO, banco emisor, etc.), separada
// de bank-private.pem / bank-public.pem que son del propio banco.
export function createWebhookKeysIfMissing() {
  if (fs.existsSync(WEBHOOK_PRIVATE_KEY_FILE) && fs.existsSync(WEBHOOK_PUBLIC_KEY_FILE)) {
    return;
  }

  const { publicKey, privateKey } = generateKeyPairSync('ed25519');

  fs.writeFileSync(
    WEBHOOK_PRIVATE_KEY_FILE,
    privateKey.export({ type: 'pkcs8', format: 'pem' }),
    { mode: 0o600 }
  );

  fs.writeFileSync(
    WEBHOOK_PUBLIC_KEY_FILE,
    publicKey.export({ type: 'spki', format: 'pem' })
  );
}

// Firma el payload como lo haría el proveedor externo antes de enviarlo.
// Se devuelve el JSON canónico (los bytes EXACTOS que se firmaron) junto
// con la firma, porque el receptor debe verificar sobre esos mismos bytes.
export function signWebhookPayload(payload) {
  const privateKey = fs.readFileSync(WEBHOOK_PRIVATE_KEY_FILE, 'utf8');
  const canonicalPayload = canonicalJson(payload);
  const signature = sign(null, Buffer.from(canonicalPayload), privateKey).toString('base64');
  return { canonicalPayload, signature };
}

// Forma canónica del payload de un depósito. Se usa tanto para firmar
// (proveedor externo) como para reconstruir y verificar (banco) — si los
// dos lados no arman el objeto exactamente igual, la firma nunca va a dar válida.
export function buildDepositPayload({ accountId, amountCents, operation }) {
  return {
    account_id: accountId,
    amount_cents: amountCents,
    operation
  };
}

export function verifyWebhookSignature(canonicalPayload, signatureBase64) {
  const publicKey = fs.readFileSync(WEBHOOK_PUBLIC_KEY_FILE, 'utf8');
  return verify(
    null,
    Buffer.from(canonicalPayload),
    publicKey,
    Buffer.from(signatureBase64, 'base64')
  );
}
