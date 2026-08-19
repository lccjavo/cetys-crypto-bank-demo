import fs from 'node:fs';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { canonicalJson } from './audit.mjs';

export const WEBHOOK_HMAC_SECRET_FILE = 'webhook-hmac-secret.txt';

// A diferencia de lib/webhook.mjs (Ed25519: llave privada firma, llave
// pública verifica), aquí hay UN SOLO secreto compartido. Cualquiera que lo
// tenga puede firmar y verificar por igual — no existe una mitad "pública"
// que solo sirva para verificar. Ese es el punto de esta demo.
export function createHmacSecretIfMissing() {
  if (fs.existsSync(WEBHOOK_HMAC_SECRET_FILE)) {
    return;
  }

  const secret = randomBytes(32).toString('hex');
  fs.writeFileSync(WEBHOOK_HMAC_SECRET_FILE, secret, { mode: 0o600 });
}

function readSecret() {
  return fs.readFileSync(WEBHOOK_HMAC_SECRET_FILE, 'utf8').trim();
}

// Firma el payload como lo haría el proveedor externo antes de enviarlo.
// Igual que en webhook.mjs, se devuelve el JSON canónico (los bytes EXACTOS
// que se firmaron) junto con la firma, porque el receptor debe recalcular
// el HMAC sobre esos mismos bytes.
export function signWebhookPayloadHmac(payload) {
  const secret = readSecret();
  const canonicalPayload = canonicalJson(payload);
  const signature = createHmac('sha256', secret)
    .update(canonicalPayload)
    .digest('hex');

  return { canonicalPayload, signature };
}

// Recalcula el HMAC con el mismo secreto y compara en tiempo constante
// (timingSafeEqual) para no filtrar por cuánto se parece la firma recibida
// a la correcta.
export function verifyWebhookSignatureHmac(canonicalPayload, signatureHex) {
  const secret = readSecret();
  const expected = createHmac('sha256', secret)
    .update(canonicalPayload)
    .digest('hex');

  const expectedBuffer = Buffer.from(expected, 'hex');
  const receivedBuffer = Buffer.from(signatureHex, 'hex');

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, receivedBuffer);
}
