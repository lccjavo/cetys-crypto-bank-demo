# Crypto Bank Demo

Mini banco en SQLite + Node.js para demostrar:

- Datos planos en SQLite
- Cifrado de archivo SQLite con AES-256-GCM
- Password hashing con scrypt + salt (incluye 4 usuarios con la misma contraseña)
- Transferencias usando centavos enteros
- Integridad lógica mediante transacciones SQL
- Activity log con hash chain
- Firma digital Ed25519 para auditoría
- Detección de manipulación de registros
- Verificación de webhook con HMAC-SHA256 y secreto compartido
- Verificación de firma en un webhook externo simulado con Ed25519 (depósito OXXO/SPEI, contraste con HMAC)

## Requisitos

- Node.js 22.13+ recomendado, porque usamos `node:sqlite`.
- No requiere paquetes npm externos.

Verifica:

```bash
node --version
```

## Demo completa

```bash
node 01-init-db.mjs
node 02-show-db.mjs

export DB_SQLite_TEST_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
printenv DB_SQLite_TEST_KEY
node 03-encrypt-db.mjs
sqlite3 bank.db.enc "SELECT * FROM users;" # debe fallar
node 04-query-encrypted-db.mjs "SELECT * FROM users"
node 04-decrypt-db.mjs
node 02-show-db.mjs bank-restored.db

# A partir de aquí, todos los scripts operan sobre bank.db.enc:
# descifran a un archivo temporal, hacen su trabajo, y si hay
# cambios los vuelven a cifrar (nuevo IV) y persisten en bank.db.enc.
# bank.db / bank-restored.db quedan solo como snapshots de inspección manual.
# DB_SQLite_TEST_KEY debe seguir exportada en la sesión para todos
# los pasos siguientes.

node 05-hash-passwords.mjs   # hashea passwords y persiste en bank.db.enc
node 06-login-demo.mjs       # lee bank.db.enc (solo lectura)

node 07-transfer.mjs         # transfiere y persiste en bank.db.enc
node 08-show-audit.mjs       # lee bank.db.enc (solo lectura)
node 09-verify-audit.mjs     # lee bank.db.enc (solo lectura)

node 10-tamper-transfer.mjs  # manipula un transfer y persiste en bank.db.enc
node 09-verify-audit.mjs     # debe detectar manipulación

node 12-webhook-hmac-sign.mjs            # simula a un proveedor externo firmando un depósito con HMAC + secreto compartido
node 13-webhook-hmac-receive-deposit.mjs # verifica el HMAC y, si es válido, aplica el depósito
node 14-forge-webhook-hmac.mjs           # ataque: forja un depósito solo con el secreto filtrado, sin usar 12

node 15-webhook-sign-deposit.mjs     # misma idea, pero firmando con Ed25519 (llave privada/pública)
node 16-webhook-receive-deposit.mjs  # verifica la firma y, si es válida, aplica el depósito
```

## Ejemplo: mismo password, hash distinto (qué hace el salt)

`01-init-db.mjs` siembra 10 usuarios. Tres tienen contraseñas propias (Ana,
Carlos, Admin) y siete más se agregaron para tener un banco con más
movimiento — de esos, **Beatriz, Diego y Elena comparten a propósito la
misma contraseña que Ana: `Password123!`**.

```bash
node 01-init-db.mjs
node 05-hash-passwords.mjs
```

En la tabla que imprime `05-hash-passwords.mjs`, compara las columnas `salt`
y `hash` de `ana@example.com`, `beatriz@example.com`, `diego@example.com` y
`elena@example.com`: mismo password en texto plano, pero `password_salt` es
aleatorio y distinto por usuario (`scrypt(password, salt)`), así que el
`password_hash` resultante también es distinto para las 4 cuentas.

```bash
node 06-login-demo.mjs
```

Salida real de una corrida (los valores de `salt`/`hash` van a ser distintos
en tu máquina — se generan al azar en cada `05-hash-passwords.mjs`):

