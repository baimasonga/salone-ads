import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
if(!account||!token)throw new Error('Missing staging maintenance credentials');
const appId='a03929ea-a351-442a-94d5-e09f2964c153';
async function api(resource){const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/${resource}`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(20000)});const body=await r.json();if(!r.ok||body.success===false)throw new Error(`Metadata ${resource.split('?')[0]} HTTP ${r.status}`);return body.result??body;}
const app=await api(`containers/applications/${appId}`);
if(app.name!=='manohub-staging-container-manohubcontainer')throw new Error('Refusing non-staging application');
const settings=await api('workers/scripts/manohub-staging-container/settings');
const bindings=settings.bindings??[];const value=name=>bindings.find(b=>b.name===name)?.text;
if(value('MANOHUB_ENVIRONMENT')!=='staging')throw new Error('Refusing a non-staging Worker');
const revision=value('CONTAINER_REVISION');if(!revision)throw new Error('Current routing revision missing');
const currentName=`staging-${revision.slice(0,64)}`;
const list=await api(`containers/applications/${appId}/instances-v2?state=active&per_page=100`);
console.log('Instance response fields:',Object.keys(list));
let rows=Array.isArray(list)?list:list.instances??list.items??list.data;
if(!Array.isArray(rows))throw new Error('Unrecognized instance list; no stop attempted');
const dash=await api(`containers/dash/applications/${appId}/instances?per_page=100`);
const names=new Map((dash.durable_objects??[]).map(d=>[d.id,d.name]));
const targets=[];
for(const row of rows){
 const name=row.name??names.get(row.id);
 console.log(JSON.stringify({name,state:row.status?.state,current:name===currentName}));
 if(name===currentName||!['running','provisioning','starting','stopping'].includes(row.status?.state))continue;
 if(typeof name!=='string'||!name.startsWith('staging-')||!/^\w{64}$/.test(row.id))throw new Error('Unknown instance identity; refusing stop');
 targets.push({id:row.id,name});
}
if(process.env.RESTART_CURRENT_STAGING==='true'){targets.length=0;targets.push({name:currentName});console.log('Refreshing only the current staging instance for updated secret bindings.');}
if(!targets.length){console.log('No superseded active staging instances found.');process.exit(0);}
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'staging-maintenance-'));
const name=`manohub-staging-maint-${process.env.GITHUB_RUN_ID}`;
const config=path.join(temp,'wrangler.toml');
const allowed=targets;
fs.writeFileSync(path.join(temp,'index.js'),`export default {async fetch(request,env){if(!env.MAINTENANCE_AUTH_TOKEN||request.headers.get('authorization')!=='Bearer '+env.MAINTENANCE_AUTH_TOKEN)return new Response('Denied',{status:403});if(request.method!=='POST')return new Response('Method',{status:405});const stopped=[];for(const target of ${JSON.stringify(allowed)}){const id=target.id?env.STAGING_CONTAINER.idFromString(target.id):env.STAGING_CONTAINER.idFromName(target.name);const stub=env.STAGING_CONTAINER.get(id);await stub.stop();stopped.push(target.name);}return Response.json({stopped});}};`);
fs.writeFileSync(config,`name = "${name}"\nmain = "index.js"\ncompatibility_date = "2026-07-21"\n[[durable_objects.bindings]]\nname = "STAGING_CONTAINER"\nclass_name = "ManohubContainer"\nscript_name = "manohub-staging-container"\n`);
const secret=randomBytes(40).toString('hex');console.log(`::add-mask::${secret}`);
function wrangler(args,input){const r=spawnSync('npx',['--yes','wrangler@4.114.0',...args,'--config',config],{input,encoding:'utf8',stdio:['pipe','inherit','inherit']});if(r.status!==0)throw new Error(`Maintenance Worker ${args[0]} failed`);}
let published=false;
try{
 wrangler(['deploy']);published=true;
 wrangler(['secret','put','MAINTENANCE_AUTH_TOKEN'],secret);
 let stopped=false;
 for(let attempt=0;attempt<10;attempt++){
  const r=await fetch(`https://${name}.mohamedbangura.workers.dev`,{method:'POST',headers:{Authorization:`Bearer ${secret}`},signal:AbortSignal.timeout(45000)});
  if(r.ok){const result=await r.json();console.log('Superseded staging instances stopped:',result.stopped?.length);stopped=true;break;}
  const text=(await r.text()).replaceAll(secret,'[redacted]').slice(0,180);
  console.log('Maintenance propagation status:',r.status,text);
  if(![403,404,502,503].includes(r.status))throw new Error('Staging maintenance RPC failed');
  await new Promise(resolve=>setTimeout(resolve,3000));
 }
 if(!stopped)throw new Error('Maintenance Worker did not become available');
}finally{if(published)wrangler(['delete','--force']);fs.rmSync(temp,{recursive:true,force:true});}

let healthy=false;
for(let attempt=0;attempt<6;attempt++){
 try{const r=await fetch('https://manohub-staging-container.mohamedbangura.workers.dev/api/health',{signal:AbortSignal.timeout(20000)});if(r.ok){const body=await r.json();if(body.environment==='staging'&&body.release===value('RELEASE_VERSION')){healthy=true;break;}}}catch{}
 await new Promise(resolve=>setTimeout(resolve,5000));
}
if(!healthy)throw new Error('Current staging release not healthy after freeing capacity');
console.log('PASS: current staging release is healthy within the unchanged instance limit.');
