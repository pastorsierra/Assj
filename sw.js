const V="tp-b4342529";
const CORE=["./", "OFL-Cormorant-Garamond.txt", "OFL-Literata.txt", "apple-touch-icon.png", "biblioteca-nueva.enc", "biblioteca.enc", "diapositivas.html", "docx.js", "html2canvas.min.js", "icon-192.png", "icon-512.png", "index.html", "jsQR.js", "jspdf.umd.min.js", "libcrypt.js", "lugares.json", "manifest.webmanifest", "mapa.json", "pptxgen.bundle.js", "qrcode.js", "rv1909.json", "taller-lectura-italica.woff", "taller-lectura.woff", "taller-titulos-italica.woff", "taller-titulos.woff", "xref.json", "shim.js"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith("tp-")&&k!==V&&k!=="tp-fonts"&&k!=="tp-datos").map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",e=>{
  const r=e.request;if(r.method!=="GET")return;
  const u=new URL(r.url);
  if(u.hostname==="fonts.googleapis.com"||u.hostname==="fonts.gstatic.com"){
    e.respondWith(caches.open("tp-fonts").then(async c=>{const hit=await c.match(r);const net=fetch(r).then(x=>{if(x&&(x.ok||x.type==="opaque"))c.put(r,x.clone());return x}).catch(()=>hit);return hit||net}));return}
  if(u.origin!==location.origin)return;
  if(u.pathname.includes("/datos/")){e.respondWith(caches.open("tp-datos").then(async c=>{const hit=await c.match(r);if(hit)return hit;try{const x=await fetch(r);if(x.ok)c.put(r,x.clone());return x}catch{return new Response("Sin conexión",{status:503})}}));return}
  e.respondWith((async()=>{
    const c=await caches.open(V);
    const hit=await c.match(r,{ignoreSearch:true})||(r.mode==="navigate"?await c.match(u.pathname.endsWith("diapositivas.html")?"diapositivas.html":"index.html"):null);
    if(hit)return hit;
    try{const x=await fetch(r);if(x.ok)c.put(r,x.clone());return x}catch{return new Response("Sin conexión",{status:503})}
  })());
});
