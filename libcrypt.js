/* ============ Archivo de enseñanzas cifrado ============
   En GitHub las enseñanzas se publican cifradas (biblioteca.enc): nadie puede leerlas sin la clave del archivo.
   La primera vez, en cada equipo, la app pide esa clave; luego la recuerda en el propio equipo (nunca se sube). */
(function(){
"use strict";
const SALT_HEX="e6ad908c3b7d35e42e54362bea50eada",ITER=310000,KEYNAME="tp_libkey",DBN="taller-predicador";
const hex2b=h=>new Uint8Array(h.match(/../g).map(x=>parseInt(x,16)));
const b64=u=>{let s="";const a=new Uint8Array(u);for(let i=0;i<a.length;i++)s+=String.fromCharCode(a[i]);return btoa(s)};
const unb64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
function idb(){return new Promise(res=>{try{const r=indexedDB.open(DBN,1);r.onupgradeneeded=()=>r.result.createObjectStore("kv");r.onsuccess=()=>res(r.result);r.onerror=()=>res(null);setTimeout(()=>res(null),4000)}catch(e){res(null)}})}
async function kget(){if(window.TP&&TP.kv&&TP.kv.has(KEYNAME))return TP.kv.get(KEYNAME);const d=await idb();if(!d)return null;
  return new Promise(res=>{try{const q=d.transaction("kv").objectStore("kv").get(KEYNAME);q.onsuccess=()=>{d.close();res(q.result||null)};q.onerror=()=>{d.close();res(null)}}catch(e){res(null)}})}
async function kset(v){if(window.TP&&TP.kv&&TP.put){TP.kv.set(KEYNAME,v);TP.put(KEYNAME,v);return}const d=await idb();if(!d)return;
  try{const t=d.transaction("kv","readwrite");t.objectStore("kv").put(v,KEYNAME);t.oncomplete=()=>d.close()}catch(e){}}
async function derive(pass){const k=await crypto.subtle.importKey("raw",new TextEncoder().encode(pass.trim().toLowerCase()),"PBKDF2",false,["deriveBits"]);
  return crypto.subtle.deriveBits({name:"PBKDF2",salt:hex2b(SALT_HEX),iterations:ITER,hash:"SHA-256"},k,256)}
async function decrypt(buf,raw){const u=new Uint8Array(buf);
  if(u[0]!==84||u[1]!==80||u[2]!==69||u[3]!==49)throw new Error("formato");
  const key=await crypto.subtle.importKey("raw",raw,"AES-GCM",false,["decrypt"]);
  const pt=await crypto.subtle.decrypt({name:"AES-GCM",iv:u.slice(5,17)},key,u.slice(17));
  let txt;if(u[4]===1){const s=new Blob([pt]).stream().pipeThrough(new DecompressionStream("gzip"));txt=await new Response(s).text()}else txt=new TextDecoder().decode(pt);
  return JSON.parse(txt)}
let ASK=null;
function ask(buf){if(ASK)return ASK;ASK=new Promise(done=>{
  const el=document.createElement("div");el.id="libkey";el.setAttribute("role","dialog");el.setAttribute("aria-modal","true");
  el.style.cssText="position:fixed;inset:0;z-index:100001;display:flex;align-items:center;justify-content:center;padding:20px;background:var(--bg,#F2F6F7);color:var(--ink,#1B2230);font-family:var(--f-ui,system-ui)";
  el.innerHTML='<form style="width:min(380px,100%);display:grid;gap:12px;text-align:center" autocomplete="off"><b style="font-family:var(--f-text,Georgia);font-size:21px;color:var(--azul,#1D3557)">Abrir su archivo de enseñanzas</b>'+
    '<span style="font-size:14px;color:var(--muted,#69707C)">Sus enseñanzas están protegidas. Escriba la clave del archivo. Solo se pide una vez en este equipo.</span>'+
    '<input id="lkk" type="password" placeholder="Clave del archivo" autocapitalize="off" autocorrect="off" spellcheck="false" style="font-size:18px;padding:12px 14px;border-radius:12px;border:1px solid var(--line,#ccc);background:var(--surface,#fff);color:inherit">'+
    '<button type="submit" style="font:inherit;font-weight:600;padding:12px;border-radius:12px;border:0;background:var(--azul,#1D3557);color:var(--azul-ink,#fff)">Abrir</button>'+
    '<span id="lke" role="alert" style="min-height:20px;font-size:14px;color:#A23B32"></span></form>';
  document.body.appendChild(el);const f=el.querySelector("form"),inp=el.querySelector("#lkk"),er=el.querySelector("#lke");setTimeout(()=>inp.focus(),200);
  f.onsubmit=async e=>{e.preventDefault();const v=inp.value;if(!v.trim())return;er.textContent="Abriendo…";
    try{const raw=await derive(v);await decrypt(buf,raw);await kset(b64(raw));el.remove();ASK=null;done(raw)}
    catch(x){er.textContent="Esa clave no abre el archivo. Revísela e intente de nuevo.";inp.select()}};
});return ASK}
/* lee biblioteca.enc (o biblioteca.json si no está cifrada, como en el Armador) */
window.libFetch=async function(name){
  let r=null;try{r=await fetch(name+".enc")}catch(e){}
  if(!r||!r.ok){const j=await fetch(name+".json");if(!j.ok)throw new Error("lib");return j.json()}
  const buf=await r.arrayBuffer();
  const s=await kget();if(s){try{return await decrypt(buf,unb64(s))}catch(e){}}
  const raw=await ask(buf);
  return decrypt(buf,raw)};
window.libKeyForget=async function(){await kset("");if(window.TP&&TP.del)TP.del(KEYNAME)};
})();