```
=== Mismo password ("Password123!") en 4 cuentas distintas ===

ana@example.com / Password123! => LOGIN OK
beatriz@example.com / Password123! => LOGIN OK
diego@example.com / Password123! => LOGIN OK
elena@example.com / Password123! => LOGIN OK

Mismo password, pero salt y hash distintos para cada usuario:

=== Password compartido: "Password123!" ===
┌─────────┬───────────────────────┬───────────────────────────┬───────────────────────────────┐
│ (index) │ email                 │ salt_preview              │ hash_preview                  │
├─────────┼───────────────────────┼───────────────────────────┼───────────────────────────────┤
│ 0       │ 'ana@example.com'     │ '4b088f16c5b2368f2177...' │ '3bf44f7279aa0c2ee37432a7...' │
│ 1       │ 'beatriz@example.com' │ '3938b0e3302761f11818...' │ '2341f1cd67c9b3ef193ea1a1...' │
│ 2       │ 'diego@example.com'   │ '4adf76106a296b43c02e...' │ '46d4ef918dfbe9699b020336...' │
│ 3       │ 'elena@example.com'   │ '6e221f409df73cd60d4a...' │ 'afdb57cc16351fbc0ec737f7...' │
└─────────┴───────────────────────┴───────────────────────────┴───────────────────────────────┘
```

El login funciona igual para las 4 (el salt se guarda junto al hash
precisamente para poder reproducir el cálculo al verificar), pero nada en
`password_hash` delata que comparten contraseña — a diferencia de un hash
sin salt (`sha256(password)` puro), donde las 4 filas serían idénticas y
cualquiera con acceso de lectura a la tabla vería de inmediato qué cuentas
usan la misma contraseña (o las buscaría en una rainbow table).

## Ejemplos de transferencias y manipulación

Saldos iniciales tras `01-init-db.mjs`: Ana $1,000.00 (cuenta 1), Carlos $500.00 (cuenta 2), Admin $0.00 (cuenta 3).

### Transferencias (cada una persiste en `bank.db.enc`)

```bash
node 07-transfer.mjs 1 2 25000      # Ana -> Carlos $250.00   => Ana $750 / Carlos $750 / Admin $0
node 07-transfer.mjs 2 3 10000      # Carlos -> Admin $100.00 => Ana $750 / Carlos $650 / Admin $100
node 07-transfer.mjs 1 3 50000      # Ana -> Admin $500.00    => Ana $250 / Carlos $650 / Admin $600

node 07-transfer.mjs 2 1 999999999  # falla a propósito: "Saldo insuficiente."
                                     # muestra que la transacción hace ROLLBACK limpio
                                     # (no se reescribe bank.db.enc si falla)
```

Revisar el estado en cualquier momento:

```bash
node 08-show-audit.mjs
node 09-verify-audit.mjs            # => VALID ✓
```

### Manipulación (tamper)

**A) Manipulación a nivel de fila** (editando el SQLite descifrado directamente, sin pasar por la lógica de la app):

```bash
node 10-tamper-transfer.mjs 2 500000   # reescribe el monto del transfer #2 a $5,000.00 y lo persiste en bank.db.enc
node 09-verify-audit.mjs               # => COMPROMISED ✗, señala exactamente el evento #2
                                        # (payload firmado dice $100 vs $5,000 en la DB), los eventos #1 y #3 siguen ✓
```

Este es el momento fuerte de la demo: el hash chain + la firma Ed25519 detectan una sola fila alterada aunque el atacante tenga acceso de escritura total a la base de datos ya descifrada.

**B) Manipulación a nivel de ciphertext** (alterando un byte del archivo cifrado, sin necesitar la llave):

```bash
node 11-tamper-ciphertext.mjs
mv bank.db.enc bank.db.enc.ok
cp bank-tampered.db.enc bank.db.enc
node 04-decrypt-db.mjs                 # falla: "Unsupported state or unable to authenticate data"
mv bank.db.enc.ok bank.db.enc          # restaurar
```

Buen contraste: este ataque falla en la capa criptográfica (auth tag de GCM) antes de que SQL entre en juego, una línea de defensa distinta y anterior a la del punto (A).

## Ejemplos de webhook con HMAC (secreto compartido)

Simula que un proveedor externo (OXXO, un banco emisor vía SPEI, etc.) le avisa
a nuestro banco que alguien depositó efectivo o hizo una transferencia a favor
de una cuenta. `12-webhook-hmac-sign.mjs` hace de proveedor externo (firma el
depósito); `13-webhook-hmac-receive-deposit.mjs` hace de nuestro banco (solo
confía en el depósito si el HMAC es válido).

