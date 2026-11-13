import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {database} from '../server/database.mjs';
import {hash} from '../server/domain.mjs';
import webpush from 'web-push';
test('HTTP server persists data, requires token and enforces CORS and body size',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'avia-http-')),token='c'.repeat(43),keys=webpush.generateVAPIDKeys();
 const db=database(join(dir,'aviasales.sqlite'));db.sqlite.prepare('INSERT INTO users(id,name,token_hash) VALUES(?,?,?)').run('http','HTTP',await hash(token));db.close();
 const child=spawn(process.execPath,['server/index.mjs'],{env:{...process.env,PORT:'0',HOST:'127.0.0.1',DATA_DIR:dir,VAPID_PUBLIC_KEY:keys.publicKey,VAPID_PRIVATE_KEY:keys.privateKey,VAPID_SUBJECT:'mailto:test@example.com',APP_URL:'https://example.com/aviasales/',ALLOWED_ORIGINS:'https://example.com'},stdio:['ignore','pipe','pipe']});
 let errors='';child.stderr.on('data',b=>errors+=b);
 try{
  const port=await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error('Server startup timeout '+errors)),10000);child.stdout.on('data',b=>{const m=String(b).match(/listening on (\d+)/);if(m){clearTimeout(t);resolve(m[1]);}});child.once('exit',()=>{clearTimeout(t);reject(new Error('Server exited '+errors));});});
  const base='http://127.0.0.1:'+port;
  assert.equal((await fetch(base+'/api/health')).status,200);
  assert.equal((await fetch(base+'/api/me')).status,401);
  const auth={Authorization:'Bearer '+token,Origin:'https://example.com'};
  const me=await fetch(base+'/api/me',{headers:auth});assert.equal(me.status,200);assert.equal((await me.json()).name,'HTTP');
  assert.equal((await fetch(base+'/api/me',{headers:{...auth,Origin:'https://evil.test'}})).status,403);
  assert.equal((await fetch(base+'/api/monitors',{method:'POST',headers:auth,body:'x'.repeat(17000)})).status,413);
 }finally{if(child.exitCode===null){const done=new Promise(r=>child.once('exit',r));child.kill();await done;}await rm(dir,{recursive:true,force:true});}
});
