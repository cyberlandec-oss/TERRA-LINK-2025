import { Body, Controller, Inject, Injectable, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsISO8601, IsNumber, IsObject, IsOptional, IsString, IsUUID, Length, Matches, Min, Max, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { createHash, createPrivateKey, generateKeyPairSync, randomUUID, sign } from 'crypto';
import { sql, type Kysely } from 'kysely';
import { DB } from '../db/database';
import type { Database } from '../db/schema';
import { AuthorizationService } from '../authz/authorization.service';
import { CurrentUser, type AuthUser } from '../auth/auth';
import { AppError, conflict, forbidden, notFound } from '../common/errors';
import { PII_CIPHER, PiiCipher } from '../crypto/pii';
import { PlotsService } from '../plots/plots';
import { structuralIssues } from '../plots/geometry';
import { SyncService } from './sync';
import { AuditService } from '../audit/audit.service';

class PrepareFieldDto { @ApiProperty() @IsUUID() device_id!: string }
class FieldSampleDto {
  @ApiProperty() @IsNumber() @Min(-180) @Max(180) longitude!:number;
  @ApiProperty() @IsNumber() @Min(-90) @Max(90) latitude!:number;
  @ApiProperty({nullable:true}) @IsOptional() @IsNumber() @Min(0) accuracy_m!:number|null;
  @ApiProperty() @IsISO8601({strict:true}) captured_at!:string;
}
class FieldOperation {
  @ApiProperty() @IsUUID() operation_id!: string;
  @ApiProperty() @IsUUID() grant_id!: string;
  @ApiProperty() @Matches(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,39}$/) plot_code!: string;
  @ApiProperty() @IsString() @Length(1,60) crop!: string;
  @ApiProperty({nullable:true}) @IsOptional() @IsInt() @Min(1) base_version!: number | null;
  @ApiProperty({required:false}) @IsOptional() @IsUUID() previous_operation_id?: string;
  @ApiProperty() @IsObject() geometry!: Record<string, unknown>;
  @ApiProperty() @IsISO8601({strict:true}) captured_at!: string;
  @ApiProperty() @IsString() @Length(3,500) reason!: string;
  @ApiProperty({required:false,type:[FieldSampleDto]}) @IsOptional() @IsArray() @ArrayMaxSize(5000) @ValidateNested({each:true}) @Type(()=>FieldSampleDto) samples?: FieldSampleDto[];
}
class FieldSyncDto extends PrepareFieldDto {
  @ApiProperty({type:[FieldOperation]}) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @ValidateNested({each:true}) @Type(()=>FieldOperation) operations!: FieldOperation[];
}
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
type FieldResult = {operation_id:string;status:'ACCEPTED'|'DUPLICATE'|'CONFLICT'|'REJECTED';plot_id?:string;row_version?:number;code?:string;message?:string};

@Injectable()
export class FieldOfflineService {
  constructor(@Inject(DB) private readonly db: Kysely<Database>, @Inject(PII_CIPHER) private readonly cipher: PiiCipher,
    private readonly authz: AuthorizationService, private readonly plots: PlotsService, private readonly sync: SyncService, private readonly audit: AuditService) {}

