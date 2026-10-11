import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { encryptionStatus, expoPlatform } from '../adapters/expo';
import { ApiFailure, SessionManager } from '../app/session-manager';
import { isStorageFull } from '../core/ports';
import { OFFLINE_CAPTURE_WINDOW_HOURS, type StoredSession } from '../core/session';
import type { DatasetPlot, DraftView, LocalStore, RecoveryReport } from '../core/store';
import { Badge, Button, Card, Field, Notice, T, s } from './kit';

// Pantallas P0-023 (UX_UI §21): inicio de sesión online → organización → preparación (datos asignados) → captura
// (ubicación, foto, nota) → pendientes → diagnóstico. No hay sincronización: P0-024.
const sessions = new SessionManager(expoPlatform);
const DEFAULT_API = process.env.EXPO_PUBLIC_API_URL ?? 'http://192.168.1.10:4000';
type Tab = 'home' | 'capture' | 'pending' | 'diag';

const fmt = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('es-EC') : '—');
const msg = (e: unknown) => (isStorageFull(e) ? (e as Error).message : e instanceof ApiFailure ? e.message : e instanceof Error ? e.message : 'Error inesperado.');

export function Root() {
  const [boot, setBoot] = useState(true);
  const [session, setSession] = useState<StoredSession | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [store, setStore] = useState<LocalStore | null>(null);
  const [recovery, setRecovery] = useState<RecoveryReport | null>(null);
  const [tab, setTab] = useState<Tab>('home');
  const [openDraft, setOpenDraft] = useState<string | null>(null);

  useEffect(() => { void sessions.load().then((x) => { setSession(x); setBoot(false); }); }, []);
  const chooseOrg = async (s0: StoredSession, id: string) => {
    if (store) await store.close();
    const st = await sessions.openStore(s0, id);
    setRecovery(await st.recover()); // al abrir: operaciones interrumpidas y archivos incompletos
    setStore(st); setOrgId(id); setTab('home');
  };
  const logout = async () => {
    if (store) await store.close();
    await sessions.logout();
    setStore(null); setOrgId(null); setSession(null);
  };

  if (boot) return <View style={s.screen}><Header sub="Cargando…" /></View>;
  if (!session) return <Login onDone={setSession} />;
  if (!orgId || !store) return <OrgPicker session={session} onPick={(id) => void chooseOrg(session, id)} onLogout={() => void logout()} />;
  const org = session.organizations.find((o) => o.organization_id === orgId);
  return (
    <View style={s.screen}>
      <Header sub={`${org?.name ?? ''} · ${session.email}`} />
      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        {tab === 'home' && <Home session={session} orgId={orgId} store={store} recovery={recovery} onCapture={(d) => { setOpenDraft(d); setTab('capture'); }} onSwitch={() => { setOrgId(null); }} onLogout={() => void logout()} />}
        {tab === 'capture' && <Capture session={session} orgId={orgId} store={store} draftId={openDraft} onDraft={setOpenDraft} onQueued={() => { setOpenDraft(null); setTab('pending'); }} />}
        {tab === 'pending' && <Pending store={store} onOpen={(d) => { setOpenDraft(d); setTab('capture'); }} />}
        {tab === 'diag' && <Diagnostics session={session} orgId={orgId} store={store} recovery={recovery} />}
      </ScrollView>
      <View style={s.tabs} accessibilityRole="tablist">
        {([['home', 'Inicio'], ['capture', 'Captura'], ['pending', 'Pendientes'], ['diag', 'Diagnóstico']] as const).map(([k, l]) => (
          <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: tab === k }} accessibilityLabel={l} style={[s.tab, tab === k && { borderTopWidth: 3, borderColor: T.forest }]} onPress={() => setTab(k)}>
            <Text style={[s.tabText, tab === k && { color: T.forest }]}>{l}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function Header({ sub }: { sub: string }) {
  return <View style={s.header}><Text accessibilityRole="header" accessibilityLabel="Terra Link" style={s.brand}>TERRA LINK</Text><Text style={s.sub}>{sub}</Text></View>;
}

function Login({ onDone }: { onDone: (x: StoredSession) => void }) {
  const [api, setApi] = useState(DEFAULT_API);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { void sessions.apiUrl(DEFAULT_API).then(setApi); }, []);
  const go = async () => {
    setBusy(true); setError(null);
    try { onDone(await sessions.login(api.trim(), email.trim(), password)); setPassword(''); } catch (e) { setError(msg(e)); } finally { setBusy(false); }
  };
  return (
    <View style={s.screen}>
      <Header sub="Captura de campo" />
      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        <Text accessibilityRole="header" style={s.h1}>Iniciar sesión</Text>
        <Notice tone="process" title="Requiere conexión">El inicio de sesión solo funciona con conexión. Después podrás capturar sin red durante un tiempo limitado; nada se envía hasta que exista la sincronización.</Notice>
        <Field label="Servidor (URL de la API)" value={api} onChangeText={setApi} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
        <Field label="Correo" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" />
        <Field label="Contraseña" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" />
        {error && <Notice tone="blocked" title="No se pudo iniciar sesión">{error}</Notice>}
        <Button label={busy ? 'Conectando…' : 'Iniciar sesión'} onPress={() => void go()} disabled={busy || !email || !password} />
      </ScrollView>
    </View>
  );
}

function OrgPicker({ session, onPick, onLogout }: { session: StoredSession; onPick: (id: string) => void; onLogout: () => void }) {
  return (
    <View style={s.screen}>
      <Header sub={session.email} />
      <ScrollView contentContainerStyle={s.body}>
        <Text accessibilityRole="header" style={s.h1}>Elige la organización</Text>
        <Text style={s.muted}>Cada organización tiene sus propios datos y capturas en este dispositivo; no se mezclan.</Text>
        {session.organizations.map((o) => <Button key={o.organization_id} kind="secondary" label={`${o.name} · ${o.roles.join(', ')}`} onPress={() => onPick(o.organization_id)} />)}
        {!session.organizations.length && <Notice tone="review">No tienes membresías activas.</Notice>}
        <Button kind="secondary" label="Cerrar sesión" onPress={onLogout} />
      </ScrollView>
    </View>
  );
}

function Home({ session, orgId, store, recovery, onCapture, onSwitch, onLogout }: { session: StoredSession; orgId: string; store: LocalStore; recovery: RecoveryReport | null; onCapture: (d: string | null) => void; onSwitch: () => void; onLogout: () => void }) {
  const [counts, setCounts] = useState<{ drafts: number; queued: number; pending_ops: number; photos: number } | null>(null);
  const [fetched, setFetched] = useState<string | null>(null);
  const [plots, setPlots] = useState(0);
  const [note, setNote] = useState<{ tone: 'valid' | 'blocked'; text: string } | null>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const gate = sessions.gate(session, orgId);
  const load = useCallback(async () => { setCounts(await store.counts()); setFetched(await store.datasetFetchedAt()); setPlots((await store.plots()).length); }, [store]);
  useEffect(() => { void load(); }, [load]);
  const download = async () => {
    setNote(null);
    try { const n = await sessions.downloadDataset(session, orgId, store); setNote({ tone: 'valid', text: `${n} parcela(s) autorizadas descargadas.` }); await load(); } catch (e) { setNote({ tone: 'blocked', text: msg(e) }); }
  };
  const pending = (counts?.drafts ?? 0) + (counts?.queued ?? 0);
  return (
    <>
      <Text accessibilityRole="header" style={s.h1}>Mi jornada</Text>
      {gate.allowed ? <Notice tone={gate.mode === 'OFFLINE_WINDOW' ? 'review' : 'valid'} title="Captura habilitada">{gate.note} Ventana local hasta {fmt(gate.until)}.</Notice>
        : <Notice tone="blocked" title="Captura bloqueada">{gate.note}</Notice>}
      {recovery && (recovery.recovered_operations.length > 0 || recovery.incomplete_temp_files.length > 0 || recovery.missing_files.length > 0) &&
        <Notice tone="review" title="Recuperación al abrir">{recovery.recovered_operations.length} operación(es) interrumpida(s) recuperada(s) con la misma identidad; {recovery.incomplete_temp_files.length} copia(s) de foto incompleta(s) descartada(s) (la foto no se había registrado); {recovery.missing_files.length} archivo(s) faltante(s).</Notice>}
      <Card title="Preparación">
        <Text style={s.p}>Parcelas asignadas en el dispositivo: {plots}</Text>
        <Text style={s.muted}>Última descarga: {fmt(fetched)}. Solo se descargan las parcelas que el servidor autoriza a tu cuenta en esta organización.</Text>
        {note && <Notice tone={note.tone}>{note.text}</Notice>}
        <Button kind="secondary" label="Descargar datos asignados (requiere conexión)" onPress={() => void download()} />
      </Card>
      <Card title="Capturas en este dispositivo">
        <Text style={s.p}>{counts?.drafts ?? 0} borrador(es) local(es) · {counts?.queued ?? 0} captura(s) en cola · {counts?.photos ?? 0} foto(s)</Text>
        <Badge tone="review">Sincronización no disponible todavía (P0-024)</Badge>
        <Button label="Nueva captura" disabled={!gate.allowed || plots === 0} onPress={() => onCapture(null)} hint={plots === 0 ? 'Primero descarga las parcelas asignadas' : undefined} />
      </Card>
      <Button kind="secondary" label="Cambiar de organización" onPress={onSwitch} />
      {!confirmLogout ? <Button kind="secondary" label="Cerrar sesión" onPress={() => setConfirmLogout(true)} /> : (
        <Card title="¿Cerrar sesión?">
          <Text style={s.p}>{pending > 0 ? `Tienes ${pending} captura(s) sin enviar. Se conservan en este dispositivo para esta cuenta y organización; otra cuenta no las verá. Para enviarlas más adelante tendrás que volver a iniciar sesión con esta cuenta.` : 'No hay capturas pendientes.'}</Text>
          <Button label="Cerrar sesión" onPress={onLogout} />
          <Button kind="secondary" label="Cancelar" onPress={() => setConfirmLogout(false)} />
        </Card>
      )}
    </>
  );
}

function Capture({ session, orgId, store, draftId, onDraft, onQueued }: { session: StoredSession; orgId: string; store: LocalStore; draftId: string | null; onDraft: (d: string) => void; onQueued: () => void }) {
  const [plots, setPlots] = useState<DatasetPlot[]>([]);
  const [draft, setDraft] = useState<DraftView | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const gate = sessions.gate(session, orgId);
  const reload = useCallback(async () => {
    setPlots(await store.plots());
    if (draftId) { const d = (await store.drafts()).find((x) => x.id === draftId) ?? null; setDraft(d); setNote(d?.note ?? ''); } else setDraft(null);
  }, [store, draftId]);
  useEffect(() => { void reload(); }, [reload]);
  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true); setError(null); setInfo(null);
    try { await fn(); if (ok) setInfo(ok); await reload(); } catch (e) { setError(msg(e)); } finally { setBusy(false); }
  };
  if (!gate.allowed && !draft) return <Notice tone="blocked" title="Captura bloqueada">{gate.note}</Notice>;
  if (!draftId) return (
    <>
      <Text accessibilityRole="header" style={s.h1}>Nueva captura</Text>
      <Text style={s.muted}>Elige la parcela. El borrador se guarda en el dispositivo desde el primer paso.</Text>
      {plots.map((p) => <Button key={p.id} kind="secondary" label={`${p.plot_code}${p.producer_code ? ` · ${p.producer_code}` : ''}${p.producer_display_name ? ` · ${p.producer_display_name}` : ''}`} onPress={() => void act(async () => onDraft(await store.createDraft(p.id)))} />)}
      {error && <Notice tone="blocked">{error}</Notice>}
    </>
  );
  if (!draft) return <Text style={s.muted}>Cargando borrador…</Text>;
  const editable = draft.status === 'DRAFT' && gate.allowed;
  const captureLocation = () => act(async () => {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) throw new Error('Permiso de ubicación denegado. Puedes concederlo en los ajustes del sistema; el borrador, la nota y las fotos se conservan y puedes encolar sin ubicación.');
    if (!(await Location.hasServicesEnabledAsync())) throw new Error('Los servicios de ubicación del dispositivo están desactivados. Actívalos y vuelve a intentarlo; el borrador se conserva.');
    const status = await Location.getProviderStatusAsync().catch(() => null);
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    await store.setLocation(draft.id, {
      latitude: loc.coords.latitude, longitude: loc.coords.longitude, accuracy_m: typeof loc.coords.accuracy === 'number' ? loc.coords.accuracy : null,
      acquired_at: new Date(loc.timestamp).toISOString(),
      provider_detail: `expo-location getCurrentPositionAsync(Accuracy.High); proveedor elegido por el sistema (no garantiza GPS); gpsAvailable=${status?.gpsAvailable ?? 'desconocido'}; networkAvailable=${status?.networkAvailable ?? 'desconocido'}`,
      mocked: typeof loc.mocked === 'boolean' ? loc.mocked : null,
    });
  }, 'Ubicación guardada en el borrador.');
  const takePhoto = () => act(async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error('Permiso de cámara denegado. Puedes concederlo en los ajustes; el borrador se conserva.');
    const r = await ImagePicker.launchCameraAsync({ quality: 0.8, exif: false });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    await store.addPhoto(draft.id, a.uri, a.mimeType ?? 'image/jpeg', new Date().toISOString());
  }, 'Foto copiada al almacenamiento persistente del dispositivo.');
  return (
    <>
      <Text accessibilityRole="header" style={s.h1}>Captura · {draft.plot_code ?? 'parcela'}</Text>
      <Badge tone={draft.status === 'DRAFT' ? 'neutral' : 'process'}>{draft.status === 'DRAFT' ? 'Borrador local' : 'En cola (pendiente de sincronización)'}</Badge>
      {!gate.allowed && <Notice tone="blocked">{gate.note}</Notice>}
      <Card title="Ubicación">
        {draft.location ? (
          <>
            <Text style={s.p}>Lat {draft.location.latitude.toFixed(6)} · Lon {draft.location.longitude.toFixed(6)}</Text>
            <Text style={s.p}>Precisión: {draft.location.accuracy_m === null ? 'no informada por el dispositivo' : `${Math.round(draft.location.accuracy_m)} m (informada)`}</Text>
            <Text style={s.muted}>Adquirida: {fmt(draft.location.acquired_at)} · registrada: {fmt(draft.location.recorded_at)}</Text>
            <Text style={s.muted}>Procedencia: servicio de ubicación del dispositivo (no se afirma GPS){draft.location.mocked ? ' · el sistema la marcó como simulada' : ''}</Text>
          </>
        ) : <Text style={s.muted}>Sin ubicación.</Text>}
        {editable && <Button kind="secondary" label={draft.location ? 'Volver a capturar ubicación' : 'Capturar ubicación'} onPress={() => void captureLocation()} disabled={busy} />}
      </Card>
      <Card title="Fotos">
        {draft.photos.length === 0 ? <Text style={s.muted}>Sin fotos.</Text> : draft.photos.map((p) => (
          <Text key={p.id} style={s.p}>{p.file_present ? '✓' : '⚠'} {Math.round(p.size_bytes / 1024)} KB · SHA-256 {p.sha256.slice(0, 10)}… · recibida {fmt(p.captured_at)}{p.file_present ? '' : ' · ARCHIVO FALTANTE'}</Text>
        ))}
        {editable && <Button kind="secondary" label="Tomar foto" onPress={() => void takePhoto()} disabled={busy} />}
      </Card>
      <Card title="Nota">
        {editable ? <Field label="Observación de campo" value={note} onChangeText={setNote} onEndEditing={() => void act(() => store.setNote(draft.id, note))} multiline maxLength={1000} /> : <Text style={s.p}>{draft.note || '—'}</Text>}
      </Card>
      {error && <Notice tone="blocked" title="No se completó">{error}</Notice>}
      {info && <Notice tone="valid">{info}</Notice>}
      {editable && <Button label="Guardar en cola" disabled={busy} onPress={() => void act(async () => { await store.setNote(draft.id, note); await store.enqueue(draft.id); onQueued(); })}
        hint="Guarda la captura y sus operaciones juntas en el dispositivo; no la envía" />}
      <Text style={s.muted}>«Guardar en cola» no envía nada: la sincronización llegará con P0-024.</Text>
    </>
  );
}

