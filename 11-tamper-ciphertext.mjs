import fs from 'node:fs';

const inputPath = 'bank.db.enc';
const outputPath = 'bank-tampered.db.enc';

if (!fs.existsSync(inputPath)) {
  console.error('No existe bank.db.enc. Ejecuta primero node 03-encrypt-db.mjs');
  process.exit(1);
}

const buffer = fs.readFileSync(inputPath);
const copy = Buffer.from(buffer);

// Alteramos un byte dentro del ciphertext, dejando IV y auth tag intactos.
const index = 40;
copy[index] = copy[index] ^ 0xff;

fs.writeFileSync(outputPath, copy);

console.log('Archivo cifrado alterado.');
console.log(`Original: ${inputPath}`);
console.log(`Alterado: ${outputPath}`);
console.log('\nPara probarlo:');
console.log('mv bank.db.enc bank.db.enc.ok');
console.log('cp bank-tampered.db.enc bank.db.enc');
console.log('node 04-decrypt-db.mjs');
console.log('mv bank.db.enc.ok bank.db.enc');
