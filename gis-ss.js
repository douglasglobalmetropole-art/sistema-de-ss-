'use strict';
// GLOBAL_GIS_FILA_V3_2026
const cidades={ODVV:['VILA VELHA','RECANTO DA SEREIA'],ODCV:['CARIACICA','VIANA'],ODLS:['ANCHIETA','PIUMA','GUARAPARI'],ODVT:['VITORIA'],ODLN:['SERRA','FUNDAO','ARACRUZ']};
const normal=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim();
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
module.exports.registrar=function(app,{gatewayRest,gatewayAuthorized,individualJobPayload}){
  app.get('/api/gis/localizar-ss',async(req,res)=>{
    res.set('Cache-Control','private, no-store');
    if(!gatewayAuthorized(req))return res.status(401).json({ok:false,error:'Nao autorizado'});
    const ss=String(req.query.ss||'').trim();
    if(!/^\d{2}\/\d{2}-\d{6}-\d{1,2}$/.test(ss))return res.status(400).json({ok:false,error:'SS invalida'});
    try{
      const jobs=await gatewayRest('siscom_gateway_jobs',{
        method:'POST',headers:{Prefer:'return=representation'},
        body:JSON.stringify({operation:'gis_localizar_ss',status:'pendente',payload:individualJobPayload(req,'gis_localizar_ss',{numero_ss:ss})})
      });
      const id=jobs?.[0]?.id;
      if(!id)throw Error('Fila GIS nao retornou ID');
      for(let n=0;n<8;n++){
        await sleep(850);
        const rows=await gatewayRest('siscom_gateway_jobs?select=id,operation,status,result,error_message&id=eq.'+encodeURIComponent(id)+'&limit=1');
        const job=rows?.[0];
        if(!job||job.operation!=='gis_localizar_ss')throw Error('Resposta da fila GIS invalida');
        if(job.status==='erro')throw Error(String(job.error_message||'Falha no worker GIS'));
        if(job.status!=='concluido')continue;
        const d=job.result;
        if(!d||typeof d!=='object')throw Error('Resultado GIS invalido');
        if(d.ok&&req.divisaoSS){
          const permitidas=cidades[req.divisaoSS.codigo]||[];
          if(!permitidas.some(c=>normal(d.unidade).includes(c)))return res.status(403).json({ok:false,error:'SS fora da divisao autorizada'});
        }
        return res.json({ok:d.ok===true,found:d.found===true,ss:String(d.ss||ss),matricula:String(d.matricula||''),hidrometro:String(d.hidrometro||''),lat:d.lat,lon:d.lon,error:d.error});
      }
      return res.status(504).json({ok:false,error:'Worker ainda processando consulta GIS. Tente novamente.'});
    }catch(e){console.error('GIS worker:',e.message);return res.status(502).json({ok:false,error:'Consulta GIS indisponivel: '+String(e.message).slice(0,100)});}
  });
};