A diferencia de las firmas Ed25519 que ya viste en `activity_log`
(`bank-private.pem` / `bank-public.pem`), aquí hay **un solo secreto
compartido** (`webhook-hmac-secret.txt`) en vez de un par de llaves: es HMAC-SHA256,
la forma más simple de autenticar un mensaje — quien tiene el secreto puede
firmar y verificar por igual. Es la misma propiedad que ya viste con
AES-256-GCM al cifrar `bank.db.enc`: un secreto simétrico, quien lo tiene
puede hacer las dos operaciones. Si `webhook-hmac-secret.txt` se filtra (log,
repo, variable de entorno mal protegida), cualquiera puede forjar depósitos
válidos — la siguiente sección contrasta esto con Ed25519, donde eso no pasa.

`webhook-hmac-secret.txt` no se genera en `01-init-db.mjs`; se crea solo la
primera vez que corres `12-webhook-hmac-sign.mjs`, y tampoco se borra al
reiniciar el banco — representa una identidad externa que no depende de
nuestra base de datos.

`13-webhook-hmac-receive-deposit.mjs` acepta los datos de dos formas — bueno
para mostrar en clase que el HMAC es lo único que importa, no el medio de
transporte:

- **Sin argumentos**: lee `webhook-hmac-deposit-request.json`, el archivo que
  escribió `12-webhook-hmac-sign.mjs` (simula el body que llegaría por HTTP).
- **Con argumentos** `<cuenta> <monto> <operacion> <firma>`: recibe los datos
  tecleados/pegados en consola — la línea exacta que imprime
  `12-webhook-hmac-sign.mjs` al final, lista para copiar y pegar.

### Depósito válido

```bash
node 12-webhook-hmac-sign.mjs 1 30000 ADD_FUNDS_HMAC_DEMO
```

Salida (la firma va a ser distinta en tu máquina — `webhook-hmac-secret.txt`
se genera al azar la primera vez que corres este script):

```
=== Proveedor externo: firmando depósito con HMAC-SHA256 (secreto compartido) ===

cuenta:     1
monto:      30000 ($300.00)
operacion:  ADD_FUNDS_HMAC_DEMO
firma:      8d877e0f3f61e1b504bccebe4b777c0612984b6acde20886ec53540ce771253d

Archivo generado: webhook-hmac-deposit-request.json (simula el body por HTTP)
```

```bash
node 13-webhook-hmac-receive-deposit.mjs
# => "HMAC verificado con webhook-hmac-secret.txt: VALIDO ✓"
# => Depósito aplicado. Cuenta 1: $1,000.00 -> $1,300.00
```

### Webhook con HMAC inválido (rechazado)

La forma más práctica para clase: generar una firma válida y luego cambiar
un solo valor a mano al pegarla — ni siquiera hace falta editar el archivo.

```bash
node 12-webhook-hmac-sign.mjs 1 30000 ADD_FUNDS_HMAC_DEMO
# copia la línea que imprime, pero cambia el monto (30000 -> 999999)
# dejando la firma tal cual:
node 13-webhook-hmac-receive-deposit.mjs 1 999999 ADD_FUNDS_HMAC_DEMO <firma-original>
```

Salida real:

```
=== Banco: recibiendo webhook HMAC (parámetros por consola) ===
HMAC verificado con webhook-hmac-secret.txt: INVALIDO ✗

RECHAZADO: el HMAC no corresponde a estos datos exactos con este secreto.
Cambiar un solo dígito de la cuenta, el monto, la operación o la firma
invalida todo el mensaje. No se modifica bank.db.enc.
```

También funciona editando `webhook-hmac-deposit-request.json` a mano (dentro
del campo `payload`, que es un string JSON, cambiar `"amount_cents":30000`
por otro valor) y corriendo `node 13-webhook-hmac-receive-deposit.mjs` sin
argumentos — útil para mostrar el caso "interceptaron el archivo en tránsito".

### Ataque: forjar un depósito con el secreto compartido

