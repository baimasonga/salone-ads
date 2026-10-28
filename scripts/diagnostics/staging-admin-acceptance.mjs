import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
const url=process.env.STAGING_SUPABASE_URL,key=process.env.STAGING_SERVICE_KEY,anon=process.env.STAGING_ANON_KEY;
assert.equal(url,'https://gknewzlxndmummwynuoa.supabase.co','Staging target required');
assert.ok(key);assert.ok(anon);
const stateFile='/tmp/staging-admin-fixture.json';
let state=fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile,'utf8')):{};
const save=()=>fs.writeFileSync(stateFile,JSON.stringify(state),{mode:0o600});
async function call(path,{token=key,method='GET',body,allowFailure=false}={}){
 const r=await fetch(url+path,{method,headers:{apikey:token===key?key:anon,Authorization:`Bearer ${token}`,'Content-Type':'application/json',Prefer:'return=representation'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(25000)});
 const raw=await r.text();let data;try{data=JSON.parse(raw);}catch{data=null;}
 if(!r.ok&&!allowFailure)throw new Error(`${method} ${path.split('?')[0]} HTTP ${r.status}: ${data?.message??data?.msg??data?.code??'request failed'}`);
 return {ok:r.ok,status:r.status,data};
}
async function cleanup(){
 const failures=[];
 async function attempt(name,fn){try{await fn();console.log('Cleanup passed:',name);}catch(e){failures.push(name);console.error('Cleanup failed:',name,e.message);}}
 if(state.userId)await attempt('remove administrator access',async()=>{await call(`/rest/v1/platform_staff_members?user_id=eq.${state.userId}`,{method:'DELETE'});const r=await call(`/rest/v1/platform_staff_members?user_id=eq.${state.userId}&select=user_id`);assert.equal(r.data.length,0);});
 if(state.orgId){for(const table of ['subscription_payment_proofs','subscription_events','notifications','subscriptions'])await attempt(`remove test ${table}`,()=>call(`/rest/v1/${table}?org_id=eq.${state.orgId}`,{method:'DELETE'}));await attempt('remove test memberships',()=>call(`/rest/v1/organization_members?org_id=eq.${state.orgId}`,{method:'DELETE'}));await attempt('remove test organization',()=>call(`/rest/v1/organizations?id=eq.${state.orgId}`,{method:'DELETE'}));}
 if(state.planId)await attempt('remove temporary inactive paid plan',()=>call(`/rest/v1/plans?id=eq.${state.planId}`,{method:'DELETE'}));
 if(state.userId)await attempt('delete temporary auth account',async()=>{const deleted=await call(`/auth/v1/admin/users/${state.userId}`,{method:'DELETE',allowFailure:true});assert.ok(deleted.ok||deleted.status===404);const r=await call(`/auth/v1/admin/users/${state.userId}`,{allowFailure:true});assert.equal(r.status,404);});
 if(failures.length)throw new Error(`Cleanup incomplete: ${failures.join(', ')}`);
 console.log('PASS: temporary account and administrator access removed.');
}
if(process.argv.includes('--cleanup')){await cleanup();process.exit(0);}
const password=randomBytes(36).toString('base64url')+'aA1!';
const email=`staging-admin-${process.env.GITHUB_RUN_ID??randomUUID()}-${process.env.GITHUB_RUN_ATTEMPT??1}@example.invalid`;
console.log(`::add-mask::${password}`);
let token,browser;
try{
 const created=await call('/auth/v1/admin/users',{method:'POST',body:{email,password,email_confirm:true,user_metadata:{full_name:'[TEST] Temporary staging acceptance administrator'}}});
 state.userId=created.data.id;assert.ok(state.userId);save();
 await call('/rest/v1/platform_staff_members',{method:'POST',body:{user_id:state.userId,email,role:'administrator',status:'active',accepted_at:new Date().toISOString()}});
 const session=await call('/auth/v1/token?grant_type=password',{method:'POST',token:anon,body:{email,password}});token=session.data.access_token;assert.ok(token);console.log(`::add-mask::${token}`);
 const rpc=async(name,body,allowFailure=false)=>(await call(`/rest/v1/rpc/${name}`,{method:'POST',token,body,allowFailure}));
 assert.equal((await rpc('is_platform_admin',{})).data,true);console.log('PASS: dedicated temporary account has administrator access.');
 if(process.env.EMAIL_ACCEPTANCE==='true'){
  const r=await fetch('https://manohub-staging-container.mohamedbangura.workers.dev/api/audience-email/test',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({to:'delivered@resend.dev',subject:'Staging acceptance sandbox delivery',body:'Synthetic staging acceptance to the Resend test sink. No human recipient.'}),signal:AbortSignal.timeout(90000)});
  const data=await r.json();
  if(!r.ok){console.log('Email sandbox test HTTP status:',r.status);if(/Email delivery is not configured/.test(data.error?.message??''))console.log('Email configuration missing: RESEND_API_KEY and/or RESEND_FROM_EMAIL');throw new Error('Staging sandbox email acceptance failed; no success claimed.');}
  assert.ok(data.id,'Provider acceptance ID required');
  console.log('PASS: staging email endpoint accepted sandbox delivery and returned a provider message ID. Inbox delivery and signed webhook processing remain separate checks.');
 }else{
 const org=await call('/rest/v1/organizations',{method:'POST',body:{name:'[TEST] Temporary billing acceptance '+process.env.GITHUB_RUN_ID,type:'Small Business',country:'Sierra Leone',created_by:state.userId}});state.orgId=org.data[0].id;save();
 await call('/rest/v1/organization_members',{method:'POST',body:{org_id:state.orgId,user_id:state.userId,role:'owner'}});
 const plans=await call('/rest/v1/plans',{method:'POST',body:{code:'test-acceptance-'+randomUUID(),name:'[TEST] Temporary inactive paid plan',description:'Synthetic acceptance fixture; not offered to customers.',monthly_price:10,annual_price:100,currency_code:'SLE',is_active:false}});state.planId=plans.data[0].id;save();
 if(process.env.BROWSER_ACCEPTANCE==='true'){const {openAdminBrowser}=await import('./staging-admin-browser.mjs');browser=await openAdminBrowser(email,password);}
 for(const decision of ['verified','rejected']){
  const sub=await call('/rest/v1/subscriptions',{method:'POST',body:{org_id:state.orgId,plan_id:plans.data[0].id,status:'pending',billing_cycle:'monthly',payment_method:'manual_bank_transfer',notes:'[TEST] Synthetic evidence only; no payment transferred.'}});const sid=sub.data[0].id;
  const reference='TEST-NO-PAYMENT-'+randomUUID();
  const proof=await rpc('submit_subscription_payment_proof',{p_subscription_id:sid,p_payment_method:'bank_transfer',p_payment_reference:reference,p_amount:plans.data[0].monthly_price,p_payer_name:'[TEST] Synthetic payer',p_receipt_object_path:null});assert.ok(proof.data.id);
  if(decision==='rejected'){const invalid=await rpc('review_subscription_payment',{p_proof_id:proof.data.id,p_decision:decision,p_review_note:null},true);assert.equal(invalid.ok,false);assert.match(invalid.data.message,/rejection reason/i);const untouched=await call(`/rest/v1/subscription_payment_proofs?id=eq.${proof.data.id}&select=status`);assert.equal(untouched.data[0].status,'pending');console.log('PASS: missing rejection reason leaves evidence pending.');}
  let reviewed;
  if(browser){await browser.review(reference,decision);reviewed={data:(await call(`/rest/v1/subscriptions?id=eq.${sid}&select=*`)).data[0]};}
  else reviewed=await rpc('review_subscription_payment',{p_proof_id:proof.data.id,p_decision:decision,p_review_note:'[TEST] Synthetic staging acceptance; no funds transferred.'});
  assert.equal(reviewed.data.status,decision==='verified'?'active':'cancelled');
  const stored=await call(`/rest/v1/subscription_payment_proofs?id=eq.${proof.data.id}&select=status,reviewed_by`);assert.equal(stored.data[0].status,decision);assert.equal(stored.data[0].reviewed_by,state.userId);
  const duplicate=await rpc('review_subscription_payment',{p_proof_id:proof.data.id,p_decision:decision,p_review_note:'[TEST] Duplicate review'},true);assert.equal(duplicate.ok,false);assert.match(duplicate.data.message,/already been reviewed/);
  console.log(`PASS: ${decision} evidence transitions subscription and rejects duplicate review.`);
  if(decision==='verified'){assert.ok(reviewed.data.current_period_start);assert.ok(reviewed.data.current_period_end);await rpc('transition_subscription',{p_subscription_id:sid,p_action:'cancel',p_reason:'[TEST] End synthetic acceptance fixture',p_effective_date:new Date().toISOString().slice(0,10)});}
 }
 console.log('PASS: staging subscription approval and rejection acceptance completed. No payment provider called.');
 }}finally{try{await browser?.close();}finally{await cleanup();}}
