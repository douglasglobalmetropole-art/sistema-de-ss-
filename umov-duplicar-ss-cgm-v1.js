'use strict';
// CGM_DUPLICAR_SS_UMOV_V1 - Copia somente a programacao, nunca historicos ou fotos.
const section=(xml,tag)=>{
  const m=String(xml).match(new RegExp('<'+tag+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+tag+'>','i'));
  return m?m[1]:'';
};
const decodeXml=s=>String(s).replace(/&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos);/gi,(_,entity)=>{const e=entity.toLowerCase();if(e[0]==='#'){const n=e[1]==='x'?parseInt(e.slice(2),16):parseInt(e.slice(1),10);return n>0&&n<=0x10ffff?String.fromCodePoint(n):_}return {amp:'&',lt:'<',gt:'>',quot:'\"',apos:"'"}[e]||_});
const plain=(xml,tag)=>decodeXml(section(xml,tag).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<[^>]+>/g,'').trim());
const escapeXml=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const validId=v=>Number.isSafeInteger(Number(v))&&Number(v)>0;
const todaySaoPaulo=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
function activityIds(xml){
  const block=section(xml,'activities');
  const ids=[];
  for(const m of block.matchAll(/<activity\b[^>]*\bid\s*=\s*["'](\d+)["'][^>]*\/?\s*>/gi))ids.push(m[1]);
  for(const m of block.matchAll(/<activity(?:\s[^>]*)?>\s*<id>(\d+)<\/id>/gi))ids.push(m[1]);
  return [...new Set(ids)];
}
function buildCopyXml(source,options){
  if(!/^\s*(?:<\?xml[^>]*>\s*)?<schedule(?:\s[^>]*)?>/i.test(source))throw Error('Resposta de tarefa uMov invalida. Nenhuma copia criada.');
  const local=plain(section(source,'serviceLocal'),'id');
  const origin=plain(source,'activitiesOrigin');
  if(!validId(local)||!['1','2','3','4'].includes(origin))throw Error('Tarefa original sem local ou origem de atividades valida. Nenhuma copia criada.');
  if(String(local)!==String(options.local))throw Error('O local informado pela API difere do banco uMov. Nenhuma copia criada.');
  const date=String(options.date),hour=String(options.hour);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(hour)||Number.isNaN(Date.parse(date+'T12:00:00Z'))||date<todaySaoPaulo())throw Error('Data ou hora invalida para nova tarefa.');
  const agent=options.agent?Number(options.agent):null;
  if(agent&&!validId(agent))throw Error('Bombeiro invalido.');
  const pending=String(options.pendingId||'30');
  if(!validId(pending))throw Error('Situacao pendente do uMov nao configurada.');
  const parts=['<schedule>',`<serviceLocal><id>${local}</id></serviceLocal>`,`<activitiesOrigin>${origin}</activitiesOrigin>`,`<date>${date}</date>`,`<hour>${hour}</hour>`,`<situation><id>${pending}</id></situation>`];
  if(agent)parts.push(`<agent><id>${agent}</id></agent>`);
  const observation=plain(source,'observation');
  if(observation)parts.push(`<observation>${escapeXml(observation.slice(0,500))}</observation>`);
  const priority=plain(source,'priority');
  if(/^\d{1,4}$/.test(priority))parts.push(`<priority>${priority}</priority>`);
  if(origin==='4'){
    const activities=options.activities||[];
    if(!activities.length)throw Error('Tarefa usa atividades manuais, mas elas nao foram identificadas. Nenhuma copia criada.');
    parts.push('<activityRelationship>'+activities.map(v=>'<activity><alternativeIdentifier>'+escapeXml(v)+'</alternativeIdentifier></activity>').join('')+'</activityRelationship>');
  }
  // Campos de integracao da tarefa executada nao devem ser copiados para uma nova tarefa.
  let fields=section(source,'customFields');
  if(fields){
    if(fields.length>30000)throw Error('Campos da tarefa original excedem o limite seguro de copia.');
    fields=fields.replace(/<(e_situacao|situacao|status_integracao)(?:\s[^>]*)?>[\s\S]*?<\/\1>/gi,'');
    if(fields.trim())parts.push('<customFields>'+fields+'</customFields>');
  }
  parts.push('</schedule>');
  return parts.join('');
}
async function postNewSchedule(xml,emLote1){
  const token=String(emLote1()?process.env.UMOV_API_TOKEN_LOTE1||'':process.env.UMOV_API_TOKEN||'').trim();
  const base=String(emLote1()?process.env.UMOV_API_BASE_URL_LOTE1||'https://api.umov.me/CenterWeb/api':process.env.UMOV_API_BASE_URL||'https://api.umov.me/CenterWeb/api').replace(/\/$/,'');
  if(!token)throw Error('Token uMov nao configurado para este lote.');
  const response=await fetch(`${base}/${encodeURIComponent(token)}/schedule.xml`,{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:'data='+encodeURIComponent(xml),signal:AbortSignal.timeout(18000)
  });
  const body=await response.text();
  if(!response.ok)throw Error('uMov '+response.status+': '+body.replace(/\s+/g,' ').slice(0,400));
  const m=body.match(/<entry\b[^>]*\bid\s*=\s*["'](\d+)["']/i)||body.match(/<schedule(?:\s[^>]*)?>\s*<id>(\d+)<\/id>/i)||body.match(/<result(?:\s[^>]*)?>[\s\S]*?<id>(\d+)<\/id>/i);
  return {id:m?Number(m[1]):null};
}
function register({app,pool,emLote1,normalizarCidade,getUmovXml,postUmovXml,cache,gatewayAuthorized,gatewayCanWrite,siscomSameOrigin}){
  app.get('/api/duplicar-ss/origem/:id',async(req,res)=>{
    res.set('Cache-Control','no-store');
    if(!gatewayAuthorized(req)||!gatewayCanWrite(req)||!siscomSameOrigin(req))return res.status(403).json({error:'Acesso nao autorizado'});
    const id=Number(req.params.id);if(!validId(id))return res.status(400).json({error:'Tarefa invalida'});
    try {
      const xml=await getUmovXml('schedule',id);
      const agent=plain(section(xml,'agent'),'id');
      return res.json({agente:validId(agent)?Number(agent):null,nome:null});
    }catch(e){return res.status(502).json({error:'Falha na consulta ao uMov'});}
  });
  app.post('/api/duplicar-ss',async(req,res)=>{
    res.set('Cache-Control','no-store');
    if(!gatewayAuthorized(req)||!gatewayCanWrite(req)||!siscomSameOrigin(req))return res.status(403).json({ok:false,error:'Entre com uma conta autorizada antes de duplicar SS.'});
    const tarefa=Number(req.body?.tarefa);
    const agent=req.body?.agente===null||req.body?.agente===''||req.body?.agente===undefined?null:Number(req.body.agente);

    if(!validId(tarefa)||(agent!==null&&!validId(agent)))return res.status(400).json({ok:false,error:'Tarefa ou bombeiro invalido.'});
    try{
      const db=await pool.query({text:`SELECT t.tsk_id,t.loc_id,l.loc_city,l.loc_integrationid AS ss,d.tsk_situation,d.e_situacao
        FROM u45468.task t JOIN u45468.local l ON l.loc_id=t.loc_id
        JOIN u45468.dbout_task d ON d.tsk_id=t.tsk_id WHERE t.tsk_id=$1 LIMIT 1`,values:[tarefa],query_timeout:8000});
      const original=db.rows[0];
      if(!original)return res.status(404).json({ok:false,error:'Tarefa nao localizada no uMov.'});
      const normal=v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
      if(!normal(original.tsk_situation).includes('retornada de campo')||String(original.e_situacao||'').trim())return res.status(409).json({ok:false,error:'Somente SS da aba Notas para Baixar, sem integracao concluida, podem ser duplicadas.'});
      if(req.divisaoSS){const allowed=new Set(req.divisaoSS.cidades.map(normalizarCidade));if(!allowed.has(normalizarCidade(original.loc_city)))return res.status(403).json({ok:false,error:'SS fora da divisao autorizada.'});}
      if(agent){const q=await pool.query({text:'SELECT age_id FROM u45468.agent WHERE age_id=$1 LIMIT 1',values:[agent],query_timeout:6000});if(!q.rows.length)return res.status(400).json({ok:false,error:'Bombeiro nao encontrado no cadastro uMov deste lote.'});}
      const xml=await getUmovXml('schedule',tarefa);
      const date=todaySaoPaulo();
      const hour='09:00';
      const origin=plain(xml,'activitiesOrigin');
      let activities=[];
      if(origin==='4'){
        const ids=activityIds(xml);
        if(!ids.length||ids.length>30)throw Error('Atividades manuais da tarefa nao puderam ser verificadas. Nenhuma copia criada.');
        for(let i=0;i<ids.length;i+=5){
          const batch=await Promise.all(ids.slice(i,i+5).map(async id=>{
            const activity=await getUmovXml('activity',id);
            const alt=plain(activity,'alternativeIdentifier');
            if(!alt)throw Error('Atividade '+id+' sem identificador alternativo. Nenhuma copia criada.');
            return alt;
          }));
          activities.push(...batch);
        }
      }
      const pendingId=String(process.env.UMOV_PENDENTE_SITUATION_ID||'30').trim();
      const payload=buildCopyXml(xml,{local:original.loc_id,agent,date,hour,pendingId,activities});
      // Ponto unico de criacao: jamais repetir automaticamente em erro de rede.
      const created=await postNewSchedule(payload,emLote1);
      if(!created.id){cache.clear();return res.status(202).json({ok:true,criada:true,confirmada:false,ss:original.ss,origem:tarefa,alerta:'A API aceitou a criacao mas nao devolveu o ID. Confira o uMov antes de tentar novamente, para evitar copias duplicadas.'});}
      const id=created.id;const warnings=[];
      if(agent){
        const fieldId=String(process.env.UMOV_EM_CAMPO_SITUATION_ID||'40').trim();
        if(validId(fieldId)){
          try{await postUmovXml('schedule',id,`<schedule><situation><id>${fieldId}</id></situation></schedule>`)}
          catch(e){warnings.push('Copia criada e bombeiro atribuido, mas envio para campo falhou: '+e.message)}
        }else warnings.push('Situacao Em Campo nao configurada. A copia foi criada com bombeiro, mas envio para campo nao confirmado.');
      }
      let status='',agenteConfirmado=null,confirmada=false;
      try{
        const check=await getUmovXml('schedule',id);
        status=plain(section(check,'situation'),'description')||plain(section(check,'situation'),'id');
        const agentRead=plain(section(check,'agent'),'id');
        agenteConfirmado=validId(agentRead)?Number(agentRead):null;
        const situacaoId=plain(section(check,'situation'),'id');
        confirmada=agent?agenteConfirmado===agent&&situacaoId===String(process.env.UMOV_EM_CAMPO_SITUATION_ID||'40'):!agenteConfirmado&&situacaoId===pendingId;
        if(!confirmada)warnings.push('A situacao ou atribuicao ainda nao foi confirmada pela consulta uMov. Verifique antes de repetir.');
      }catch(e){warnings.push('Nao foi possivel conferir a nova tarefa: '+e.message)}
      cache.clear();
      return res.status(201).json({ok:true,criada:true,confirmada,ss:original.ss,origem:tarefa,novaTarefa:id,destino:agent?'bombeiro':'recepcao',agenteSolicitado:agent,agenteConfirmado,situacao:status,avisos:warnings});
    }catch(e){console.error('Duplicar SS:',e.message);return res.status(502).json({ok:false,error:String(e.message||e).slice(0,420),aviso:'Se houve timeout apos o envio, confira o uMov antes de tentar novamente.'});}
  });
}
module.exports={register,buildCopyXml,activityIds};