function Pending({ store, onOpen }: { store: LocalStore; onOpen: (d: string) => void }) {
  const [drafts, setDrafts] = useState<DraftView[] | null>(null);
  useEffect(() => { void store.drafts().then(setDrafts); }, [store]);
  if (!drafts) return <Text style={s.muted}>Cargando…</Text>;
  return (
    <>
      <Text accessibilityRole="header" style={s.h1}>Pendientes</Text>
      <Notice tone="review">Nada se ha enviado al servidor: no hay sincronización todavía (P0-024). Registro y fotos tienen estados separados.</Notice>
      {drafts.length === 0 && <Text style={s.muted}>No hay capturas en este dispositivo para esta cuenta y organización.</Text>}
      {drafts.map((d) => (
        <Card key={d.id} title={`${d.plot_code ?? 'Parcela'} · ${fmt(d.created_at)}`}>
          <Badge tone={d.status === 'DRAFT' ? 'neutral' : 'process'}>{d.status === 'DRAFT' ? 'Borrador local' : 'Pendiente (en cola)'}</Badge>
          <Text style={s.muted}>Ubicación: {d.location ? (d.location.accuracy_m === null ? 'sí (precisión no informada)' : `sí (±${Math.round(d.location.accuracy_m)} m)`) : 'no'} · Fotos: {d.photos.length} ({d.photos.filter((p) => p.file_present).length} en el dispositivo, sin subir)</Text>
          {d.operations.map((o) => <Text key={o.operation_id} style={s.muted}>{o.operation_type} · {o.state}{o.recovered_count ? ` · recuperada ${o.recovered_count} vez/veces` : ''} · {o.operation_id.slice(0, 8)}</Text>)}
          {d.status === 'DRAFT' && <Button kind="secondary" label="Continuar borrador" onPress={() => onOpen(d.id)} />}
        </Card>
      ))}
    </>
  );
}

