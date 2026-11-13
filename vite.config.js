import { defineConfig } from 'vite';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
export default defineConfig({
 base: process.env.VITE_BASE_PATH || '/aviasales/',
 build: { outDir: 'dist' },
 plugins: [{
  name: 'pwa-precache',
  async closeBundle() {
   const assets=(await readdir('dist/assets')).filter(name=>!name.endsWith('.map')).sort().map(name=>'assets/'+name);
   const html=await readFile('dist/index.html','utf8');
   const version=createHash('sha256').update(html+assets.join('|')).digest('hex').slice(0,12);
   const sw=(await readFile('dist/sw.js','utf8')).replace("const CACHE='avia-shell-v1';",`const CACHE='avia-shell-${version}';`).replace('const PRECACHE=[];',`const PRECACHE=${JSON.stringify(['',...assets])};`);
   await writeFile('dist/sw.js',sw);
  }
 }]
});
