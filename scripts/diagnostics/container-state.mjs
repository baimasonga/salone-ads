const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const token=process.env.CLOUDFLARE_API_TOKEN;
const application='a03929ea-a351-442a-94d5-e09f2964c153';
if(!account||!token)throw new Error('Cloudflare deployment credentials unavailable');
async function get(path){
 const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/containers/applications/${application}${path}`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw new Error(`Staging container metadata HTTP ${r.status}`);
 const body=await r.json();return body.result??body;
}
const app=await get('');
if(app.name!=='manohub-staging-container-manohubcontainer')throw new Error('Unexpected container application');
console.log(JSON.stringify({application:app.name,keys:Object.keys(app),imageDigest:app.configuration?.image?.split('@')[1],logsEnabled:app.observability?.logs_enabled,configurationKeys:Object.keys(app.configuration??{}),configuredLogs:app.configuration?.observability}));
const list=await get('/deployments');
console.log('Deployment response fields:',Object.keys(list));
const rows=Array.isArray(list)?list:list.deployments??list.data??[];
for(const d of rows)console.log(JSON.stringify({id:d.id,version:d.app_version??d.version,state:d.state??d.status,keys:Object.keys(d),imageDigest:d.image?.split('@')[1],memoryMiB:d.memory_mib,vcpu:d.vcpu,currentPlacement:d.current_placement,placements:d.placements?.map(p=>({id:p.id,status:p.status,state:p.state,events:p.events}))}));

const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/containers/dash/applications/${application}/instances?per_page=20`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(20000)});
if(!response.ok)throw new Error(`Instance metadata HTTP ${response.status}`);
const raw=await response.json();const data=raw.result??raw;
console.log('Instance fields:',Object.keys(data));
for(const d of data.durable_objects??[])console.log(JSON.stringify({kind:'durable-object',name:d.name,id:d.id,deploymentId:d.deployment_id}));
for(const i of data.instances??[])console.log(JSON.stringify({kind:'instance',id:i.id,version:i.app_version,imageDigest:i.image?.split('@')[1],status:i.current_placement?.status}));
