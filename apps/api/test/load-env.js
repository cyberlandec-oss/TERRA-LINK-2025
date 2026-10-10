// Carga ../../.env si existe (sin imprimir valores) sin sobrescribir variables ya definidas.
// Las pruebas de integración usan TEST_DATABASE_URL; si falta, se omiten y Jest lo reporta como skipped.
const fs = require('fs');
const path = require('path');
const file = path.resolve(__dirname, '../../../.env');
if (fs.existsSync(file)) {
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}
