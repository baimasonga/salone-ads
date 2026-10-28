import { writeFileSync } from 'node:fs';
const project='rffjehmbrycztiekcyho';
const base=`https://${project}.supabase.co`;
const result={checkedAt:new Date().toISOString(),mode:'read-only',expectedCandidate:'a0c6b6b1b72504381ec23e3ec44247a224f69637',productionUrlConfigured:!!process.env.PRODUCTION_URL,credentialConfigured:!!process.env.SERVICE_KEY,acknowledgementMatches:process.env.MIGRATIONS_COMMIT==='a0c6b6b1b72504381ec23e3ec44247a224f69637',checks:{}};
async function get(url,headers={}) {try {const r=await fetch(url,{headers,redirect:'error',signal:AbortSignal.timeout(60000)});const t=await r.text();let body;try{body=JSON.parse(t)}catch{}return {status:r.status,body};}catch{return {status:0};}}
const app=(process.env.PRODUCTION_URL||'https://manohub-container.mohamedbangura.workers.dev').replace(/\/$/,'');
for (const path of ['/api/health','/release.json']) {const r=await get(app+path);result.checks[path]={status:r.status,...(path==='/api/health'?{health:r.body?.status,environment:r.body?.environment,release:r.body?.releaseVersion||r.body?.release}:{commit:r.body?.commit})};}
const key=process.env.SERVICE_KEY;
if(key){
 if(key.split('.').length===3){try{const claims=JSON.parse(Buffer.from(key.split('.')[1],'base64url'));result.credentialProjectMatches=claims.ref===project;result.credentialRoleMatches=claims.role==='service_role';}catch{result.credentialProjectMatches=false;}}
 if(result.credentialProjectMatches!==false&&result.credentialRoleMatches!==false){
 const headers={apikey:key,Authorization:`Bearer ${key}`};
 for(const table of ['protected_upload_authorizations','backend_command_requests']) {const r=await get(`${base}/rest/v1/${table}?select=id&limit=0`,headers);result.checks[table]={status:r.status,accessible:r.status===200,errorCode:r.body?.code};}
 const api=await get(`${base}/rest/v1/`,{...headers,Accept:'application/openapi+json'});result.checks.migrationRpcIndicators={status:api.status,atomicCommandAdvertised:!!api.body?.paths?.['/rpc/execute_backend_command'],uploadAuthorizationAdvertised:!!api.body?.paths?.['/rpc/has_protected_upload_authorization'],note:'Presence indicators do not verify definitions, RLS policies, grants or migration 98.'};
 for(const [table,select] of [['backup_runs','backup_kind,status,backup_point_at,completed_at,object_count,byte_count'],['restore_exercises','exercise_type,environment,status,backup_point_at,completed_at,achieved_rpo_minutes,achieved_rto_minutes']]) {const r=await get(`${base}/rest/v1/${table}?select=${select}&order=completed_at.desc&limit=10`,headers);result.checks[table]={status:r.status,records:Array.isArray(r.body)?r.body:undefined,errorCode:r.body?.code,note:'Recorded evidence only; backup existence and restorability require independent verification.'};}
 }
}
result.productionChanged=false;
writeFileSync('production-readiness-audit.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
