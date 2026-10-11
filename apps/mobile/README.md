# Terra Link Campo (móvil, P0-023/P0-024)

Captura de campo con almacenamiento local y sincronización: React Native + Expo SDK 57 (expo-sqlite, expo-file-system,
expo-secure-store, expo-location, expo-image-picker, expo-crypto, expo-constants). Proyecto **independiente** de los
workspaces npm de la raíz: no cambia `npm run validate`.

- **Operaciones que sincroniza**: muestra de ubicación de una parcela (`PLOT_LOCATION_SAMPLE_CREATE`) y foto de parcela
  (`PLOT_PHOTO_ATTACH`, la nota viaja como leyenda). **No** cubre productores, entregas, recepciones, lotes ni inventario.
- **Sesión**: inicio solo con conexión; la captura termina cuando vence la sesión emitida por el servidor (1 h). No se
  renueva ni se prolonga sin red; al vencer, lo guardado se conserva y sigue visible.
- **Entornos**: Expo Go = prueba **sin cifrado**, solo organizaciones DEMO con datos sintéticos. Build nativo = exige
  SQLCipher: si no se inicializa, el almacén no se abre (no descarga ni guarda datos).

## Comprobaciones reproducibles (sin dispositivo)

```bash
npm run check --prefix apps/mobile            # typecheck, núcleo (Node + SQLite real), bundle Android, expo-doctor
npm run check --prefix apps/mobile -- --api   # + recorrido contra la API local levantada con DEMO sembrado
```

Resultados en `validation-results/<fecha>-movil/`. Es evidencia **en Node**: no es emulador, build nativo ni dispositivo.

## A. Prueba limitada en Android con Expo Go (sin cifrado, datos sintéticos)

1. App web/API levantada (`docker compose --profile app up -d --wait`); IP local del equipo (`ipconfig`) y puerto TCP
   4000 permitido en el firewall de Windows para redes privadas.
2. `cd apps/mobile && npm ci && npx expo start --lan`; escanea el QR con Expo Go (SDK 57).
3. Servidor `http://<IP>:4000`; usuario `tecnico1.cooperativa@demo.terralink.local` (contraseña en tu `CREDENCIALES.csv`
   local más reciente; no la copies en informes). Organización «DEMO · Cooperativa Río Verde».
4. «Descargar datos asignados» → «Nueva captura» → ubicación (prueba también denegar el permiso), 1–2 fotos, nota →
   «Guardar en cola». Deja además un borrador sin encolar.
5. Modo avión → forzar cierre → reiniciar el teléfono → abrir: borrador, cola (mismos identificadores) y fotos siguen.
6. Con red: «Sincronizar ahora». Comprueba en Pendientes «Sincronizado» y el estado propio de cada foto («análisis
   pendiente» / «disponible»). En la web, la parcela muestra la nueva versión de geometría y el documento «Fotografía de campo».
7. Espera a que venza la sesión (1 h): la captura nueva se bloquea y lo guardado sigue visible.
8. Cierra sesión (avisa de pendientes) y entra con `tecnico2.cooperativa…`: no ve nada de tecnico1.
9. Revoca el dispositivo desde la API (`POST /devices/{id}/revoke` como administrador): «Sincronizar ahora» se detiene con
   «dispositivo revocado» y conserva todo.

## B. Build nativo de aceptación (cifrado) — no ejecutado en este equipo

Requiere Android SDK + JDK 17 + `adb` (o una cuenta de EAS). `app.json` ya activa `useSQLCipher` en el plugin de
expo-sqlite.

- Local: `cd apps/mobile && npx expo prebuild --platform android && npx expo run:android --variant debug` con el teléfono
  conectado por USB (depuración activada). Para HTTP sin TLS hacia la API local en un build propio, habilitar tráfico en
  claro solo en desarrollo (p. ej. `expo-build-properties` → `android.usesCleartextTraffic: true`) o usar HTTPS.
- EAS: `npx eas build --platform android --profile development` (requiere `eas.json` y cuenta; no incluido).
- Verificación: «Diagnóstico» debe mostrar «Base local cifrada (SQLCipher)». Prueba de rechazo: un build nativo sin
  SQLCipher debe mostrar «Almacenamiento protegido no disponible» y no descargar datos.
- Repetir los pasos A.4–A.9 y registrar modelo, versión de Android, build, fecha, resultados y capturas sin datos
  personales en `docs/qa/ENSAYO_ANDROID_P0-023.md`.

## Diseño

- `src/core`: puertos, esquema SQLite (fotos como BLOB dentro de la base), almacén por cuenta+organización, sesión,
  hash canónico de operaciones y motor de sincronización.
- `src/adapters/expo.ts`: SQLite (+SQLCipher), archivos, almacenamiento seguro, detección Expo Go/build nativo, subida.
- `src/app`: sesión online, dispositivo registrado en el servidor, transporte HTTP. `src/ui`: pantallas.
- Contratos: `docs/11_OFFLINE_Y_SINCRONIZACION.md`; decisión: `docs/adr/0006-movil-offline.md`.
