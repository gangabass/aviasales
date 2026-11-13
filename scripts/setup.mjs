import { readFile, writeFile, access } from 'node:fs/promises';
import { createECDH } from 'node:crypto';
import webpush from 'web-push';
const file=new URL('../.dev.vars',import.meta.url);
let existing='';try{existing=await readFile(file,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
const privateKey=existing.match(/^VAPID_PRIVATE_KEY=(.+)$/m)?.[1]?.trim();
const publicKey=existing.match(/^VAPID_PUBLIC_KEY=(.+)$/m)?.[1]?.trim();
let pair;
if(privateKey){const ec=createECDH('prime256v1');ec.setPrivateKey(Buffer.from(privateKey,'base64url'));const derived=ec.getPublicKey().toString('base64url');if(publicKey&&publicKey!==derived)throw new Error('VAPID-ключи не образуют пару. Существующий файл оставлен без изменений.');pair={privateKey,publicKey:derived};}
else if(publicKey)throw new Error('Нет приватного VAPID-ключа. Восстановите его из резервной копии. Файл оставлен без изменений.');
else pair=webpush.generateVAPIDKeys();
for(const [key,value] of Object.entries({VAPID_PUBLIC_KEY:pair.publicKey,VAPID_PRIVATE_KEY:pair.privateKey})){
 if(!new RegExp(`^${key}=.+$`,'m').test(existing))existing+=`${existing.endsWith('\n')||!existing?'':'\n'}${key}=${value}\n`;
}
await writeFile(file,existing,{mode:0o600});
try{await access(new URL('../.env',import.meta.url));}catch{await writeFile(new URL('../.env',import.meta.url),await readFile(new URL('../.env.example',import.meta.url)),{mode:0o600});}
console.log('VAPID-ключи сохранены в .dev.vars; существующие значения сохранены. Не публикуйте этот файл.');
