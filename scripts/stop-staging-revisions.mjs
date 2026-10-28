import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
export function validateStagingStopNames(names,currentName){
 if(!Array.isArray(names)||names.length>2||names.some(name=>typeof name!=='string'||!/^staging-[A-Za-z0-9_.-]{1,64}$/.test(name)||name===currentName))throw new Error('Refusing unsafe staging stop targets');
 return [...new Set(names)];
}
async function main(){
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
if(process.argv.includes('--capture')){
 const buildName=`staging-${`${process.env.GITHUB_SHA}-build-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`.slice(0,64)}`;
 const names=[currentName,buildName];
 if(!process.env.GITHUB_OUTPUT)throw new Error('Missing workflow output destination');
 fs.appendFileSync(process.env.GITHUB_OUTPUT,`superseded=${JSON.stringify(names)}\n`);
 console.log('Captured previous and build staging routing identities.');return;
}
const targets=validateStagingStopNames(JSON.parse(process.env.SUPERSEDED_STAGING_NAMES||'[]'),currentName).map(name=>({name}));
if(!targets.length)return;
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

}
if(process.argv[1] && new URL(import.meta.url).pathname===process.argv[1])await main();
