export function centsToMoney(cents, currency = 'MXN') {
  const value = Number(cents) / 100;
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency
  }).format(value);
}

export function printTable(title, rows) {
  console.log(`\n=== ${title} ===`);
  console.table(rows);
}
