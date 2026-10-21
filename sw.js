const CACHE='danchezavr-codecraft-desktop-v10';
const ASSETS=['./','./index.html','./styles.css','./manifest.webmanifest','./icon.svg','./src/main.js','./src/engine.js','./src/geo.js','./src/route.js','./src/panorama.js','./src/street-quests.js','./src/grandma.js','./src/levels.js','./src/python-worker.js','./src/python_bootstrap.py'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))),self.clients.claim()])));
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET'||new URL(request.url).origin!==self.location.origin)return;
  event.respondWith(caches.match(request).then(found=>found||fetch(request)));
});
