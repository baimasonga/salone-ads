// @vitest-environment node
import express from 'express';
import {afterEach,expect,it,vi} from 'vitest';
import type {Server} from 'node:http';
import {createAudienceEmailModule} from './audienceEmail';
import {inspectEmailProvider} from './emailProvider';
vi.mock('./emailProvider',()=>({inspectEmailProvider:vi.fn(async()=>({provider:'cloudflare',configured:true})),assertEmailConfigured:vi.fn(),sendEmail:vi.fn(),supportsEmailRetryDeduplication:()=>false}));
let server:Server|undefined;
afterEach(async()=>{if(server)await new Promise<void>((resolve,reject)=>server!.close(error=>error?reject(error):resolve()));vi.clearAllMocks();});
async function start(){
 const app=express();const module=createAudienceEmailModule({serviceClient:null,configuredAppOrigin:()=>null,htmlEscape:value=>value,structuredLog:vi.fn()});
 module.registerRoutes(app,(req,res,next)=>{if(!req.headers.authorization){res.sendStatus(401);return;}next();},(req,res,next)=>{if(req.headers.authorization!=='admin'){res.sendStatus(403);return;}next();});
 server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server!.once('listening',resolve));
 const address=server.address();if(!address||typeof address==='string')throw new Error('No test server');return `http://127.0.0.1:${address.port}/api/audience-email/provider-status`;
}
it('keeps provider diagnostics behind both authentication and administrator checks',async()=>{
 const url=await start();expect((await fetch(url)).status).toBe(401);expect((await fetch(url,{headers:{Authorization:'ordinary-user'}})).status).toBe(403);expect(inspectEmailProvider).not.toHaveBeenCalled();
 const response=await fetch(url,{headers:{Authorization:'admin'}});expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store');expect(await response.json()).toEqual({provider:'cloudflare',configured:true});
});
it('rejects arbitrary zone paths before inspecting the provider',async()=>{
 const url=await start();expect((await fetch(url+'?zoneId=../../other-endpoint',{headers:{Authorization:'admin'}})).status).toBe(400);expect(inspectEmailProvider).not.toHaveBeenCalled();
});