function Diagnostics({ session, orgId, store, recovery }: { session: StoredSession; orgId: string; store: LocalStore; recovery: RecoveryReport | null }) {
  const [device, setDevice] = useState('');
  const [free, setFree] = useState<number | null>(null);
  useEffect(() => { void sessions.deviceId().then(setDevice); void expoPlatform.files.freeBytes().then(setFree); }, []);
  const enc = encryptionStatus();
  const gate = sessions.gate(session, orgId);
  return (
    <>
      <Text accessibilityRole="header" style={s.h1}>Diagnóstico</Text>
      <Card title="Protección local">
        <Badge tone={enc === 'SQLCIPHER_ACTIVE' ? 'valid' : 'blocked'}>{enc === 'SQLCIPHER_ACTIVE' ? 'Base local cifrada (SQLCipher)' : 'Base local SIN cifrar en esta compilación'}</Badge>
        <Text style={s.muted}>{enc === 'SQLCIPHER_ACTIVE' ? 'Clave por cuenta y organización en almacenamiento seguro (Android Keystore).' : 'Expo Go no admite SQLCipher: hace falta un build de desarrollo. Las fotos se guardan en el directorio privado de la app, sin cifrado adicional.'}</Text>
        <Text style={s.muted}>Token y clave de base: almacenamiento seguro del sistema. Almacén: {store.key.slice(0, 8)}… (cuenta + organización).</Text>
      </Card>
      <Card title="Sesión sin conexión (política provisional D-40)">
        <Text style={s.p}>Última autenticación con conexión: {fmt(session.last_online_auth_at)}</Text>
        <Text style={s.p}>Token emitido por el servidor vence: {fmt(session.token_expires_at)} (no se renueva sin red)</Text>
        <Text style={s.p}>Ventana local de captura: {OFFLINE_CAPTURE_WINDOW_HOURS} h {gate.allowed ? `· hasta ${fmt(gate.until)}` : '· vencida o bloqueada'}</Text>
        <Text style={s.muted}>Sin conexión no se detectan revocaciones, bajas ni cambios de permisos. Al sincronizar (P0-024) el servidor revalidará todo.</Text>
      </Card>
      <Card title="Dispositivo y almacenamiento">
        <Text style={s.p}>Identificador local del dispositivo: {device.slice(0, 8)}… (no autoriza nada)</Text>
        <Text style={s.p}>Espacio libre: {free === null ? 'desconocido' : `${Math.round(free / 1048576)} MB`}</Text>
        <Text style={s.muted}>Última recuperación: {recovery ? `${recovery.recovered_operations.length} operación(es) recuperada(s), ${recovery.incomplete_temp_files.length} temporal(es) incompleto(s), ${recovery.orphan_files.length} archivo(s) sin registro (se conservan), ${recovery.missing_files.length} faltante(s)` : '—'}</Text>
      </Card>
    </>
  );
}