`14-forge-webhook-hmac.mjs` hace de atacante que nunca corrió
`12-webhook-hmac-sign.mjs` pero de algún modo se filtró
`webhook-hmac-secret.txt` (log, commit, variable de entorno mal protegida).
Con el algoritmo (HMAC-SHA256 sobre el JSON canónico) más ese secreto filtrado,
genera una firma "legítima" de un depósito de $1,000,000.00 a la cuenta del
Admin (cuenta 3) que nadie autorizó:

```bash
node 12-webhook-hmac-sign.mjs 1 30000 ADD_FUNDS_HMAC_DEMO   # deja el secreto "filtrado" en disco

node 14-forge-webhook-hmac.mjs 3 100000000 ADD_FUNDS_HMAC_DEMO
```

Salida real de una corrida (tu firma va a ser distinta, pero el resultado es
el mismo):

```
=== Atacante: forjando depósito solo con el secreto filtrado ===

cuenta:     3
monto:      100000000 ($1000000.00)
operacion:  ADD_FUNDS_HMAC_DEMO
firma:      b37ed65b0f63905f4a2ae5e05f1812e72ceda9600da471cb3c84fb7e1ca45db0 (indistinguible de una firma legítima)

Archivo generado: webhook-hmac-forged-request.json

Pruébalo contra el mismo verificador que usa el proveedor "legítimo":

node 13-webhook-hmac-receive-deposit.mjs 3 100000000 ADD_FUNDS_HMAC_DEMO b37ed65b0f63905f4a2ae5e05f1812e72ceda9600da471cb3c84fb7e1ca45db0
```

Copia y pega esa línea (con TU firma, no la de arriba) tal como la imprimió tu
propia corrida:

```bash
node 13-webhook-hmac-receive-deposit.mjs 3 100000000 ADD_FUNDS_HMAC_DEMO <tu-firma-forjada>
# => "HMAC verificado con webhook-hmac-secret.txt: VALIDO ✓"
# => Depósito aplicado. Cuenta 3 (Admin): $0.00 -> $1,000,000.00
```

El verificador nunca corrió `12-webhook-hmac-sign.mjs` y aun así aceptó el
depósito, porque no tiene forma de distinguir esta firma de una legítima.

Buena pregunta para discutir: ¿qué protege HMAC entonces, si no es "quién
firmó"? (Respuesta: integridad del mensaje frente a alguien que NO tiene el
secreto — no autenticación de origen entre dos partes que sí lo comparten.)
La siguiente sección muestra el mecanismo que sí resuelve eso: intenta este
mismo ataque contra `15`/`16-webhook-*-deposit.mjs` (Ed25519) sin
`webhook-private.pem` — no hay forma de lograrlo.

## Ejemplos de webhook externo con Ed25519 (depósitos)

Mismo escenario que la sección anterior (proveedor externo avisando un
depósito), pero cambiando el mecanismo de firma: `15-webhook-sign-deposit.mjs`
y `16-webhook-receive-deposit.mjs` usan Ed25519 (llave privada firma, llave
pública verifica) en vez de HMAC.

Dos identidades separadas entran en juego:

- `bank-private.pem` / `bank-public.pem` — del banco, firma el `activity_log`.
- `webhook-private.pem` / `webhook-public.pem` — del proveedor externo, firma
  los depósitos. **Nunca deben ser el mismo par de llaves**: si lo fueran, no
  estaríamos demostrando nada — el banco confiaría en un mensaje solo porque
  se firmó a sí mismo.

La diferencia clave frente a la sección anterior: con Ed25519 hay dos
mitades — la llave privada firma, la pública solo verifica, y filtrar
`webhook-public.pem` no le sirve a un atacante para firmar nada (a diferencia
de `webhook-hmac-secret.txt`, donde tener el secreto alcanza para firmar y
verificar por igual).

`webhook-private.pem` / `webhook-public.pem` no se generan en `01-init-db.mjs`;
se crean solos la primera vez que corres `15-webhook-sign-deposit.mjs`, y **no**
se borran al reiniciar el banco — representan una identidad externa que no
depende de nuestra base de datos.

`16-webhook-receive-deposit.mjs` acepta los datos de dos formas — bueno para
mostrar en clase que la firma es lo único que importa, no el medio de transporte:

- **Sin argumentos**: lee `webhook-deposit-request.json`, el archivo que
  escribió `15-webhook-sign-deposit.mjs` (simula el body que llegaría por HTTP).
