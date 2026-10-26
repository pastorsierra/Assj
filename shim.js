/* Taller del Predicador · versión independiente.
   Reemplaza lo que daba Claude: la IA (API de Anthropic con su clave), las descargas y el almacenamiento en el equipo. */
(function(){
"use strict";
const TP=window.TP={kv:new Map(),cfgKey:"tp_cfg",version:"1b3fb06e"};
/* ---------- almacenamiento: IndexedDB con copia en memoria ---------- */
let idb=null;
/* Safari en iPad/iPhone a veces deja «dormido» IndexedDB al pasar de una página a otra (por ejemplo, al volver
   de Diapositivas): indexedDB.open() no responde nunca. Se despierta llamando a indexedDB.databases() mientras se abre,
   y si aun así no responde se reintenta. */
function openDB(){return new Promise((res,rej)=>{let kick=null;try{
  if(indexedDB.databases){const k=()=>{try{indexedDB.databases().catch(()=>{})}catch(e){}};k();kick=setInterval(k,120)}
  const r=indexedDB.open("taller-predicador",1);const end=()=>{if(kick)clearInterval(kick)};
  r.onupgradeneeded=()=>r.result.createObjectStore("kv");r.onsuccess=()=>{end();const d=r.result;d.onversionchange=()=>{try{d.close()}catch(e){}};res(d)};r.onerror=()=>{end();rej(r.error)};r.onblocked=()=>{}}catch(e){if(kick)clearInterval(kick);rej(e)}})}
const tmo=(p,ms)=>Promise.race([p,new Promise((_,rej)=>setTimeout(()=>rej(Object.assign(new Error("timeout"),{tmo:1})),ms))]);
async function openRetry(){let last;for(let i=0;i<4;i++){try{return await tmo(openDB(),2500)}catch(e){last=e;if(!(e&&e.tmo))throw e}}throw last}
async function hydrate(){
  try{
    idb=await openRetry();
    await tmo(new Promise((res,rej)=>{const tx=idb.transaction("kv","readonly"),st=tx.objectStore("kv"),rq=st.openCursor();
      rq.onsuccess=()=>{const c=rq.result;if(c){TP.kv.set(c.key,c.value);c.continue()}else res()};rq.onerror=()=>rej(rq.error)}),10000);
    try{sessionStorage.removeItem("tp_rl")}catch{}
  }catch(e){if(e&&e.tmo){TP.stuck=true;return}idb=null;console.warn("IndexedDB no disponible, se usa localStorage",e);try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k.startsWith("tp_"))TP.kv.set(k,localStorage.getItem(k))}}catch{}}
  try{navigator.storage?.persist?.()}catch{}
}
TP.put=function(k,v){
  if(idb){try{const tx=idb.transaction("kv","readwrite");v===undefined?tx.objectStore("kv").delete(k):tx.objectStore("kv").put(v,k);tx.onerror=()=>{try{window.toast&&toast("No se pudo guardar: revise el espacio del equipo")}catch{}}}catch(e){console.warn(e)}}
  else{try{v===undefined?localStorage.removeItem(k):localStorage.setItem(k,v)}catch{}}
};
TP.del=function(k){TP.kv.delete(k);TP.put(k,undefined)};
/* ---------- ajustes de la IA ---------- */
const MODELOS=[["claude-haiku-5-5","Haiku 5.5","el más económico"],["claude-sonnet-5-5","Sonnet 5.5","recomendado"],["claude-opus-5-5","Opus 5.5","más profundo"],["claude-fable-5-1","Fable 5.1","el más potente"]];
TP.MODELOS=MODELOS;
TP.cfg=function(){let c={};try{c=JSON.parse(TP.kv.get(TP.cfgKey)||"{}")}catch{}
  return {key:c.key||"",modelDefault:c.modelDefault||"claude-sonnet-5-5",modelComplex:c.modelComplex||"claude-sonnet-5-5"}};
