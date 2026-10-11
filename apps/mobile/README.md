# Terra Link Campo (móvil, P0-023)

Captura offline local para el técnico de campo: React Native + Expo SDK 57 (expo-sqlite, expo-file-system,
expo-secure-store, expo-location, expo-image-picker, expo-crypto). Proyecto **independiente** de los workspaces npm de
la raíz: no cambia la API ni la web, ni `npm run validate`.

**No hay sincronización** (P0-024): «Guardar en cola» guarda la captura y sus operaciones en el dispositivo; no envía nada.

## Comprobaciones locales (sin dispositivo)

```bash
cd apps/mobile
npm ci
npm run typecheck          # TypeScript
npm test                   # núcleo con SQLite real (node:sqlite) y archivos reales en Node
TL_API_SMOKE=1 npm test    # además, cliente en Node contra la API local (requiere app levantada y DEMO sembrado)
npx expo export --platform android --output-dir <carpeta temporal>   # el bundle Android compila
npx expo-doctor
```

Estas pruebas son evidencia **en Node**; no son emulador ni dispositivo.

## Ensayo en Android real (criterio obligatorio de P0-023, pendiente)

Requisitos: teléfono Android en la misma red Wi-Fi que el equipo, app **Expo Go** compatible con SDK 57.

1. En el equipo, con la app web/API levantada (`docker compose --profile app up -d --wait`), averigua la IP local
   (p. ej. `ipconfig` → IPv4, como `192.168.1.20`) y permite el puerto TCP 4000 en el firewall de Windows para redes privadas.
2. `cd apps/mobile && npm ci && npx expo start --lan` y escanea el QR con Expo Go.
3. En «Servidor» escribe `http://<IP>:4000`. Inicia sesión con `tecnico1.cooperativa@demo.terralink.local`
   (contraseña en el archivo local `CREDENCIALES.csv` más reciente; no la copies en informes).
4. Elige «DEMO · Cooperativa Río Verde» → «Descargar datos asignados» → «Nueva captura» → elige parcela.
5. Captura ubicación (prueba también denegando el permiso), toma 1–2 fotos, escribe una nota, «Guardar en cola».
   Crea además un borrador sin encolar.
6. Activa modo avión. Cierra la app desde recientes (forzar cierre), reinicia el teléfono, abre Expo Go y la app:
   «Pendientes» debe mostrar borrador, captura en cola, operaciones con el mismo identificador y fotos «en el dispositivo».
7. Sin red: crea otra captura (debe permitirse dentro de la ventana de 72 h) y comprueba que «Iniciar sesión» falla con
   mensaje de conexión.
8. Cierra sesión (debe avisar de capturas pendientes), entra con `tecnico2.cooperativa…`: no debe ver nada de tecnico1.
   Vuelve a tecnico1: sus capturas siguen.
9. «Diagnóstico»: en Expo Go la base aparece **SIN cifrar** (Expo Go no admite SQLCipher).
10. Registra modelo, versión de Android, versión de Expo Go, fecha, pasos con resultado y capturas de pantalla sin datos
    personales en `docs/qa/ENSAYO_ANDROID_P0-023.md`.

Para probar el cifrado (SQLCipher, `useSQLCipher` en `app.json`) hace falta un **build de desarrollo**
(`npx expo run:android` con Android SDK + JDK, o EAS Build). Para HTTP sin TLS en un build propio se requiere además
habilitar tráfico en claro solo para desarrollo. Ninguno se ejecutó en este equipo (no tiene Android SDK/JDK/adb).

## Diseño (resumen)

- `src/core`: puertos de plataforma, esquema SQLite, almacén por cuenta+organización, política de sesión provisional.
- `src/adapters/expo.ts`: adaptadores Expo. `src/app/session-manager.ts`: login online, dataset autorizado, device_id local.
- `src/ui`: pantallas (Inicio, Captura, Pendientes, Diagnóstico) con tokens de `docs/UX_UI.md` y controles ≥ 48 px.
- Contrato y política: `docs/11_OFFLINE_Y_SINCRONIZACION.md` (§ Implementación P0-023) y `docs/adr/0006-movil-offline.md`.
