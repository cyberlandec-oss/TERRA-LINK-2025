# Terra Link Campo (móvil, P0-023/P0-024)

Captura de campo con almacenamiento local y sincronización: React Native + Expo SDK 57 (expo-sqlite, expo-file-system,
expo-secure-store, expo-location, expo-image-picker, expo-crypto, expo-constants). Proyecto **independiente** de los
workspaces npm de la raíz: no cambia `npm run validate`.

- **Operaciones que sincroniza**: muestra de ubicación de una parcela (`PLOT_LOCATION_SAMPLE_CREATE`) y foto de parcela
  (`PLOT_PHOTO_ATTACH`, la nota viaja como leyenda). **No** cubre productores, entregas, recepciones, lotes ni inventario.
- **Sesión**: inicio solo con conexión; la captura termina cuando vence la sesión emitida por el servidor (1 h). No se
  renueva ni se prolonga sin red; al vencer, lo guardado se conserva y sigue visible.
- **Entornos**: Expo Go = prueba **sin cifrado** limitada a **fixtures sintéticos** (la app no usa la cámara ni la
  ubicación reales en Expo Go). Pertenecer a una organización DEMO no vuelve sintética una foto o ubicación real.
  Build nativo = exige SQLCipher: si no se inicializa, el almacén no se abre (no descarga ni guarda datos). El ensayo con
  fotos y ubicación reales se hace **solo** con el build nativo.
- **Fotos (D-41)**: dato personal; se quitan EXIF/XMP/IPTC antes de guardar; el servidor rechaza fotos con metadatos.

## Comprobaciones reproducibles (sin dispositivo)

```bash
npm run check --prefix apps/mobile            # typecheck, núcleo (Node + SQLite real), bundle Android, expo-doctor
npm run check --prefix apps/mobile -- --api   # + recorrido contra la API local levantada con DEMO sembrado
```

Resultados en `validation-results/<fecha>-movil/`. Es evidencia **en Node**: no es emulador, build nativo ni dispositivo.

## A. Prueba limitada con Expo Go (sin cifrado, solo fixtures)

1. App web/API levantada (`docker compose --profile app up -d --wait`); IP local del equipo (`ipconfig`) y puerto TCP
   4000 permitido en el firewall de Windows para redes privadas.
2. `cd apps/mobile && npm ci && npx expo start --lan`; escanea el QR con Expo Go (SDK 57).
3. Servidor `http://<IP>:4000`; usuario `tecnico1.cooperativa@demo.terralink.local` (contraseña en tu `CREDENCIALES.csv`
   local más reciente; no la copies en informes). Organización «DEMO · Cooperativa Río Verde».
4. «Descargar datos asignados» → «Nueva captura» → «Usar ubicación de prueba (sintética)» y «Usar foto de prueba
   (sintética)» → «Guardar en cola». (En Expo Go no hay botones de cámara ni ubicación real.)
5. Modo avión → forzar cierre → reiniciar el teléfono → abrir: borrador, cola y fotos de prueba siguen.
6. Con red: «Sincronizar ahora» → Pendientes: «Sincronizado» y estado de la foto («análisis pendiente» / «disponible»).
7. Cambio de cuenta (`tecnico2…`): no ve nada de tecnico1. Revocación del dispositivo: la sincronización se detiene.

## B. Build nativo de aceptación (cifrado) — generado en este equipo; autoprueba aprobada en emulador; teléfono físico pendiente

Requiere Android SDK + JDK 17 + `adb` (o una cuenta de EAS). `app.json` ya activa `useSQLCipher` en el plugin de
expo-sqlite.

- Local: `cd apps/mobile && npx expo prebuild --platform android && npx expo run:android --variant debug` con el teléfono
  conectado por USB (depuración activada). Para HTTP sin TLS hacia la API local en un build propio, habilitar tráfico en
  claro solo en desarrollo (p. ej. `expo-build-properties` → `android.usesCleartextTraffic: true`) o usar HTTPS.
- EAS: `npx eas build --platform android --profile development` (requiere `eas.json` y cuenta; no incluido).
- Verificación: «Diagnóstico» debe mostrar «Base local cifrada (SQLCipher)». Prueba de rechazo: un build nativo sin
  SQLCipher debe mostrar «Almacenamiento protegido no disponible» y no descargar datos.
- **El APK disponible (`apps/mobile/dist-apk/terra-link-campo-aceptacion-43f26c95.apk`) NO es apto para el ensayo físico**: contiene el defecto de transacción con SQLCipher hallado en el emulador (corregido en código, pendiente de recompilar). Tras recompilar, copiar el APK a `apps/mobile/dist-apk/` con su hash y registrar el SHA-256 completo.
- Ruta de compilación: `apps/mobile/android/app/build/outputs/apk/release/app-release.apk` (regenerable con `npx expo prebuild --platform android --no-install` y `cd android && gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a,x86_64`). Instalar con `adb install -r app-release.apk`.
- Autoprueba en el teléfono: «Diagnóstico» → «Ejecutar autoprueba de seguridad», o `adb shell am start -a android.intent.action.VIEW -d "terralinkcampo://autoprueba" ec.agtech.terralink.campo`; todos los casos deben salir «Correcto».
- Teléfono físico: activar «Opciones de desarrollador» → «Depuración USB», conectar por USB, aceptar la huella del
  equipo, comprobar con `adb devices`. Para la API local: `adb reverse tcp:4000 tcp:4000` y servidor `http://localhost:4000`.
- Ensayo real (solo aquí): capturar ubicación real (y denegando el permiso), fotos reales (comprobar en la web que el
  documento no conserva EXIF), cierre forzado, reinicio, esperar el vencimiento de la sesión (1 h), cambio de cuenta,
  almacenamiento casi lleno (llenar con un archivo grande y reintentar una foto), sincronizar, provocar un conflicto
  (editar la geometría de la parcela en la web antes de sincronizar) y resolverlo con «Reenviar sobre la versión actual».
- Registrar modelo, versión de Android, build, fecha, resultados y capturas sin datos
  personales en `docs/qa/ENSAYO_ANDROID_P0-023.md`.

## Diseño

- `src/core`: puertos, esquema SQLite (fotos como BLOB dentro de la base), almacén por cuenta+organización, sesión,
  hash canónico de operaciones y motor de sincronización.
- `src/adapters/expo.ts`: SQLite (+SQLCipher), archivos, almacenamiento seguro, detección Expo Go/build nativo, subida.
- `src/app`: sesión online, dispositivo registrado en el servidor, transporte HTTP. `src/ui`: pantallas.
- Contratos: `docs/11_OFFLINE_Y_SINCRONIZACION.md`; decisión: `docs/adr/0006-movil-offline.md`.