TP.saveCfg=function(c){const s=JSON.stringify(c);TP.kv.set(TP.cfgKey,s);TP.put(TP.cfgKey,s)};
/* ---------- IA: API de Anthropic ---------- */
const API="https://api.anthropic.com/v1/messages";
const mk=(code,message)=>Object.assign(new Error(message||code),{code});
function headers(key){return {"content-type":"application/json","x-api-key":key,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"}}
async function httpError(res){let j=null;try{j=await res.json()}catch{}
  const msg=(j&&j.error&&j.error.message)||"";const st=res.status;
  if(st===401||st===403)return mk("bad_key",msg);
  if(st===429)return mk("rate_limited",msg);
  if(/credit balance/i.test(msg))return mk("no_credit",msg);
  if(st===413||/too long|too large|exceed/i.test(msg))return mk("prompt_too_large",msg);
  if(st===404)return mk("bad_model",msg);
  if(st>=500||st===529)return mk("overloaded",msg);
  return mk("api_error",msg||("Error "+st))}
async function sample(prompt,opts={}){
  const cfg=TP.cfg();if(!cfg.key)throw mk("no_key");
  const complex=opts.modelTier==="complex";
  const model=complex?cfg.modelComplex:cfg.modelDefault;
  const messages=(typeof prompt==="string"?[{role:"user",content:prompt}]:prompt).map(m=>({role:m.role,content:String(m.content??"")})).filter(m=>m.content.trim());
  const body={model,max_tokens:complex?16000:8000,stream:true,messages};
  let res;
  try{res=await fetch(API,{method:"POST",headers:headers(cfg.key),body:JSON.stringify(body),signal:opts.signal})}
  catch(e){if(e&&e.name==="AbortError")throw Object.assign(mk("cancelled"),{text:""});throw mk("network")}
  if(!res.ok)throw await httpError(res);
  const rd=res.body.getReader(),dec=new TextDecoder();let buf="",text="",stop="";
  try{
    for(;;){const {done,value}=await rd.read();if(done)break;buf+=dec.decode(value,{stream:true});
      let i;while((i=buf.indexOf("\n\n"))>=0){const ev=buf.slice(0,i);buf=buf.slice(i+2);
        const line=ev.split("\n").find(l=>l.startsWith("data:"));if(!line)continue;
        let j;try{j=JSON.parse(line.slice(5))}catch{continue}
        if(j.type==="content_block_delta"&&j.delta&&j.delta.type==="text_delta"){text+=j.delta.text;if(opts.onText)opts.onText({text})}
        else if(j.type==="message_delta"&&j.delta&&j.delta.stop_reason)stop=j.delta.stop_reason;
        else if(j.type==="error")throw Object.assign(mk(j.error&&j.error.type==="overloaded_error"?"overloaded":"api_error",j.error&&j.error.message),{text})}}
  }catch(e){if(e&&e.name==="AbortError")throw Object.assign(mk("cancelled"),{text});if(e&&e.code)throw e;throw Object.assign(mk("network"),{text})}
  if(!text.trim())throw mk("empty_completion");
  if(stop==="refusal")throw Object.assign(mk("refused"),{text});
  return {text,truncated:stop==="max_tokens"};
}
TP.ping=async function(key,model){
  let res;try{res=await fetch(API,{method:"POST",headers:headers(key),body:JSON.stringify({model,max_tokens:16,messages:[{role:"user",content:"Responde solo: listo"}]})})}catch{throw mk("network")}
  if(!res.ok)throw await httpError(res);return true};
/* ---------- descargas ---------- */
function showDeliver(file){
  const sh=document.getElementById("sheet");if(!sh)return;
  sh.innerHTML=`<div class="sheet" role="dialog" aria-modal="true"><h2>Su archivo está listo</h2><p class="muted">${file.name.replace(/[<>&]/g,"")}</p><div class="row" style="margin-top:12px"><button class="btn primary" id="dlgo">Guardar o compartir</button><button class="btn ghost" id="dlno">Cerrar</button></div></div>`;
  sh.hidden=false;
  sh.querySelector("#dlno").onclick=()=>{sh.hidden=true;sh.innerHTML=""};
  sh.querySelector("#dlgo").onclick=async()=>{try{await navigator.share({files:[file]});sh.hidden=true;sh.innerHTML=""}catch(e){if(e&&e.name==="AbortError")return;anchorDownload(file)}};
}
function anchorDownload(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=name||blob.name||"archivo";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)}
const isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
async function save({filename,data}){
  const type=/\.docx$/i.test(filename)?"application/vnd.openxmlformats-officedocument.wordprocessingml.document":/\.json$/i.test(filename)?"application/json":"text/plain;charset=utf-8";
  const blob=data instanceof Blob?data:new Blob([data],{type});
  if(isIOS&&navigator.canShare){
    const file=new File([blob],filename,{type:blob.type||type});
    if(navigator.canShare({files:[file]})){
      try{await navigator.share({files:[file]});return}
      catch(e){if(e&&e.name==="AbortError")return;showDeliver(file);return}
    }
  }
  anchorDownload(blob,filename);
}
window.claude={use:async name=>name==="sample"?sample:name==="downloads"?{save}:null};
/* ---------- arranque: cargar datos y luego la app ---------- */
async function boot(){
  await hydrate();
  if(TP.stuck){let again=false;try{again=!!sessionStorage.getItem("tp_rl");sessionStorage.setItem("tp_rl","1")}catch{}
    if(!again){location.reload();return}
    const d=document.createElement("div");d.style.cssText="position:fixed;inset:0;z-index:200000;background:#F2F6F7;display:grid;place-items:center;padding:24px;font-family:system-ui;text-align:center;color:#1B2230";
    d.innerHTML='<div style="max-width:360px;display:grid;gap:14px"><b style="font-size:20px">La app no pudo abrir sus datos</b><span>Sus enseñanzas están a salvo. Cierre la app por completo (deslícela hacia arriba) y vuelva a abrirla.</span><button style="font:inherit;font-weight:600;padding:12px;border-radius:12px;border:0;background:#1F4E78;color:#fff" onclick="try{sessionStorage.removeItem(\'tp_rl\')}catch(e){}location.reload()">Intentar de nuevo</button></div>';
    document.body.appendChild(d);return}
  for(const s of document.querySelectorAll('script[type="text/app"]')){const n=document.createElement("script");n.textContent=s.textContent;document.body.appendChild(n)}
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();
/* ---------- al salir de la página: soltar la base de datos; si Safari la devuelve congelada, recargar ---------- */
window.addEventListener("pagehide",()=>{try{if(idb){idb.close();idb=null;TP.closed=true}}catch(e){}});
window.addEventListener("pageshow",e=>{if(e.persisted||TP.closed)location.reload()});
/* ---------- sin conexión ---------- */
if("serviceWorker" in navigator){
  const had=!!navigator.serviceWorker.controller;
  window.addEventListener("load",()=>{navigator.serviceWorker.register("sw.js").catch(e=>console.warn("sw",e))});
  navigator.serviceWorker.addEventListener("controllerchange",()=>{if(had){try{toast("Hay una versión nueva. Cierre la app y ábrala de nuevo.")}catch{}}});
}
})();