- **Con argumentos** `<cuenta> <monto> <operacion> <firma>`: recibe los datos
  tecleados/pegados en consola — la línea exacta que imprime
  `15-webhook-sign-deposit.mjs` al final, lista para copiar y pegar.

### Depósito válido (modo archivo)

```bash
node 15-webhook-sign-deposit.mjs 1 30000 ADD_FUNDS_OXXO   # OXXO deposita $300.00 en cuenta 1
```

Salida real de una corrida (la firma depende de `webhook-private.pem`, que se
genera al azar la primera vez que corres este script, así que la tuya va a
ser distinta):

```
=== Proveedor externo: firmando depósito con webhook-private.pem ===

cuenta:     1
monto:      30000 ($300.00)
operacion:  ADD_FUNDS_OXXO
firma:      CGzxRCMyK9K9CYixs9KSiGlRyP3oi6RjIQyRka+73wkikpbyDS1oXew5IU+a/e72e1u5LeR7bzEhz5ooQaPECQ==

Archivo generado: webhook-deposit-request.json (simula el body por HTTP)
```

```bash
node 16-webhook-receive-deposit.mjs                        # lee el .json, firma válida => se aplica
# => "Firma verificada con webhook-public.pem: VALIDA ✓"
# => Depósito aplicado. Cuenta 1: $1,000.00 -> $1,300.00

node 15-webhook-sign-deposit.mjs 2 100000 ADD_FUNDS_SPEI   # banco deposita $1,000.00 en cuenta 2 vía SPEI
node 16-webhook-receive-deposit.mjs
```

### Depósito válido (modo consola — para dictarlo en vivo)

```bash
node 15-webhook-sign-deposit.mjs 1 30000 ADD_FUNDS_OXXO
# imprime al final algo como:
# node 16-webhook-receive-deposit.mjs 1 30000 ADD_FUNDS_OXXO CGzxRCMy...PECQ==

# copia y pega esa línea completa tal cual — simula que alguien "te dictó"
# los datos que le llegaron del proveedor externo
node 16-webhook-receive-deposit.mjs 1 30000 ADD_FUNDS_OXXO CGzxRCMy...PECQ==
```

### Webhook con firma inválida (rechazado)

La forma más práctica para clase: generar una firma válida y luego cambiar
un solo valor a mano al pegarla — ni siquiera hace falta editar el archivo.

```bash
node 15-webhook-sign-deposit.mjs 1 30000 ADD_FUNDS_OXXO
# copia la línea que imprime, pero cambia el monto (30000 -> 999999)
# dejando la firma tal cual como venía:
node 16-webhook-receive-deposit.mjs 1 999999 ADD_FUNDS_OXXO <firma-original>
```

Salida real:

```
=== Banco: recibiendo webhook (parámetros por consola) ===
Firma verificada con webhook-public.pem: INVALIDA ✗

RECHAZADO: la firma no corresponde a estos datos exactos.
Cambiar un solo dígito de la cuenta, el monto, la operación o la
firma invalida todo el mensaje. No se modifica bank.db.enc.
```

También funciona editando `webhook-deposit-request.json` a mano (dentro del
campo `payload`, que es un string JSON, cambiar `"amount_cents":30000` por
otro valor) y corriendo `node 16-webhook-receive-deposit.mjs` sin argumentos —
útil para mostrar el caso "interceptaron el archivo en tránsito".

### Reiniciar la demo

No existe un script para "desmanipular" (es intencional: la manipulación debe ser irreversible sin dejar evidencia). Para volver a un estado limpio, vuelve a correr el bloque de `Demo completa` desde el inicio; `01-init-db.mjs` borra `bank.db`, `bank.db.enc` y las llaves de firma antes de regenerar todo.

## Notas para clase

Los montos están en centavos enteros:

- $1,000.00 = 100000
- $500.00 = 50000
- $250.00 = 25000

Esto evita problemas de punto flotante en operaciones monetarias.

`16-webhook-receive-deposit.mjs` aplica el depósito al saldo pero, a
propósito, **no** lo encadena en `activity_log` como sí hacen las
transferencias. Buena pregunta para la clase: ¿qué le agregarías para que un
depósito manipulado después de aplicado también sea detectable, igual que en
`10-tamper-transfer.mjs`?
