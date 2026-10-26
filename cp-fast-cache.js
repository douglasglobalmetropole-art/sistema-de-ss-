'use strict';
// Cache persistente da Central de Operacoes. Nunca envia credenciais ao navegador.
// A camada pode ser desativada via CP_PERSISTENT_CACHE_ENABLED=false.
const crypto=require('node:crypto');
const zlib=require('node:zlib');
const TABLE='central_operacoes_cache';
const MAX_INFLATED=18*1024*1024;
const MAX_COMPRESSED=3*1024*1024;

function create(options={}) {
 const base=String(options.url||'').replace(/\/$/,'');
 const key=String(options.key||'');
 const enabled=options.enabled!==false && base.startsWith('https://') && key.length>=12;
 const headers=()=>{
  const h={apikey:key,'Content-Type':'application/json'};
  if(/^eyJ/.test(key))h.Authorization='Bearer '+key;
  return h;
 };
 function digest(value){return crypto.createHash('sha256').update('cp-cache-v10:'+value).digest('hex');}
 async function load(name,{maxAgeMs=120000,maxStaleMs=900000}={}) {
  if(!enabled)return null;
  try {
   const hashed=digest(name);
   const u=new URL(base+'/rest/v1/'+TABLE);
   u.searchParams.set('select','cached_at,payload_b64');
   u.searchParams.set('cache_key','eq.'+hashed);
   u.searchParams.set('limit','1');
   const response=await fetch(u,{headers:headers(),signal:AbortSignal.timeout(3500)});
   if(!response.ok)throw Error('read:'+response.status);
   const rows=await response.json();
   const row=rows?.[0];
   if(!row||typeof row.payload_b64!=='string')return null;
   const age=Date.now()-Date.parse(row.cached_at);
   if(!Number.isFinite(age)||age< -120000||age>maxStaleMs)return null;
   const buf=Buffer.from(row.payload_b64,'base64');
   if(!buf.length||buf.length>MAX_COMPRESSED)throw Error('compressed-size');
   const payload=JSON.parse(zlib.gunzipSync(buf,{maxOutputLength:MAX_INFLATED}).toString('utf8'));
   if(!payload||!Array.isArray(payload.dados)||typeof payload.truncado!=='boolean')return null;
   return {payload,at:row.cached_at,age,stale:age>maxAgeMs};
  }catch(err){console.warn('CP cache (leitura):',String(err.message||err).slice(0,100));return null;}
 }
 async function save(name,payload) {
  if(!enabled)return false;
  try {
   const raw=Buffer.from(JSON.stringify(payload));
   if(raw.length>MAX_INFLATED)return false;
   const buf=zlib.gzipSync(raw,{level:4});
   if(buf.length>MAX_COMPRESSED)return false;
   const response=await fetch(base+'/rest/v1/'+TABLE,{
    method:'POST',headers:{...headers(),Prefer:'resolution=merge-duplicates,return=minimal'},
    body:JSON.stringify({cache_key:digest(name),payload_b64:buf.toString('base64'),cached_at:new Date().toISOString()}),
    signal:AbortSignal.timeout(5500)
   });
   if(!response.ok)throw Error('write:'+response.status);
   return true;
  }catch(err){console.warn('CP cache (gravacao):',String(err.message||err).slice(0,100));return false;}
 }
 return {enabled,load,save,digest};
}
module.exports={create};
