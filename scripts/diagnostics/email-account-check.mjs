const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
if(!account||!token)throw new Error('Diagnostic access missing');
const r=await fetch('https://api.cloudflare.com/client/v4/zones?name=quantixsl.com',{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(20000)});
const body=await r.json();if(!r.ok||body.success!==true)throw new Error(`Zone account metadata HTTP ${r.status}`);
const zone=body.result.find(zone=>zone.name==='quantixsl.com');if(!zone)throw new Error('Sending zone not visible');
console.log(JSON.stringify({sendingDomain:zone.name,zoneActive:zone.status==='active',sendingZoneAccountMatchesConfiguredWorkerAccount:zone.account?.id===account}));
