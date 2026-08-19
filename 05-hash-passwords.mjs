import { openEncryptedDb } from './lib/db.mjs';
import { hashPassword } from './lib/crypto-utils.mjs';
import { printTable } from './lib/money.mjs';

const { db, persist } = openEncryptedDb();

const users = db.prepare(`
  SELECT id, email, password_plain
  FROM users
  WHERE password_plain IS NOT NULL
  ORDER BY id
`).all();

if (users.length === 0) {
  console.log('No hay passwords en texto plano por migrar.');
  db.close();
  process.exit(0);
}

const update = db.prepare(`
  UPDATE users
  SET
    password_plain = NULL,
    password_salt = ?,
    password_hash = ?,
    password_algorithm = ?,
    password_params = ?
  WHERE id = ?
`);

for (const user of users) {
  const result = await hashPassword(user.password_plain);

  update.run(
    result.salt,
    result.hash,
    result.algorithm,
    result.params,
    user.id
  );

  console.log(`Password migrado para ${user.email}`);
}

const after = db.prepare(`
  SELECT
    id,
    email,
    password_plain,
    password_algorithm,
    password_params,
    substr(password_salt, 1, 16) || '...' AS salt,
    substr(password_hash, 1, 24) || '...' AS hash
  FROM users
  ORDER BY id
`).all();

printTable('Usuarios después de hashear passwords', after);

persist();
console.log('\nCambios cifrados y guardados de nuevo en bank.db.enc.');
