import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
const root=resolve('dist');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
export async function staticFile(req,res){
 const path=new URL(req.url,'http://localhost').pathname;
 if(path==='/aviasales'){res.writeHead(302,{Location:'/aviasales/'});res.end();return true;}
 if(!path.startsWith('/aviasales/'))return false;
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return true;}
 let decoded;try{decoded=decodeURIComponent(path.slice('/aviasales/'.length));}catch{res.writeHead(400);res.end();return true;}
 const file=resolve(root,decoded||'index.html');
 if(!file.startsWith(root+sep)){res.writeHead(404);res.end();return true;}
 try{const data=await readFile(file);res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':path.includes('/assets/')?'public, max-age=31536000, immutable':'no-cache','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:data);}catch{res.writeHead(404);res.end();}
 return true;
}
