import { randomUUID, verify, createPublicKey } from 'crypto';
import { sql } from 'kysely';
import { describeDb, setupHarness, PASSWORD } from './helpers';

describeDb('Campo PWA: productor propio, firma, idempotencia e historial',()=>{
  let h:Awaited<ReturnType<typeof setupHarness>>;let org:string;let grant:Record<string,unknown>;let userId:string;
  const actor='field-producer@test.local';const admin='field-admin@test.local';const device=randomUUID();
  const base=()=>`/api/v1/organizations/${org}/field-offline`;
  beforeAll(async()=>{
    h=await setupHarness();
    await h.user('super-field@test.local','SUPER_ADMIN');await h.login('super-field@test.local');
    org=(await h.http().post('/api/v1/organizations').set(h.as('super-field@test.local')).send({name:'Campo PWA sintético',organization_type:'COOPERATIVE',country:'EC'}).expect(201)).body.id;
    const invitation=(await h.http().post(`/api/v1/organizations/${org}/invitations`).set(h.as('super-field@test.local')).send({email:admin,role_code:'ORG_ADMIN'}).expect(201)).body;
    await h.http().post('/api/v1/invitations/accept').send({token:invitation.token,first_name:'Admin',last_name:'Campo',password:PASSWORD}).expect(200);await h.login(admin);
    const p=(await h.http().post(`/api/v1/organizations/${org}/producers`).set(h.as(admin)).send({producer_code:'FIELD-OWN',legal_name:'Productor sintético campo'}).expect(201)).body;
    const inv=(await h.http().post(`/api/v1/organizations/${org}/invitations`).set(h.as(admin)).send({email:actor,role_code:'PRODUCER'}).expect(201)).body;
    await h.http().post('/api/v1/invitations/accept').send({token:inv.token,first_name:'Campo',last_name:'Sintético',password:PASSWORD}).expect(200);await h.login(actor);
    const member=await h.db.selectFrom('memberships as m').innerJoin('users as u','u.id','m.user_id').select(['m.id','u.id as user_id']).where('u.email','=',actor).where('m.organization_id','=',org).executeTakeFirstOrThrow();userId=member.user_id;
    await h.http().put(`/api/v1/organizations/${org}/producers/${p.id}/self-membership`).set(h.as(admin)).send({expected_version:p.row_version,membership_id:member.id,reason:'Prueba sintética de campo PWA'}).expect(200);
    grant=(await h.http().post(`${base()}/prepare`).set(h.as(actor)).send({device_id:device}).expect(201)).body.grant;
  });
  afterAll(async()=>h?.close());
  const operation=(over:Record<string,unknown>={})=>({operation_id:randomUUID(),grant_id:(grant.payload as {id:string}).id,plot_code:'FIELD-TEST-1',crop:'Cacao',base_version:null,geometry:{type:'Point',coordinates:[-80.078,-1.244]},captured_at:new Date().toISOString(),reason:'Captura sintética de prueba',samples:[],...over});
  const send=(ops:unknown[],dev=device)=>h.http().post(`${base()}/sync`).set(h.as(actor)).send({device_id:dev,operations:ops}).expect(201);
  it('firma de campo separada, 24 horas y sin facultad de iniciar sesión',async()=>{
    const p=grant.payload as {user_id:string;issued_at:string;expires_at:string};expect(p.user_id).toBe(userId);expect(Date.parse(p.expires_at)-Date.parse(p.issued_at)).toBe(24*3600000);
    expect(verify('sha256',Buffer.from(JSON.stringify(p)),{key:createPublicKey({key:grant.public_key as {kty:string},format:'jwk'}),dsaEncoding:'ieee-p1363'},Buffer.from(grant.signature as string,'base64url'))).toBe(true);
    await h.http().get('/api/v1/me').set('authorization',`Bearer ${grant.signature}`).expect(401);
    await h.http().post(`${base()}/prepare`).set(h.as(admin)).send({device_id:randomUUID()}).expect(403);
  });
  it('punto, respuesta perdida/reintento y perímetro completan mismo ID sin duplicar versiones',async()=>{
    const point=operation();const one=(await send([point])).body.results[0];expect(one.status).toBe('ACCEPTED');
    const duplicate=(await send([point])).body.results[0];expect(duplicate).toMatchObject({status:'DUPLICATE',plot_id:one.plot_id,row_version:one.row_version});
    const perimeter=operation({previous_operation_id:point.operation_id,geometry:{type:'Polygon',coordinates:[[[-80.078,-1.244],[-80.077,-1.244],[-80.077,-1.243],[-80.078,-1.244]]]}});
    const two=(await send([perimeter])).body.results[0];expect(two).toMatchObject({status:'ACCEPTED',plot_id:one.plot_id});
    await send([perimeter]);
    const count=await sql<{n:string}>`SELECT count(*) n FROM plot_versions WHERE organization_id=${org} AND plot_id=${one.plot_id}`.execute(h.db);expect(Number(count.rows[0].n)).toBe(2);
    const changed=(await send([{...point,reason:'Contenido distinto para mismo identificador'}])).body.results[0];expect(changed).toMatchObject({status:'CONFLICT',code:'OPERATION_CONTENT_CHANGED'});
  });
  it('no pisa versiones divergentes ni admite geometría ajena o autorizaciones inexistentes',async()=>{
    expect((await send([operation({base_version:1})])).body.results[0]).toMatchObject({status:'CONFLICT',code:'VERSION_CONFLICT'});
    expect((await send([operation({plot_code:'UNKNOWN',grant_id:randomUUID()})])).body.results[0]).toMatchObject({status:'REJECTED',code:'FIELD_GRANT_INVALID'});
    const other=(await h.http().post(`/api/v1/organizations/${org}/producers`).set(h.as(admin)).send({producer_code:'FIELD-OTHER',legal_name:'Ajeno sintético'}).expect(201)).body;
    await h.http().post(`/api/v1/organizations/${org}/plots`).set(h.as(admin)).send({producer_id:other.id,plot_code:'FIELD-OTHER-PLOT',crop:'Cacao'}).expect(201);
    expect((await send([operation({plot_code:'FIELD-OTHER-PLOT'})])).body.results[0]).toMatchObject({status:'REJECTED',code:'PLOT_NOT_AVAILABLE'});
  });
  it('captura fuera de vigencia y dispositivo revocado son rechazados al reconectar',async()=>{
    expect((await send([operation({captured_at:'2020-01-01T00:00:00.000Z'})])).body.results[0].status).toBe('REJECTED');
    const deviceId=(grant.payload as {server_device_id:string}).server_device_id;
    await h.http().post(`/api/v1/organizations/${org}/devices/${deviceId}/revoke`).set(h.as(actor)).send({reason:'Revocación sintética del dispositivo'}).expect(200);
    await h.http().post(`${base()}/sync`).set(h.as(actor)).send({device_id:device,operations:[operation()]}).expect(403);
  });
});