  private async scope(user:AuthUser, org:string) {
    const ctx = await this.authz.tenantContext(user,org);
    if(!ctx) throw notFound();
    if(ctx.organizationStatus!=='ACTIVE' || !ctx.roles.includes('PRODUCER') || !ctx.permissions.includes('plot:create_own') || !ctx.permissions.includes('plot:update_own') || !this.plots.geometryAllowed(ctx)) throw forbidden();
    const producers=await this.db.selectFrom('producers').select(['id','producer_code']).where('organization_id','=',org).where('self_membership_id','=',ctx.membershipId).where('status','=','ACTIVE').execute();
    if(producers.length!==1) throw forbidden('PRODUCER_NOT_AVAILABLE','Vincula tu cuenta a una ficha de productor activa.');
    return {ctx,producer:producers[0]};
  }
  private async signingKey(org:string) {
    const aad=`field-offline-key:${org}`;
    let result=await sql<{private_key_enc:string;public_key:Record<string,unknown>}>`SELECT * FROM field_offline_keys WHERE organization_id=${org}`.execute(this.db);
    if(!result.rows.length) {
      const pair=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
      const secret=this.cipher.encrypt(pair.privateKey.export({type:'pkcs8',format:'pem'}).toString(),aad);
      await sql`INSERT INTO field_offline_keys(organization_id,private_key_enc,public_key) VALUES(${org},${secret},${JSON.stringify(pair.publicKey.export({format:'jwk'}))}::jsonb) ON CONFLICT DO NOTHING`.execute(this.db);
      result=await sql<{private_key_enc:string;public_key:Record<string,unknown>}>`SELECT * FROM field_offline_keys WHERE organization_id=${org}`.execute(this.db);
    }
    return {key:createPrivateKey(this.cipher.decrypt(result.rows[0].private_key_enc,aad)),publicKey:result.rows[0].public_key};
  }
  async prepare(user:AuthUser,org:string,dto:PrepareFieldDto) {
    const {producer}=await this.scope(user,org);
    const registered=await this.sync.registerDevice(user,org,{client_device_id:dto.device_id,platform:'OTHER',label:'PWA campo offline'});
    const issued=new Date(); const expires=new Date(issued.getTime()+24*3600000);
    const payload={id:randomUUID(),user_id:user.id,organization_id:org,device_id:dto.device_id,server_device_id:registered.device.id,
      producer_id:producer.id,issued_at:issued.toISOString(),expires_at:expires.toISOString(),permissions:['plot:create_own','plot:update_own','plot:read_geometry']};
    const signing=await this.signingKey(org);
    const signature=sign('sha256',Buffer.from(JSON.stringify(payload)),{key:signing.key,dsaEncoding:'ieee-p1363'}).toString('base64url');
    await sql`INSERT INTO field_offline_grants(id,organization_id,user_id,producer_id,device_id,payload,issued_at,expires_at)
      VALUES(${payload.id},${org},${user.id},${producer.id},${registered.device.id},${JSON.stringify(payload)}::jsonb,${issued},${expires})`.execute(this.db);
    await this.audit.record(this.db,{organizationId:org,actorUserId:user.id,action:'field_offline.prepare',entityType:'device',entityId:registered.device.id,result:'SUCCESS',after:{grant_id:payload.id,expires_at:payload.expires_at}});
    const list=await this.db.selectFrom('plots').select(['id','plot_code','crop','row_version','current_version_id']).where('organization_id','=',org).where('producer_id','=',producer.id).where('status','=','ACTIVE').limit(500).execute();
    const plots=[];
    for(const p of list) plots.push({id:p.id,plot_code:p.plot_code,crop:p.crop,row_version:Number(p.row_version),geometry:(await this.plots.versionView(this.db,org,p.current_version_id,true))?.geometry ?? null});
    return {grant:{payload,signature,public_key:signing.publicKey},producer,plots};
  }
  async apply(user:AuthUser,org:string,dto:FieldSyncDto) {
    const {ctx,producer}=await this.scope(user,org);
    const registered=await this.sync.registerDevice(user,org,{client_device_id:dto.device_id,platform:'OTHER',label:'PWA campo offline'});
    const results:FieldResult[]=[];
    for(const operation of dto.operations) {
      try {
        const result=await this.db.transaction().execute(async trx=>{
          await sql`SELECT pg_advisory_xact_lock(hashtextextended(${org},0))`.execute(trx);
          const same=await sql<{content_hash:string;plot_id:string;row_version:number;user_id:string;device_id:string}>`SELECT * FROM field_offline_operations WHERE organization_id=${org} AND operation_id=${operation.operation_id}`.execute(trx);
          const contentHash=hash(operation);
          if(same.rows.length) {
            const prior=same.rows[0];
            if(prior.user_id!==user.id || prior.device_id!==registered.device.id || prior.content_hash!==contentHash) throw conflict('OPERATION_CONTENT_CHANGED','El identificador ya se utilizó con otro contenido.');
            const visible=await trx.selectFrom('plots').select('id').where('organization_id','=',org).where('id','=',prior.plot_id).where('producer_id','=',producer.id).executeTakeFirst();
            if(!visible)throw forbidden('PLOT_NOT_AVAILABLE','La parcela ya no pertenece a tu alcance actual.');
            return {operation_id:operation.operation_id,status:'DUPLICATE' as const,plot_id:prior.plot_id,row_version:prior.row_version};
          }
          const grant=await sql<{issued_at:Date;expires_at:Date}>`SELECT issued_at,expires_at FROM field_offline_grants WHERE id=${operation.grant_id} AND organization_id=${org} AND user_id=${user.id} AND producer_id=${producer.id} AND device_id=${registered.device.id}`.execute(trx);
          const capture=Date.parse(operation.captured_at);
          if(!grant.rows.length || capture<new Date(grant.rows[0].issued_at).getTime() || capture>new Date(grant.rows[0].expires_at).getTime() || capture>Date.now()+60000) throw forbidden('FIELD_GRANT_INVALID','La captura no corresponde a una autorización de campo vigente.');
          const stillOwn=await trx.selectFrom('producers').select('id').where('organization_id','=',org).where('id','=',producer.id).where('self_membership_id','=',ctx.membershipId).where('status','=','ACTIVE').forShare().executeTakeFirst();
          if(!stillOwn) throw forbidden();
          if(structuralIssues(operation.geometry).length || !['Point','Polygon','MultiPolygon'].includes(String(operation.geometry.type))) throw new AppError(422,'GEOMETRY_STRUCTURE_INVALID','Revisa el perímetro o punto capturado.');
          let plot=(await this.plots.byCodes(trx,org,[operation.plot_code],true)).get(operation.plot_code);
          if(plot && plot.producer_id!==producer.id) throw forbidden('PLOT_NOT_AVAILABLE','La parcela no está disponible para tu productor.');
          let expected=operation.base_version ?? null;
          if(operation.previous_operation_id) {
            const previous=await sql<{plot_id:string;row_version:number}>`SELECT plot_id,row_version FROM field_offline_operations WHERE organization_id=${org} AND user_id=${user.id} AND device_id=${registered.device.id} AND operation_id=${operation.previous_operation_id}`.execute(trx);
            if(!previous.rows.length || !plot || previous.rows[0].plot_id!==plot.id) throw conflict('DEPENDENCY_PENDING','Primero sincroniza la captura anterior de esta parcela.');
            expected=Number(previous.rows[0].row_version);
          }
          if(plot && expected!==Number(plot.row_version)) throw conflict('VERSION_CONFLICT','La parcela cambió en el servidor. Conservamos tu captura para revisión.');
          if(!plot) {
            if(expected!==null) throw conflict('VERSION_CONFLICT','La parcela de origen ya no está disponible.');
            const created=await this.plots.createInTx(trx,ctx,user,producer.id,operation.plot_code,{crop:operation.crop});
            plot=(await this.plots.byCodes(trx,org,[created.plot.plot_code],true)).get(operation.plot_code)!;
          }
          const version=await this.plots.importGeometryInTx(trx,ctx,user,plot.id,operation.geometry,{batch_id:null,row_numbers:[],field_operation_id:operation.operation_id},operation.reason);
          const current=await trx.selectFrom('plots').select('row_version').where('id','=',plot.id).where('organization_id','=',org).executeTakeFirstOrThrow();
          const encrypted=this.cipher.encrypt(JSON.stringify(operation),`field-offline-operation:${org}:${operation.operation_id}`);
          await sql`INSERT INTO field_offline_operations(operation_id,organization_id,user_id,device_id,grant_id,content_hash,plot_id,row_version,captured_enc)
            VALUES(${operation.operation_id},${org},${user.id},${registered.device.id},${operation.grant_id},${contentHash},${plot.id},${current.row_version},${encrypted})`.execute(trx);
          // La muestra original conserva adquisición/precisión por punto; polígonos conservan muestras cifradas en la operación.
          if(operation.geometry.type==='Point') {
            const coordinates=operation.geometry.coordinates as number[];
            const sample=operation.samples?.[0];
            if(sample&&(sample.longitude!==coordinates[0]||sample.latitude!==coordinates[1]))throw new AppError(422,'SAMPLE_GEOMETRY_MISMATCH','La lectura no coincide con el punto.');
            await sql`INSERT INTO location_samples(organization_id,plot_id,plot_version_id,source,longitude,latitude,horizontal_accuracy_m,captured_at,operation_id,payload_hash,created_by)
              VALUES(${org},${plot.id},${version},'BROWSER_GEOLOCATION',${coordinates[0]},${coordinates[1]},${sample?.accuracy_m??null},${sample?.captured_at??operation.captured_at}::timestamptz,${operation.operation_id},${contentHash},${user.id})`.execute(trx);
          }
          return {operation_id:operation.operation_id,status:'ACCEPTED' as const,plot_id:plot.id,row_version:Number(current.row_version)};
        });
        results.push(result);
      } catch(error) {
        if(!(error instanceof AppError)) throw error;
        results.push({operation_id:operation.operation_id,status:error.status===409?'CONFLICT':'REJECTED',code:error.code,message:error.message});
      }
    }
    return {results};
  }
}

@ApiTags('field-offline') @ApiBearerAuth()
@Controller('api/v1/organizations/:orgId/field-offline')
export class FieldOfflineController {
  constructor(private readonly service:FieldOfflineService) {}
  @Post('prepare') prepare(@CurrentUser() user:AuthUser,@Param('orgId',ParseUUIDPipe) org:string,@Body() dto:PrepareFieldDto) { return this.service.prepare(user,org,dto); }
  @Post('sync') sync(@CurrentUser() user:AuthUser,@Param('orgId',ParseUUIDPipe) org:string,@Body() dto:FieldSyncDto) { return this.service.apply(user,org,dto); }
}
