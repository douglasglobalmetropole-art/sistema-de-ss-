'use strict';
// CP_V24_RASTREIO_SEGURO: rota opcional da API dashboard.umov.me.
// NUNCA usar JWT, cookies ou resposta real do usuario no codigo-fonte.
// O compartilhamento das posicoes exige uma chave independente, de uso interno.
const crypto = require('node:crypto');
const ENDPOINT='https://dashboard.umov.me/agents/lastPosition';
const CACHE_TTL=45000;

function posicoesDoUmov(raw){
  const entries=Array.isArray(raw)?raw:Array.isArray(raw?.data)?raw.data:Array.isArray(raw?.rows)?raw.rows:[];
  return entries.slice(0,2000).flatMap(x=>{
    if(!x||typeof x!=='object')return [];
    const m=String(x.lastGeopositionSynced||'').match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
    if(!m)return [];
    const lat=Number(m[1]),lon=Number(m[2]);
    if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat < -35||lat>6||lon < -75||lon>-30)return [];
    const name=String(x.name||'').trim().slice(0,120);
    const at=String(x.dateHourLastGeoposition||'').trim();
    if(!name||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(at))return [];
    return [{id:String(x.id||'').slice(0,30),name,latitude:lat,longitude:lon,at}];
  });
}
function constantEqual(actual,secret){
  if(typeof actual!=='string'||!secret||actual.length>256||actual.length===0)return false;
  return crypto.timingSafeEqual(crypto.createHash('sha256').update(actual).digest(),crypto.createHash('sha256').update(secret).digest());
}
function createTrackingHandler({getEnv=()=>process.env,fetchImpl=fetch,clock=Date.now}={}){
  let cache=null,inflight=null;
  return async function tracking(req,res){
    res.set('Cache-Control','no-store');res.set('Pragma','no-cache');
    const env=getEnv();
    const secret=String(env.CP_GPS_VIEW_KEY||'');
    const bearer=String(env.UMOV_DASHBOARD_BEARER||'').replace(/^Bearer\s+/i,'').trim();
    if(!secret||secret.length<16||!bearer)return res.status(503).json({ok:false,error:'Rastreio ainda nao configurado no servidor. Configure as duas variaveis de ambiente.'});
    if(!constantEqual(req.get('X-CP-Tracking-Key'),secret))return res.status(403).json({ok:false,error:'Acesso ao rastreio nao autorizado.'});
    try{
      if(!cache||clock()-cache.ts>=CACHE_TTL){
        if(!inflight){
          inflight=(async()=>{
            const r=await fetchImpl(ENDPOINT,{headers:{accept:'application/json',authorization:'Bearer '+bearer,origin:'https://management-panel.umov.me',referer:'https://management-panel.umov.me/'},signal:AbortSignal.timeout(7500),redirect:'error'});
            if(!r.ok){
              if(r.status===401||r.status===403)throw new Error('AUTH_EXPIRED');
              throw new Error('PROVIDER_'+r.status);
            }
            const body=await r.json();
            const coords=posicoesDoUmov(body);
            cache={ts:clock(),coords};
          })().finally(()=>{inflight=null});
        }
        await inflight;
      }
      return res.json({ok:true,fonte:'uMov / ultima posicao informada',coletado_em:new Date(cache.ts).toISOString(),posicoes:cache.coords});
    }catch(e){
      // Nao escrever headers, JWT, nomes ou coordenadas no log.
      console.warn('CP GPS: fonte indisponivel',String(e.message||'erro').slice(0,60));
      return res.status(e.message==='AUTH_EXPIRED'?502:503).json({ok:false,error:e.message==='AUTH_EXPIRED'?'Token do dashboard uMov expirado ou sem permissao.':'Nao foi possivel consultar o rastreio do uMov.'});
    }
  };
}
module.exports={createTrackingHandler,posicoesDoUmov,constantEqual};
module.exports.registrar=(app)=>app.get('/api/cp/rastreio-equipes',createTrackingHandler());
