import crypto from 'node:crypto';
const url=process.env.STAGING_SUPABASE_URL;
const key=process.env.STAGING_SERVICE_KEY;
const ref='gknewzlxndmummwynuoa';
if(url!==`https://${ref}.supabase.co`)throw new Error('Refusing non-staging target');
if(!key)throw new Error('Staging service secret is not configured');
const parts=key.split('.');
if(parts.length===3){
 const claims=JSON.parse(Buffer.from(parts[1],'base64url').toString());
 console.log('Service credential role:',claims.role==='service_role'?'service_role':'NOT service_role');
 console.log('Service credential project matches staging:',claims.ref===ref);
 if(claims.role!=='service_role'||claims.ref!==ref)throw new Error('Configured service credential is not a service-role key for the staging project. No database requests made.');
}
const headers={apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'};
const rows=[];
const probe=async(path,options={})=>{
 const response=await fetch(`${url}/rest/v1/${path}`,{...options,headers:{...headers,...options.headers},signal:AbortSignal.timeout(20000)});
 const text=await response.text();let body;try{body=JSON.parse(text);}catch{}
 console.log(JSON.stringify({probe:path.split('?')[0],status:response.status,errorCode:body?.code,errorMessage:response.ok?undefined:body?.message}));
 if(!response.ok)throw new Error(`Staging ${path.split('?')[0]} returned HTTP ${response.status}`);
 return body;
};
await probe('protected_upload_authorizations?select=id&limit=0');
await probe('upload_security_events?select=id&limit=0');
const id=crypto.randomUUID();
try{
 await probe('protected_upload_authorizations',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({id,user_id:process.env.TEST_USER_ID,bucket_id:'private-documents',object_path:`${process.env.TEST_ORG_ID}/diagnostic-${id}.txt`})});
 rows.push(id);
 console.log('PASS: staging service key can create upload authorization.');
}finally{
 if(rows.length)await probe(`protected_upload_authorizations?id=eq.${id}`,{method:'DELETE'});
}
