import { openCipherDb } from './lib/db.mjs';
import { verifyPassword } from './lib/crypto-utils.mjs';
import { printTable } from './lib/money.mjs';

const { db, close } = openCipherDb(undefined, { readOnly: true });

async function login(email, password) {
  const user = db.prepare(`
    SELECT id, email, password_salt, password_hash
    FROM users
    WHERE email = ?
  `).get(email);

  if (!user || !user.password_hash) {
    return false;
  }

  return verifyPassword(password, user.password_salt, user.password_hash);
}

const tests = [
  ['ana@example.com', 'Password123!'],
  ['ana@example.com', 'password-equivocado'],
  ['carlos@example.com', 'Carlos123!']
];

for (const [email, password] of tests) {
  const ok = await login(email, password);
  console.log(`${email} / ${password} => ${ok ? 'LOGIN OK' : 'LOGIN FAILED'}`);
}

// --------------------------------------------------
// Demo del salt: Ana, Beatriz, Diego y Elena usan la MISMA contraseña
// ("Password123!"), sembrada así en 01-init-db.mjs. El login funciona igual
// para las 4 -- el salt no rompe la verificación -- pero cada una tiene un
// salt y un hash distintos en la base de datos, así que nada revela que
// comparten contraseña con solo ver password_hash.
// --------------------------------------------------

const sharedPasswordEmails = [
  'ana@example.com',
  'beatriz@example.com',
  'diego@example.com',
  'elena@example.com'
];

console.log('\n=== Mismo password ("Password123!") en 4 cuentas distintas ===\n');

for (const email of sharedPasswordEmails) {
  const ok = await login(email, 'Password123!');
  console.log(`${email} / Password123! => ${ok ? 'LOGIN OK' : 'LOGIN FAILED'}`);
}

const sharedPasswordRows = db.prepare(`
  SELECT
    email,
    substr(password_salt, 1, 20) || '...' AS salt_preview,
    substr(password_hash, 1, 24) || '...' AS hash_preview
  FROM users
  WHERE email IN (${sharedPasswordEmails.map(() => '?').join(', ')})
  ORDER BY id
`).all(...sharedPasswordEmails);

console.log('\nMismo password, pero salt y hash distintos para cada usuario:');
printTable('Password compartido: "Password123!"', sharedPasswordRows);

close();
