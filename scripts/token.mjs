import { mkdir,writeFile } from 'node:fs/promises';
import { randomBytes,randomUUID,createHash } from 'node:crypto';
const args=process.argv.slice(2), revoke=args[0]==='--revoke';
const dir=new URL('../private/',import.meta.url);await mkdir(dir,{recursive:true});
if(revoke){
 const id=args[1];if(!/^[a-f0-9-]{36}$/.test(id||''))throw new Error('Использование: npm run token -- --revoke UUID');
 const file=new URL(`revoke-${id}.sql`,dir);await writeFile(file,`UPDATE users SET active=0 WHERE id='${id}';\nDELETE FROM subscriptions WHERE user_id='${id}';\n`,{mode:0o600});console.log(`SQL отзыва сохранён в private/revoke-${id}.sql. Примените к серверной SQLite.`);
}else{
 const name=args.join(' ').trim();if(!name||name.length>80)throw new Error('Использование: npm run token -- "Имя пользователя" (до 80 символов)');
 const id=randomUUID(),token=randomBytes(32).toString('base64url'),hash=createHash('sha256').update(token).digest('hex');
 await writeFile(new URL(`token-${id}.txt`,dir),`Имя: ${name}\nID: ${id}\nТокен: ${token}\n`,{mode:0o600});
 await writeFile(new URL(`user-${id}.sql`,dir),`INSERT INTO users(id,name,token_hash) VALUES('${id}','${name.replaceAll("'","''")}','${hash}');\n`,{mode:0o600});
 console.log(`Токен: private/token-${id}.txt\nSQL пользователя: private/user-${id}.sql\nСекрет не выводится в терминал. Импортируйте SQL командой server/import-user.mjs.`);
}
