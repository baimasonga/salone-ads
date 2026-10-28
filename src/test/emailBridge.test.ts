// @vitest-environment node
import {describe,expect,it,vi} from 'vitest';
import {handleEmailBridge} from '../../worker/emailBridge';
const key='a'.repeat(64);
function setup(){const send=vi.fn(async()=>({messageId:'native-message'}));return {send,env:{EMAIL: {send},EMAIL_FROM:'noreply@quantixsl.com',EMAIL_BRIDGE_SECRET:key}};}
const request=(body:unknown,secret=key)=>new Request('https://staging.example.com/api/internal/email/send',{method:'POST',headers:{'x-email-bridge-key':secret},body:JSON.stringify(body)});
describe('native email bridge',()=>{
 it('rejects missing or incorrect server secrets without calling email',async()=>{const {env,send}=setup();expect((await handleEmailBridge(request({},''),env)).status).toBe(401);expect((await handleEmailBridge(request({},'wrong'),env)).status).toBe(401);expect(send).not.toHaveBeenCalled();});
 it('offers authenticated readiness without sending',async()=>{const {env,send}=setup();const r=await handleEmailBridge(new Request('https://staging.example.com/api/internal/email/send',{headers:{'x-email-bridge-key':key}}),env);expect(r.status).toBe(200);expect(send).not.toHaveBeenCalled();expect(await r.json()).toMatchObject({configured:true});});
 it('uses only the configured sender and returns the native message ID',async()=>{const {env,send}=setup();const r=await handleEmailBridge(request({from:'spoof@other.example',to:'recipient@example.com',subject:'Test',html:'<p>Test</p>'}),env);expect(r.status).toBe(200);expect(await r.json()).toEqual({id:'native-message'});expect(send).toHaveBeenCalledWith({from:'noreply@quantixsl.com',to:'recipient@example.com',subject:'Test',html:'<p>Test</p>'});});
 it('rejects oversized input and invalid recipients before sending',async()=>{const {env,send}=setup();expect((await handleEmailBridge(request({to:'bad',subject:'Test',html:'body'}),env)).status).toBe(400);expect((await handleEmailBridge(request({html:'x'.repeat(256001)}),env)).status).toBe(413);expect(send).not.toHaveBeenCalled();});
 it('does not expose provider errors or retry a failed send',async()=>{const {env,send}=setup();send.mockRejectedValueOnce(new Error('sensitive provider detail'));const r=await handleEmailBridge(request({to:'recipient@example.com',subject:'Test',html:'body'}),env);expect(r.status).toBe(502);expect(await r.text()).not.toContain('sensitive');expect(send).toHaveBeenCalledTimes(1);});
});
