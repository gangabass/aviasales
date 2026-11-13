import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const config=JSON.parse(readFileSync(new URL('../wrangler.json',import.meta.url),'utf8').replace(/^\uFEFF/,''));
const database=config.d1_databases?.find(db=>db.binding==='DB');
if(!/^[0-9a-f-]{36}$/i.test(database?.database_id||''))throw new Error('Укажите реальный D1 database_id в wrangler.json и отправьте коммит в GitHub.');
if(!config.vars?.VAPID_SUBJECT || config.vars.VAPID_SUBJECT.includes('replace@example.com'))throw new Error('Укажите VAPID_SUBJECT с вашим email в wrangler.json.');
const wrangler=new URL('../node_modules/wrangler/bin/wrangler.js',import.meta.url);
for(const args of [['d1','migrations','apply','DB','--remote'],['deploy']]){
 const result=spawnSync(process.execPath,[wrangler.pathname.replace(/^\/([A-Za-z]:)/,'$1'),...args],{stdio:'inherit',env:process.env});
 if(result.error)throw result.error;
 if(result.status!==0)process.exit(result.status||1);
}

