import { openEncryptedDb } from './lib/db.mjs';
import { printTable } from './lib/money.mjs';

const { db, close } = openEncryptedDb(undefined, { readOnly: true });

const logs = db.prepare(`
  SELECT
    id,
    event_type,
    transfer_id,
    previous_hash,
    event_hash,
    substr(signature, 1, 32) || '...' AS signature,
    payload,
    created_at
  FROM activity_log
  ORDER BY id
`).all();

printTable('Activity Log', logs);

close();
