export interface EmailBridgeEnv {
  EMAIL?: {send(message:{from:string;to:string;subject:string;html:string}):Promise<{messageId:string}>};
  EMAIL_FROM?: string;
  EMAIL_BRIDGE_SECRET?: string;
}
const encoder=new TextEncoder();
async function sameSecret(a:string,b:string):Promise<boolean>{
  const [left,right]=await Promise.all([crypto.subtle.digest('SHA-256',encoder.encode(a)),crypto.subtle.digest('SHA-256',encoder.encode(b))]);
  const l=new Uint8Array(left),r=new Uint8Array(right);let diff=0;for(let i=0;i<l.length;i++)diff|=l[i]^r[i];return diff===0;
}
export async function handleEmailBridge(request:Request,env:EmailBridgeEnv):Promise<Response>{
  const supplied=request.headers.get('x-email-bridge-key')||'';
  if(!env.EMAIL_BRIDGE_SECRET||!supplied||supplied.length>256||!await sameSecret(supplied,env.EMAIL_BRIDGE_SECRET))return Response.json({error:'Unauthorized'},{status:401});
  if(!env.EMAIL||!env.EMAIL_FROM)return Response.json({error:'Native email binding is not configured'},{status:503});
  if(request.method==='GET')return Response.json({provider:'cloudflare-worker',configured:true,sender:env.EMAIL_FROM},{headers:{'Cache-Control':'no-store'}});
  if(request.method!=='POST')return new Response('Method not allowed',{status:405});
  const reader=request.body?.getReader();if(!reader)return new Response('Missing body',{status:400});
  const chunks:Uint8Array[]=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>256000){await reader.cancel();return new Response('Payload too large',{status:413});}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  let body:{to?:unknown;subject?:unknown;html?:unknown};try{body=JSON.parse(new TextDecoder().decode(bytes));}catch{return new Response('Invalid JSON',{status:400});}
  if(typeof body?.to!=='string'||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.to)||body.to.length>254||typeof body.subject!=='string'||!body.subject.trim()||body.subject.length>180||typeof body.html!=='string'||!body.html||body.html.length>200000)return new Response('Invalid message',{status:400});
  try{
    const result=await env.EMAIL.send({from:env.EMAIL_FROM,to:body.to,subject:body.subject,html:body.html});
    if(!result?.messageId)return Response.json({error:'Native email acceptance could not be confirmed'},{status:502});
    return Response.json({id:result.messageId},{headers:{'Cache-Control':'no-store'}});
  }catch{return Response.json({error:'Cloudflare native email send failed'},{status:502});}
}
