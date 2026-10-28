const token=process.env.CLOUDFLARE_API_TOKEN;
if(!token)throw new Error('Cloudflare diagnostics credential unavailable');
const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
const zonesResponse=await fetch('https://api.cloudflare.com/client/v4/zones?name=quantixsl.com',{headers,signal:AbortSignal.timeout(20000)});
const zones=await zonesResponse.json();
if(!zonesResponse.ok||!zones.success)throw new Error(`Cannot inspect sending zone: HTTP ${zonesResponse.status}`);
const zone=zones.result.find(z=>z.name==='quantixsl.com');if(!zone)throw new Error('Sending zone not visible to diagnostic credential');
const query=`query($zone: String!, $start: Time!, $end: Time!) {viewer {zones(filter:{zoneTag:$zone}) {emailSendingAdaptive(limit:100,filter:{datetime_geq:$start,datetime_leq:$end},orderBy:[datetime_DESC]) {datetime from to subject status messageId errorCause errorDetail}}}}`;
const now=new Date();const r=await fetch('https://api.cloudflare.com/client/v4/graphql',{method:'POST',headers,body:JSON.stringify({query,variables:{zone:zone.id,start:new Date(now.getTime()-45*60000).toISOString(),end:now.toISOString()}}),signal:AbortSignal.timeout(30000)});
const body=await r.json();if(!r.ok||body.errors?.length){console.log('Email analytics response:',JSON.stringify(body.errors?.map(e=>({message:e.message}))??{status:r.status}));throw new Error('Email analytics unavailable with existing diagnostic access');}
const events=(body.data?.viewer?.zones??[]).flatMap(z=>z.emailSendingAdaptive??[]).filter(e=>e.from==='noreply@quantixsl.com'&&e.to==='baimasonga@gmail.com'&&e.subject==='Hyderra staging email verification');
console.log('Matching approved-test events:',events.length);
for(const event of events)console.log(JSON.stringify(event));
