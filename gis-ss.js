'use strict';
const BASE='https://gis.cesan.com.br';
const cache=new Map();
const cidades={ODVV:['VILA VELHA','RECANTO DA SEREIA'],ODCV:['CARIACICA','VIANA'],ODLS:['ANCHIETA','PIUMA','GUARAPARI'],ODVT:['VITORIA'],ODLN:['SERRA','FUNDAO','ARACRUZ']};
const normal=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim();
async function json(url){const ctl=new AbortController();const t=setTimeout(()=>ctl.abort(),8500);try{const r=await fetch(url,{headers:{Accept:'application/json'},signal:ctl.signal});if(!r.ok)throw Error('GIS HTTP '+r.status);const j=await r.json();if(j.error)throw Error('GIS: '+String(j.error.message||'falha'));return j}finally{clearTimeout(t)}}
module.exports.registrar=function(app){
 app.get('/api/gis/localizar-ss',async(req,res)=>{
  res.set('Cache-Control','private, max-age=60');
  const ss=String(req.query.ss||'').trim();
  if(!/^\d{2}\/\d{2}-\d{6}-\d{1,2}$/.test(ss))return res.status(400).json({ok:false,error:'SS invalida'});
  const key=(req.divisaoSS?.codigo||'GERAL')+':'+ss;
  const saved=cache.get(key);if(saved&&Date.now()-saved.at<300000)return res.json(saved.data);
  try{
   const formatos=[ss];const m=ss.match(/^(\d{2}\/\d{2}-\d{6}-)(\d{1,2})$/);
   if(m){const alt=m[1]+String(Number(m[2]));if(alt!==ss)formatos.push(alt)}
   let item=null;
   for(const f of formatos){const url=BASE+'/ArcGIS/rest/services/GIS_CESAN_ugisc_EditService/MapServer/exts/RestSOE/LocalizarSS?SS='+encodeURIComponent(JSON.stringify([f]))+'&f=json';const data=await json(url);item=(data.SS_Localizadas||[]).find(x=>Number(x.SeqSS)===Number(m?.[2])&&Number(x.CdAtendimento)===Number(ss.slice(6,12)))||data.SS_Localizadas?.[0];if(item)break}
   if(!item)return res.json({ok:false,found:false,error:'SS nao localizada no GIS'});
   if(req.divisaoSS){const cidade=normal(item.Unidade||'');const permitidas=cidades[req.divisaoSS.codigo]||[];if(!permitidas.some(c=>cidade.includes(c)))return res.status(403).json({ok:false,error:'SS fora da divisao autorizada'})}
   const x=Number(item.PontoSS?.X),y=Number(item.PontoSS?.Y);
   if(!Number.isFinite(x)||!Number.isFinite(y))return res.json({ok:false,found:false,error:'SS sem coordenadas no GIS'});
   const geometries=JSON.stringify({geometryType:'esriGeometryPoint',geometries:[{x,y,spatialReference:{wkid:31984}}]});
   const p=new URLSearchParams({f:'json',inSR:'31984',outSR:'4326',geometries});
   const geo=await json(BASE+'/arcgis/rest/services/Utilities/Geometry/GeometryServer/project?'+p);
   const point=geo.geometries?.[0];const lat=Number(point?.y),lon=Number(point?.x);
   if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat< -90||lat>90||lon< -180||lon>180)throw Error('Coordenadas GIS invalidas');
   const data={ok:true,found:true,ss:item.SS||ss,matricula:String(item.Matricula||item.MatriculaLocalizacaoSS||''),hidrometro:String(item.Hidrometro||''),lat,lon};
   if(cache.size>300)cache.clear();cache.set(key,{at:Date.now(),data});return res.json(data);
  }catch(e){return res.status(502).json({ok:false,error:'Consulta GIS indisponivel: '+String(e.message).slice(0,110)})}
 });
};