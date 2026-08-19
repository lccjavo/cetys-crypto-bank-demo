import { openEncryptedDb } from './lib/db.mjs';

const { db, close } = openEncryptedDb(undefined, { readOnly: true });

const sql =
  process.argv.slice(2).join(' ')
  || 'SELECT * FROM users';

// Demo: read queries only
if (!/^\s*(SELECT|WITH|PRAGMA)\b/i.test(sql)) {
  close();
  throw new Error(
    'Only SELECT, WITH and PRAGMA are allowed'
  );
}

const rows = db
  .prepare(sql)
  .all();

console.table(rows);

close();
