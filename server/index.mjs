import { createServer } from 'node:http';
import { resolve } from 'node:path';
import api,{runChecks} from './api.mjs';
import {database} from './database.mjs';
import {staticFile} from './static.mjs';
process.umask(0o077);
const DB=database(resolve(process.env.DATA_DIR||'data','aviasales.sqlite'));
const env={...process.env,DB};
for(const key of ['VAPID_PUBLIC_KEY','VAPID_PRIVATE_KEY','VAPID_SUBJECT','ALLOWED_ORIGINS','APP_URL'])if(!env[key])throw new Error(`Missing ${key}`);
const server=createServer(async(req,res)=>{
 try{
  if(await staticFile(req,res))return;
  const chunks=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>16384){res.writeHead(413,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Запрос слишком большой.'}));return;}chunks.push(chunk);}
  const headers=new Headers();for(const [key,value]of Object.entries(req.headers))if(value!==undefined&&!['cf-connecting-ip','x-real-ip','x-forwarded-for'].includes(key))headers.set(key,Array.isArray(value)?value.join(','):value);
  // Only the reverse proxy can reach this container's HTTP port.
  headers.set('cf-connecting-ip',String(req.headers['x-real-ip']||req.socket.remoteAddress||'local'));
  const request=new Request(new URL(req.url,'http://localhost'),{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
  const response=await api.fetch(request,env);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch{if(!res.headersSent)res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Ошибка сервера.'}));}
});
server.requestTimeout=30000;server.headersTimeout=15000;
let active=null,stopping=false;
function tick(){if(active||stopping)return;active=runChecks(env).catch(()=>console.error('Scheduled price check failed')).finally(()=>{active=null;});}
const timer=setInterval(tick,60000);
server.listen(Number(process.env.PORT||3003),process.env.HOST||'127.0.0.1',()=>{console.log('Aviasales API listening on '+server.address().port+'; polling every 60 seconds');tick();});
async function stop(){if(stopping)return;stopping=true;clearInterval(timer);const timeout=setTimeout(()=>process.exit(1),25000);timeout.unref();await new Promise(resolve=>server.close(resolve));if(active)await active;DB.close();process.exit(0);}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
