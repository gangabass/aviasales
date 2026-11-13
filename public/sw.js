const CACHE='avia-shell-v1';
const PRECACHE=[];
const scope=new URL('./',self.location.href).href;
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll([scope+'icon.svg',scope+'manifest.webmanifest',scope+'offline.html',...PRECACHE.map(path=>scope+path)])));self.skipWaiting();});
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('avia-shell-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const req=event.request,url=new URL(req.url);
 if(req.method!=='GET'||url.origin!==self.location.origin||!url.href.startsWith(scope)||url.pathname.includes('/api/'))return;
 if(req.mode==='navigate'){
  event.respondWith(fetch(req).then(res=>{if(res.ok){const copy=res.clone();event.waitUntil(caches.open(CACHE).then(c=>c.put(scope,copy)));}return res;}).catch(async()=>await caches.match(scope)||await caches.match(scope+'offline.html')));return;
 }
 if(url.pathname.includes('/assets/')||/\.(svg|png|webmanifest)$/.test(url.pathname))event.respondWith(caches.match(req).then(hit=>hit||fetch(req).then(res=>{if(res.ok){const copy=res.clone();event.waitUntil(caches.open(CACHE).then(c=>c.put(req,copy)));}return res;})));
});
self.addEventListener('push',event=>{
 let data={};try{data=event.data?.json()||{};}catch{}
 event.waitUntil(self.registration.showNotification(data.title||'На взлёт',{body:data.body||'Проверьте новые цены в приложении.',icon:scope+'icon-192.png',badge:scope+'icon-192.png',tag:data.tag||'avia',data:{url:scope}}));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async clients=>{const tab=clients.find(c=>c.url.startsWith(scope));if(tab)return tab.focus();return self.clients.openWindow(scope);}));
});

