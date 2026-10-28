// @vitest-environment node
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {assertEmailConfigured,sendEmail,supportsEmailRetryDeduplication} from './emailProvider';
import {sendResendEmail} from './resendProvider';
vi.mock('./resendProvider',()=>({sendResendEmail:vi.fn(async()=> 'resend-id')}));
beforeEach(()=>{
 vi.stubEnv('EMAIL_PROVIDER','cloudflare');vi.stubEnv('EMAIL_FROM','notifications@example.com');
 vi.stubEnv('CLOUDFLARE_EMAIL_ACCOUNT_ID','a'.repeat(32));vi.stubEnv('CLOUDFLARE_EMAIL_API_TOKEN','test-token');
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.clearAllMocks();});
const input={to:'recipient@example.com',subject:'Test',html:'<p>Test</p>',idempotencyKey:'test-delivery'};
describe('Cloudflare Email Sending adapter',()=>{
 it('uses the documented endpoint and accepts a queued recipient',async()=>{
  const fetch=vi.fn(async()=>new Response(JSON.stringify({success:true,result:{delivered:[],queued:[input.to],permanent_bounces:[]}}),{status:200}));vi.stubGlobal('fetch',fetch);
  const reference=await sendEmail(input);expect(reference).toMatch(/^cloudflare-request:/);
  const [url,init]=fetch.mock.calls[0] as unknown as [string,RequestInit];
  expect(url).toBe('https://api.cloudflare.com/client/v4/accounts/'+ 'a'.repeat(32)+'/email/sending/send');
  expect(init.redirect).toBe('error');expect(init.headers).toMatchObject({Authorization:'Bearer test-token'});
  expect(JSON.parse(init.body as string)).toMatchObject({from:'notifications@example.com',to:input.to,html:input.html,headers:{'X-Hyderra-Reference':reference}});
  expect(supportsEmailRetryDeduplication()).toBe(false);
 });
 it('rejects a bounced recipient despite an HTTP success',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({success:true,result:{delivered:[],queued:[],permanent_bounces:[input.to]}}))));
  await expect(sendEmail(input)).rejects.toThrow('did not accept');
 });
 it('does not expose provider response bodies on authorization failure',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({success:false,errors:[{message:'sensitive detail'}]}),{status:403})));
  await expect(sendEmail(input)).rejects.toThrow('HTTP 403');
 });
 it('never retries a transport failure',async()=>{
  const fetch=vi.fn(async()=>{throw new Error('interrupted');});vi.stubGlobal('fetch',fetch);
  await expect(sendEmail(input)).rejects.toThrow('interrupted');expect(fetch).toHaveBeenCalledTimes(1);
 });
 it('requires explicit credentials and refuses unsupported providers',()=>{
  vi.stubEnv('CLOUDFLARE_EMAIL_API_TOKEN','');expect(()=>assertEmailConfigured()).toThrow('Cloudflare email delivery requires');
  vi.stubEnv('EMAIL_PROVIDER','typo');expect(()=>assertEmailConfigured()).toThrow('Unsupported');
 });
 it('preserves existing Resend configuration and adapter',async()=>{
  vi.stubEnv('EMAIL_PROVIDER','resend');vi.stubEnv('RESEND_API_KEY','resend-test');vi.stubEnv('RESEND_FROM_EMAIL','test@example.com');
  expect(await sendEmail(input)).toBe('resend-id');expect(sendResendEmail).toHaveBeenCalledWith(input);expect(supportsEmailRetryDeduplication()).toBe(true);
 });
});
