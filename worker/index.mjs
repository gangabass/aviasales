import webpush from 'web-push';
import { HttpError, today, validateMonitor, ribbonUrl, parsePrices, ticketUrl, shouldNotify, hash, publicMonitor, validateSubscription } from './domain.mjs';
const json = (body, status=200) => new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const all = async (db, sql, ...args) => (await db.prepare(sql).bind(...args).all()).results;
async function body(req) { if (Number(req.headers.get('content-length')) > 16384) throw new HttpError(413,'Запрос слишком большой.'); const text = await req.text(); if (text.length > 16384) throw new HttpError(413,'Запрос слишком большой.'); try { const parsed=JSON.parse(text); if (!parsed || typeof parsed!=='object' || Array.isArray(parsed)) throw new Error(); return parsed; } catch { throw new HttpError(400,'Некорректный JSON.'); } }
async function rate(env, key, limit, seconds) {
 const now = Math.floor(Date.now()/1000);
 const result = await env.DB.prepare('INSERT INTO rate_limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires <= ? THEN 1 ELSE count+1 END, expires=CASE WHEN expires <= ? THEN excluded.expires ELSE expires END RETURNING count').bind(key,now+seconds,now,now).first();
 if (result.count > limit) throw new HttpError(429,'Слишком много запросов. Попробуйте позже.');
}
async function authenticate(req,env) {
 const token = req.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9_-]{32,200})$/)?.[1];
 if (!token) throw new HttpError(401,'Введите токен доступа.');
 const user = await env.DB.prepare('SELECT id,name FROM users WHERE token_hash=? AND active=1').bind(await hash(token)).first();
 if (!user) throw new HttpError(401,'Токен неверен или отозван.');
 return user;
}
async function sendPush(env,sub,payload) {
 if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) throw new Error('Push не настроен на сервере.');
 const details = webpush.generateRequestDetails(JSON.parse(sub.subscription),JSON.stringify(payload),{vapidDetails:{subject:env.VAPID_SUBJECT,publicKey:env.VAPID_PUBLIC_KEY,privateKey:env.VAPID_PRIVATE_KEY},TTL:300,urgency:'normal'});
 const res = await fetch(details.endpoint,{method:'POST',headers:details.headers,body:details.body,redirect:'error',signal:AbortSignal.timeout(15000)});
 if (res.status === 404 || res.status === 410) { await env.DB.prepare('DELETE FROM subscriptions WHERE id=?').bind(sub.id).run(); return false; }
 if (!res.ok) throw new Error(`Push-сервис: HTTP ${res.status}`);
 return true;
}
export async function checkMonitor(env,m,fetcher=fetch) {
 const checkedAt = new Date().toISOString();
 try {
  const res = await fetcher(ribbonUrl(m),{headers:{Accept:'application/json'},signal:AbortSignal.timeout(20000),redirect:'error'});
  if (!res.ok) throw new Error(`Aviasales: HTTP ${res.status}`);
  const prices = parsePrices(await res.json(),m);
  const best = prices[0];
  await env.DB.prepare('UPDATE monitors SET checked_at=?,next_check=?,best_price=?,best_date=?,prices=?,error=NULL WHERE id=?').bind(checkedAt,Date.now()+55000,best?.price??null,best?.date??null,JSON.stringify(prices),m.id).run();
  const current = await env.DB.prepare('SELECT m.enabled,u.active FROM monitors m JOIN users u ON u.id=m.user_id WHERE m.id=?').bind(m.id).first();
  if (!current?.enabled || !current?.active) return;
  const match = best && best.price < m.threshold;
  if (!match) { await env.DB.prepare('DELETE FROM deliveries WHERE monitor_id=?').bind(m.id).run(); return; }
  const subs = await all(env.DB,'SELECT s.*,d.price AS last_price FROM subscriptions s LEFT JOIN deliveries d ON d.subscription_id=s.id AND d.monitor_id=? WHERE s.user_id=?',m.id,m.user_id);
  let failed = false;
  for (const sub of subs) {
   if (!shouldNotify(best.price,sub.last_price)) continue;
   try {
    const sent = await sendPush(env,sub,{title:`${m.origin} → ${m.destination}: ${Math.round(best.price).toLocaleString('ru-RU')} ₽`,body:`Вылет ${best.date.split('-').reverse().join('.')}. Дешевле вашего порога ${m.threshold.toLocaleString('ru-RU')} ₽.`,url:env.APP_URL,tag:`fare-${m.id}`});
    if (sent) await env.DB.prepare('INSERT INTO deliveries(monitor_id,subscription_id,price,sent_at) VALUES(?,?,?,?) ON CONFLICT(monitor_id,subscription_id) DO UPDATE SET price=excluded.price,sent_at=excluded.sent_at').bind(m.id,sub.id,best.price,checkedAt).run();
   } catch { failed=true; }
  }
  if (failed) await env.DB.prepare('UPDATE monitors SET error=? WHERE id=?').bind('Цена получена, но push не доставлен. Повторим при следующей проверке.',m.id).run();
 } catch (e) {
  await env.DB.prepare('UPDATE monitors SET checked_at=?,next_check=?,error=? WHERE id=?').bind(checkedAt,Date.now()+55000,String(e.message).slice(0,200),m.id).run();
 }
}
export async function runChecks(env) {
 const holder = crypto.randomUUID(), now=Date.now();
 const lock = await env.DB.prepare("INSERT INTO locks(name,holder,expires) VALUES('cron',?,?) ON CONFLICT(name) DO UPDATE SET holder=excluded.holder,expires=excluded.expires WHERE locks.expires < ? RETURNING holder").bind(holder,now+300000,now).first();
 if (!lock) return;
 try {
  await env.DB.prepare('UPDATE monitors SET enabled=0 WHERE date_max < ?').bind(today()).run();
  await env.DB.prepare('DELETE FROM rate_limits WHERE expires < ?').bind(Math.floor(now/1000)).run();
  const monitors = await all(env.DB,'SELECT m.* FROM monitors m JOIN users u ON u.id=m.user_id WHERE m.enabled=1 AND u.active=1 AND m.next_check <= ? ORDER BY m.next_check LIMIT 100',now);
  const cache = new Map();
  const sharedFetch = async (url, options) => { const key=String(url); if(!cache.has(key)) cache.set(key,fetch(url,options)); return (await cache.get(key)).clone(); };
  // Four concurrent requests keep the workload bounded. The lease is renewed between batches.
  for(let i=0;i<monitors.length;i+=4) {
   const lease = await env.DB.prepare("UPDATE locks SET expires=? WHERE name='cron' AND holder=? RETURNING holder").bind(Date.now()+300000,holder).first();
   if (!lease) break;
   await Promise.all(monitors.slice(i,i+4).map(m=>checkMonitor(env,m,sharedFetch)));
  }
 } finally { await env.DB.prepare("DELETE FROM locks WHERE name='cron' AND holder=?").bind(holder).run(); }
}
async function api(req,env) {
 const url = new URL(req.url), path=url.pathname, method=req.method;
 if (path==='/api/health' && method==='GET') return json({ok:true});
 await rate(env,`ip:${req.headers.get('cf-connecting-ip') || 'local'}`,120,60);
 const user = await authenticate(req,env);
 if (path==='/api/me' && method==='GET') return json({name:user.name,vapidPublicKey:env.VAPID_PUBLIC_KEY || null});
 if (path==='/api/monitors' && method==='GET') return json({monitors:(await all(env.DB,'SELECT * FROM monitors WHERE user_id=? ORDER BY created_at DESC',user.id)).map(publicMonitor)});
 if (path==='/api/monitors' && method==='POST') {
  const m=validateMonitor(await body(req)), id=crypto.randomUUID();
  const result=await env.DB.prepare('INSERT INTO monitors(id,user_id,origin,destination,date_min,date_max,threshold,direct_only,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM monitors WHERE user_id=?) < 10').bind(id,user.id,m.origin,m.destination,m.dateMin,m.dateMax,m.threshold,Number(m.directOnly),new Date().toISOString(),user.id).run();
  if (!result.meta.changes) throw new HttpError(409,'Можно создать до 10 отслеживаний.');
  return json({monitor:publicMonitor(await env.DB.prepare('SELECT * FROM monitors WHERE id=?').bind(id).first())},201);
 }
 const item=path.match(/^\/api\/monitors\/([a-zA-Z0-9-]+)$/);
 if (item && ['PATCH','DELETE'].includes(method)) {
  const m=await env.DB.prepare('SELECT * FROM monitors WHERE id=? AND user_id=?').bind(item[1],user.id).first();
  if (!m) throw new HttpError(404,'Отслеживание не найдено.');
  if (method==='DELETE') { await env.DB.prepare('DELETE FROM monitors WHERE id=? AND user_id=?').bind(m.id,user.id).run(); return json({ok:true}); }
  const data=await body(req);
  if (typeof data.enabled !== 'boolean') throw new HttpError(400,'Укажите enabled.');
  if (data.enabled && m.date_max < today()) throw new HttpError(400,'Даты отслеживания уже прошли. Создайте новое.');
  await env.DB.prepare('UPDATE monitors SET enabled=?,next_check=0 WHERE id=? AND user_id=?').bind(Number(data.enabled),m.id,user.id).run();
  return json({ok:true});
 }
 if (path==='/api/subscriptions' && method==='POST') {
  const sub=validateSubscription(await body(req));
  const existing=await env.DB.prepare('SELECT id,user_id FROM subscriptions WHERE endpoint=?').bind(sub.endpoint).first();
  if (existing && existing.user_id!==user.id) throw new HttpError(409,'Подписка принадлежит другому токену. Отключите уведомления в прежнем аккаунте.');
  if (!existing && (await env.DB.prepare('SELECT COUNT(*) AS n FROM subscriptions WHERE user_id=?').bind(user.id).first()).n>=10) throw new HttpError(409,'Лимит — 10 устройств.');
  await env.DB.prepare('INSERT INTO subscriptions(id,user_id,endpoint,subscription,created_at) VALUES(?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET subscription=excluded.subscription WHERE subscriptions.user_id=excluded.user_id').bind(crypto.randomUUID(),user.id,sub.endpoint,JSON.stringify(sub),new Date().toISOString()).run();
  return json({ok:true});
 }
 if (path==='/api/subscriptions' && method==='DELETE') { const data=await body(req); await env.DB.prepare('DELETE FROM subscriptions WHERE endpoint=? AND user_id=?').bind(String(data.endpoint || ''),user.id).run(); return json({ok:true}); }
 if (path==='/api/push/test' && method==='POST') {
  await rate(env,`test:${user.id}`,3,60);
  const data=await body(req), sub=await env.DB.prepare('SELECT * FROM subscriptions WHERE endpoint=? AND user_id=?').bind(String(data.endpoint||''),user.id).first();
  if (!sub) throw new HttpError(404,'Сначала включите уведомления на этом устройстве.');
  try { if(!await sendPush(env,sub,{title:'Уведомления работают',body:'Сообщим, когда найдётся билет дешевле вашего порога.',url:env.APP_URL,tag:'test'})) throw new Error(); } catch { throw new HttpError(502,'Push-сервис не принял уведомление. Подключите push заново.'); }
  return json({ok:true});
 }
 throw new HttpError(404,'Маршрут не найден.');
}
export default {
 async fetch(req,env) {
  const origin=req.headers.get('origin'), allowed=(env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim());
  if (origin && !allowed.includes(origin)) return json({error:'Этот origin не разрешён.'},403);
  let response;
  try { response = req.method==='OPTIONS' ? new Response(null,{status:204}) : await api(req,env); }
  catch(e) { if (!(e instanceof HttpError)) console.error('API request failed'); response=json({error:e instanceof HttpError ? e.message : 'Ошибка сервера. Попробуйте позже.'}, e.status || 500); }
  if(origin) { response.headers.set('Access-Control-Allow-Origin',origin); response.headers.set('Vary','Origin'); }
  response.headers.set('Access-Control-Allow-Methods','GET,POST,PATCH,DELETE,OPTIONS');
  response.headers.set('Access-Control-Allow-Headers','Authorization,Content-Type');
  return response;
 },
 async scheduled(event,env,ctx) { ctx.waitUntil(runChecks(env)); }
};


