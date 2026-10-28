const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
if(!account||!token)throw new Error('Cloudflare metadata credentials unavailable');
const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/manohub-staging-container/settings`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(20000)});
if(!r.ok)throw new Error(`Staging Worker settings HTTP ${r.status}`);
const body=await r.json();const bindings=body.result?.bindings??[];
for(const name of ['RESEND_API_KEY','RESEND_FROM_EMAIL','RESEND_WEBHOOK_SECRET','EMAIL_DISPATCH_SECRET']){
 const binding=bindings.find(b=>b.name===name);
 console.log(JSON.stringify({name,workerBindingPresent:!!binding,type:binding?.type,githubSecretPresent:!!process.env[`CHECK_${name}`]?.trim()}));
}
