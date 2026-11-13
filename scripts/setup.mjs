import {readFile,writeFile,access} from 'node:fs/promises';
import {createECDH} from 'node:crypto';
import webpush from 'web-push';
const file=new URL('../server/.env',import.meta.url);
let existing='';try{existing=await readFile(file,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
let prior='';try{prior=await readFile(new URL('../.dev.vars',import.meta.url),'utf8');}catch{}
const value=k=>existing.match(new RegExp(`^${k}=(.+)$`,'m'))?.[1]?.trim()||prior.match(new RegExp(`^${k}=(.+)$`,'m'))?.[1]?.trim();
const privateKey=value('VAPID_PRIVATE_KEY'),publicKey=value('VAPID_PUBLIC_KEY');let pair;
if(privateKey){const ec=createECDH('prime256v1');ec.setPrivateKey(Buffer.from(privateKey,'base64url'));const derived=ec.getPublicKey().toString('base64url');if(publicKey&&publicKey!==derived)throw new Error('VAPID keys differ; unchanged');pair={privateKey,publicKey:derived};}else if(publicKey)throw new Error('Restore missing VAPID private key');else pair=webpush.generateVAPIDKeys();
const defaults={ALLOWED_ORIGINS:'https://gangabass.duckdns.org,https://gangabass.github.io',APP_URL:'https://gangabass.duckdns.org/aviasales/',VAPID_SUBJECT:'mailto:gangabass@gmail.com',VAPID_PUBLIC_KEY:pair.publicKey,VAPID_PRIVATE_KEY:pair.privateKey};
for(const [k,v]of Object.entries(defaults))if(!new RegExp(`^${k}=.+$`,'m').test(existing))existing+=`${existing.endsWith('\n')||!existing?'':'\n'}${k}=${v}\n`;
await writeFile(file,existing,{mode:0o600});console.log('server/.env configured; secrets not displayed.');
