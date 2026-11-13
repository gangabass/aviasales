import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {database} from './database.mjs';
const file=process.argv[2];if(!file)throw new Error('Usage: node server/import-user.mjs /path/to/user.sql');
const db=database(resolve(process.env.DATA_DIR||'data','aviasales.sqlite'));
try{db.sqlite.exec(readFileSync(file,'utf8'));console.log('User SQL applied.');}finally{db.close();}
