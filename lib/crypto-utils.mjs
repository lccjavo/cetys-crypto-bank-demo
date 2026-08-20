import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scrypt,
  timingSafeEqual
} from 'node:crypto';
import { promisify } from 'node:util';

// Comparte los secretos vía .env (ver .env.example) en vez de exportarlos a
// mano en cada terminal -- así no se pierden entre sesiones.
try {
  process.loadEnvFile();
} catch {
  // No hay .env (por ejemplo, en CI con las variables ya exportadas).
}

const scryptAsync = promisify(scrypt);

export function getSqliteTestKey() {
  const keyHex = process.env.DB_SQLite_TEST_KEY;

  if (!keyHex || keyHex.length !== 64) {
    throw new Error(
      'DB_SQLite_TEST_KEY debe existir y contener 32 bytes en hex (ver .env.example). ' +
      'Ejemplo: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }

  return Buffer.from(keyHex, 'hex');
}

export function getCipherPassphrase() {
  const passphrase = process.env.SQLCIPHER_PASSPHRASE;

  if (!passphrase) {
    throw new Error(
      'SQLCIPHER_PASSPHRASE debe existir en el entorno o en .env (ver .env.example). ' +
      'Ejemplo: node -e "console.log(require(\'crypto\').randomBytes(24).toString(\'base64url\'))"'
    );
  }

  return passphrase;
}

export function encryptBuffer(buffer, key) {
  const iv = randomBytes(12); // recommended size for GCM
  const cipher = createCipheriv('aes-256-gcm', key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(buffer),
    cipher.final()
  ]);

  const authTag = cipher.getAuthTag();

  // Demo format: [12 bytes IV][16 bytes authTag][ciphertext]
  return Buffer.concat([iv, authTag, ciphertext]);
}

export function decryptBuffer(encryptedBuffer, key) {
  const iv = encryptedBuffer.subarray(0, 12);
  const authTag = encryptedBuffer.subarray(12, 28);
  const ciphertext = encryptedBuffer.subarray(28);

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final()
  ]);
}

export function sha256Hex(value) {
  return createHash('sha256')
    .update(value)
    .digest('hex');
}

export async function hashPassword(password) {
  const salt = randomBytes(16);

  const hash = await scryptAsync(password, salt, 64, {
    N: 2 ** 15,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024
  });

  return {
    salt: salt.toString('hex'),
    hash: Buffer.from(hash).toString('hex'),
    algorithm: 'scrypt',
    params: 'N=32768,r=8,p=1,keyLen=64'
  };
}

export async function verifyPassword(password, storedSaltHex, storedHashHex) {
  const salt = Buffer.from(storedSaltHex, 'hex');
  const expected = Buffer.from(storedHashHex, 'hex');

  const derived = await scryptAsync(password, salt, expected.length, {
    N: 2 ** 15,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024
  });

  return timingSafeEqual(expected, Buffer.from(derived));
}
