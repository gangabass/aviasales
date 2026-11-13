import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes,createECDH } from 'node:crypto';
import webpush from 'web-push';
import worker,{checkMonitor,runChecks} from '../worker/index.mjs';
import {hash} from '../worker/domain.mjs';
import {database} from './helpers.mjs';
const day=n=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);
async function setup(){const DB=database();const a='a'.repeat(43),b='b'.repeat(43);DB.sqlite.prepare('INSERT INTO users(id,name,token_hash) VALUES(?,?,?)').run('alice','Алиса',await hash(a));DB.sqlite.prepare('INSERT INTO users(id,name,token_hash) VALUES(?,?,?)').run('bob','Боб',await hash(b));return {DB,a,b,ALLOWED_ORIGINS:'https://example.com',APP_URL:'https://example.com/aviasales/',VAPID_SUBJECT:'mailto:test@example.com',...Object.fromEntries(Object.entries(webpush.generateVAPIDKeys()).map(([k,v])=>[k==='publicKey'?'VAPID_PUBLIC_KEY':'VAPID_PRIVATE_KEY',v]))};}
async function request(env,path,token,method='GET',body,origin='https://example.com'){return worker.fetch(new Request('https://worker.test'+path,{method,headers:{Origin:origin,...(token?{Authorization:`Bearer ${token}`}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})}),env);}
const watch=()=>({origin:'IKT',destination:'BKK',dateMin:day(2),dateMax:day(10),threshold:25000,directOnly:false});
async function add(env){const r=await request(env,'/api/monitors',env.a,'POST',watch());assert.equal(r.status,201);return (await r.json()).monitor;}
function subscription(){const ec=createECDH('prime256v1');ec.generateKeys();return {endpoint:'https://fcm.googleapis.com/fcm/send/test-endpoint',keys:{p256dh:ec.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}};}
test('auth, CORS, invalid JSON, and owner isolation',async()=>{
 const e=await setup();assert.equal((await request(e,'/api/monitors')).status,401);assert.equal((await request(e,'/api/monitors',e.a,'GET',undefined,'https://evil.test')).status,403);
 const m=await add(e);assert.equal((await(await request(e,'/api/monitors',e.b)).json()).monitors.length,0);
 assert.equal((await request(e,`/api/monitors/${m.id}`,e.b,'DELETE')).status,404);
 assert.equal((await request(e,`/api/monitors/${m.id}`,e.b,'PATCH',{enabled:false})).status,404);
 assert.equal((await request(e,'/api/monitors',e.a,'POST',null)).status,400);
 assert.equal((await request(e,'/api/monitors',e.a,'POST',{...watch(),threshold:-1})).status,400);
 assert.equal((await request(e,`/api/monitors/${m.id}`,e.a,'PATCH',{enabled:false})).status,200);
 assert.equal((await request(e,`/api/monitors/${m.id}`,e.a,'DELETE')).status,200);
 assert.equal((await(await request(e,'/api/monitors',e.a)).json()).monitors.length,0);
});
test('monitor creation is capped at ten',async()=>{const e=await setup();for(let i=0;i<10;i++)await add(e);assert.equal((await request(e,'/api/monitors',e.a,'POST',watch())).status,409);});
test('push subscription rejects SSRF and cannot be reassigned to another owner',async()=>{const e=await setup(),sub=subscription();assert.equal((await request(e,'/api/subscriptions',e.a,'POST',{...sub,endpoint:'https://127.0.0.1/'})).status,400);assert.equal((await request(e,'/api/subscriptions',e.a,'POST',sub)).status,200);assert.equal((await request(e,'/api/subscriptions',e.b,'POST',sub)).status,409);await request(e,'/api/subscriptions',e.b,'DELETE',{endpoint:sub.endpoint});assert.equal(e.DB.sqlite.prepare('SELECT COUNT(*) n FROM subscriptions').get().n,1);});
test('poll, encrypted push, deduplication, price drop, recovery and expired push cleanup',async()=>{
 const e=await setup(),created=await add(e),sub=subscription();await request(e,'/api/subscriptions',e.a,'POST',sub);
 const m=()=>e.DB.sqlite.prepare('SELECT * FROM monitors WHERE id=?').get(created.id);
 let price=21000,pushes=0,status=201;
 const original=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{assert.equal(String(url),sub.endpoint);assert.equal(options.headers['Content-Encoding'],'aes128gcm');assert.match(options.headers.Authorization,/^vapid /);assert.ok(options.body.length>100);pushes++;return new Response(null,{status});};
 const upstream=async()=>Response.json({prices:[{depart_date:day(3),value:price,no_directs:false}]});
 try{
  await checkMonitor(e,m(),upstream);assert.equal(pushes,1);assert.equal(m().best_price,21000);
  await checkMonitor(e,m(),upstream);assert.equal(pushes,1);
  price=20000;await checkMonitor(e,m(),upstream);assert.equal(pushes,2);
  price=25000;await checkMonitor(e,m(),upstream);assert.equal(pushes,2);assert.equal(e.DB.sqlite.prepare('SELECT COUNT(*) n FROM deliveries').get().n,0);
  price=22000;await checkMonitor(e,m(),upstream);assert.equal(pushes,3);
  await checkMonitor(e,m(),async()=>new Response(null,{status:403}));assert.match(m().error,/403/);assert.equal(m().best_price,22000);
  price=19000;status=503;await checkMonitor(e,m(),upstream);assert.match(m().error,/push/);assert.equal(e.DB.sqlite.prepare('SELECT price FROM deliveries').get().price,22000);
  status=201;await checkMonitor(e,m(),upstream);assert.equal(e.DB.sqlite.prepare('SELECT price FROM deliveries').get().price,19000);
  status=410;price=18000;await checkMonitor(e,m(),upstream);assert.equal(e.DB.sqlite.prepare('SELECT COUNT(*) n FROM subscriptions').get().n,0);
 }finally{globalThis.fetch=original;}
});
test('cron shares identical searches, skips paused and revoked users, honours lease',async()=>{
 const e=await setup();await add(e);await add(e);const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;return Response.json({prices:[]});};
 try{
  await runChecks(e);assert.equal(calls,1);await runChecks(e);assert.equal(calls,1);
  e.DB.sqlite.exec("UPDATE monitors SET next_check=0; INSERT INTO locks VALUES('cron','other',9999999999999)");await runChecks(e);assert.equal(calls,1);
  e.DB.sqlite.exec("DELETE FROM locks; UPDATE users SET active=0 WHERE id='alice'");await runChecks(e);assert.equal(calls,1);
 }finally{globalThis.fetch=original;}
});
