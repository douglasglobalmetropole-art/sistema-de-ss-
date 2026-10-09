require('dotenv').config();
const express=require('express'),{Pool}=require('pg'),path=require('path');
const app=express(),PORT=Number(process.env.PORT||3000);
// Em ambientes serverless (Vercel), a mesma instância pode atender várias
// requisições. Um pool curto evita abrir conexões demais no PostgreSQL.
const pool=new Pool({
 host:process.env.DB_HOST,
 port:Number(process.env.DB_PORT||5432),
 database:process.env.DB_NAME,
 user:process.env.DB_USER,
 password:String(process.env.DB_PASSWORD||''),
 ssl:String(process.env.DB_SSL||'false').toLowerCase()==='true'?{rejectUnauthorized:false}:false,
 max:3,
 connectionTimeoutMillis:10000,
 idleTimeoutMillis:20000,
 allowExitOnIdle:true
});
app.use(express.json({limit:'100kb'}));app.use(express.static(path.join(__dirname,'public')));
const cache=new Map(),getCache=(k,ttl)=>{const x=cache.get(k);return x&&Date.now()-x.ts<ttl?x.data:null},setCache=(k,v)=>(cache.set(k,{ts:Date.now(),data:v}),v);
async function extrasLocal(ids){const u=[...new Set(ids.filter(Boolean).map(Number).filter(Number.isFinite))],m=new Map();if(!u.length)return m;const r=await pool.query({text:`SELECT loc_id,loc_integrationid AS ss,e_localidade AS cidade,e_bairro AS bairro,e_setor AS setor,e_reflocalizacao AS referencia_localizacao,loc_description AS localizacao,loc_street AS logradouro,loc_streetnumber AS numero,e_hidrometro AS hidrometro,e_situacao AS status_integracao,e_servicoexecutadosiscom AS servico_executado,e_informacaoexecucaosiscom AS informacao_bombeiro,e_informacaosolicitante AS informacao_solicitante,e_esclarecimentosolicitante AS esclarecimento_solicitante FROM u45468.dbout_local WHERE loc_id=ANY($1::bigint[])`,values:[u],query_timeout:5000});r.rows.forEach(x=>m.set(String(x.loc_id),x));return m}
async function extrasTask(ids){const u=[...new Set(ids.filter(Boolean).map(Number).filter(Number.isFinite))],m=new Map();if(!u.length)return m;const r=await pool.query({text:`SELECT d.tsk_id,d.tss_id,d.tsk_accesstoken,d.tsk_situation AS situacao_campo,d.e_tag AS tags,d.e_situacao AS status_integracao,d.tsk_realinitialdatehour AS inicio_atividade_raw,d.tsk_lastexecutiondatehour AS ultima_atividade_raw,d.tsk_realfinaldatehour AS fim_real_raw FROM u45468.dbout_task d WHERE d.tsk_id=ANY($1::bigint[])`,values:[u],query_timeout:5000});r.rows.forEach(x=>m.set(String(x.tsk_id),x));return m}
// Recepção é buscada em blocos pequenos pela tabela task. Assim a tabela de
// integração nunca é varrida inteira para descobrir as SS pendentes.
async function paginaRecepcaoRapida({inicio,fim,limit,offset,equipeBusca,macroBusca,cidadeBusca}){
 const idsEquipe=equipeBusca?(await pool.query({text:'SELECT age_id FROM u45468.agent WHERE age_name ILIKE $1',values:['%'+equipeBusca+'%'],query_timeout:4000})).rows.map(x=>String(x.age_id)):null;
 const idsMacro=macroBusca.length?(await pool.query({text:'SELECT tty_id FROM u45468.tasktype WHERE TRIM(tty_description)=ANY($1::text[])',values:[macroBusca],query_timeout:4000})).rows.map(x=>String(x.tty_id)):null;
 if((idsEquipe&& !idsEquipe.length)||(idsMacro&&!idsMacro.length))return{rows:[],hasMore:false};
 const equipeSet=idsEquipe&&new Set(idsEquipe),macroSet=idsMacro&&new Set(idsMacro),selecionadas=[],chunk=500,maxBlocos=80;let cursorData=null,cursorId=null,encontradas=0,acabou=false;
 for(let bloco=0;bloco<maxBlocos&&selecionadas.length<=limit;bloco++){
  const cursor=cursorData?'AND (t.tsk_insertdatehour,t.tsk_id)<($3::timestamp,$4::bigint)':'';
  const valores=cursorData?[inicio,fim,cursorData,cursorId,chunk]:[inicio,fim,chunk];
  const limite=cursorData?'$5':'$3';
  const candidatas=await pool.query({text:`SELECT t.tsk_id,t.loc_id,t.age_id,t.tty_id,t.tsk_insertdatehour FROM u45468.task t WHERE t.tsk_insertdatehour >= $1::date AND t.tsk_insertdatehour < ($2::date + INTERVAL '1 day') ${cursor} ORDER BY t.tsk_insertdatehour DESC,t.tsk_id DESC LIMIT ${limite}`,values:valores,query_timeout:4000});
  if(!candidatas.rows.length){acabou=true;break}
  const ultima=candidatas.rows[candidatas.rows.length-1];cursorData=ultima.tsk_insertdatehour;cursorId=ultima.tsk_id;
  const ids=candidatas.rows.map(x=>x.tsk_id);
  const situacoes=await pool.query({text:`SELECT tsk_id,tsk_situation,e_situacao FROM u45468.dbout_task WHERE tsk_id=ANY($1::bigint[])`,values:[ids],query_timeout:4000});
  const porId=new Map(situacoes.rows.map(x=>[String(x.tsk_id),x]));
  let cidadesOk=null;
  if(cidadeBusca.length){const locais=await pool.query({text:`SELECT loc_id FROM u45468.local WHERE loc_id=ANY($1::bigint[]) AND loc_city=ANY($2::text[])`,values:[candidatas.rows.map(x=>x.loc_id),cidadeBusca],query_timeout:4000});cidadesOk=new Set(locais.rows.map(x=>String(x.loc_id)))}
  for(const t of candidatas.rows){const d=porId.get(String(t.tsk_id));if(!d||String(d.tsk_situation||'').trim().toLowerCase()!=='pendente de envio para campo')continue;if(equipeSet&&!equipeSet.has(String(t.age_id)))continue;if(macroSet&&!macroSet.has(String(t.tty_id)))continue;if(cidadesOk&&!cidadesOk.has(String(t.loc_id)))continue;if(encontradas++>=offset)selecionadas.push({...t,situacao_campo:d.tsk_situation,status_integracao:d.e_situacao});if(selecionadas.length>limit)break}
  if(candidatas.rows.length<chunk){acabou=true;break}
 }
 const servicos=selecionadas.length?await pool.query({text:`SELECT tty_id,tty_description FROM u45468.tasktype WHERE tty_id=ANY($1::bigint[])`,values:[selecionadas.map(x=>x.tty_id)],query_timeout:4000}):{rows:[]};
 const tecnicos=selecionadas.length?await pool.query({text:`SELECT age_id,age_name FROM u45468.agent WHERE age_id=ANY($1::bigint[])`,values:[selecionadas.map(x=>x.age_id)],query_timeout:4000}):{rows:[]};
 const servicoPorId=new Map(servicos.rows.map(x=>[String(x.tty_id),x.tty_description])),tecnicoPorId=new Map(tecnicos.rows.map(x=>[String(x.age_id),x.age_name]));
 return{rows:selecionadas.slice(0,limit).map(x=>({...x,servico:servicoPorId.get(String(x.tty_id))||'',tecnico:tecnicoPorId.get(String(x.age_id))||''})),hasMore:selecionadas.length>limit||!acabou};
}
app.get('/api/health',async(req,res)=>{try{res.json({ok:true,...(await pool.query('SELECT current_database() banco,NOW() agora')).rows[0]})}catch(e){res.status(500).json({ok:false,error:e.message})}});
// Consulta rápida: limita task primeiro e só consulta dbout_local para até 100 SS.
app.get('/api/recepcao',async(req,res)=>{try{
 const inicio=req.query.inicio||'2026-10-01',fim=req.query.fim||'2026-10-05',limit=Math.min(Math.max(+req.query.limit||25,1),100),offset=Math.max(+req.query.offset||0,0),equipeBusca=String(req.query.equipe||'').trim(),macroBusca=String(req.query.macro||'').split('\u001f').map(x=>x.trim()).filter(Boolean),cidadeBusca=String(req.query.cidade||'').split('\u001f').map(x=>x.trim().toUpperCase()).filter(Boolean),consultaLimit=limit+1,telas=new Set(['campo','baixar','encerradas']),tela=telas.has(String(req.query.tela||''))?String(req.query.tela):'recepcao',key=`ss:${tela}:${inicio}:${fim}:${limit}:${offset}:${equipeBusca.toLowerCase()}:${macroBusca.join('|')}:${cidadeBusca.join('|')}`,hit=getCache(key,180000);if(hit){res.set('X-Cache','HIT');return res.json(hit)}const started=Date.now();
 const condicoes={campo:"LOWER(TRIM(COALESCE(d.tsk_situation,'')))='em campo'",baixar:"LOWER(TRIM(COALESCE(d.tsk_situation,'')))='retornada de campo' AND NULLIF(TRIM(COALESCE(d.e_situacao,'')),'') IS NULL AND d.tsk_lastexecutiondatehour IS NOT NULL",encerradas:"NULLIF(TRIM(COALESCE(d.e_situacao,'')),'') IS NOT NULL"};
 if(tela==='recepcao'){
  const pagina=await paginaRecepcaoRapida({inicio,fim,limit,offset,equipeBusca,macroBusca,cidadeBusca});
  const [locals,tasks]=await Promise.all([extrasLocal(pagina.rows.map(x=>x.loc_id)),extrasTask(pagina.rows.map(x=>x.tsk_id))]);
  const fmt=v=>v?new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(v)).replace(',',''):'';
  const rows=pagina.rows.map(x=>{const l=locals.get(String(x.loc_id))||{},t=tasks.get(String(x.tsk_id))||{};return{ss:l.ss||'',cidade:l.cidade||'',bairro:l.bairro||'',setor:l.setor||'',logradouro:l.logradouro||'',numero:l.numero||'',referencia_localizacao:l.referencia_localizacao||'',localizacao:l.localizacao||'',servico:x.servico||'',tecnico:x.tecnico||'',equipe_executou:'',tarefa:x.tsk_id,tss_id:t.tss_id||'',link:'',situacao_campo:x.situacao_campo||'',tags:t.tags||'',status_integracao:x.status_integracao||l.status_integracao||'',hidrometro:l.hidrometro||'',servico_executado:'',informacao_bombeiro:'',informacao_solicitante:l.informacao_solicitante||'',esclarecimento_solicitante:l.esclarecimento_solicitante||'',inicio_atividade:'',fim_atividade:'',fim_real:'',ultima_atividade:'',data_finalizacao:'',criado_em:fmt(x.tsk_insertdatehour)}});
  const data={ok:true,count:rows.length,hasMore:pagina.hasMore,offset,limit,ms:Date.now()-started,rows};setCache(key,data);res.set('X-Cache','MISS');return res.json(data);
 }
 const filtraPorUltimaAtividade=tela==='baixar'||tela==='encerradas';
 const proximoParametro=(tela==='recepcao'?5:(filtraPorUltimaAtividade?5:3)),parametroEquipe=proximoParametro,parametroMacro=parametroEquipe+(equipeBusca?1:0),parametroCidade=parametroMacro+(macroBusca.length?1:0),equipeSql=equipeBusca?`AND EXISTS (SELECT 1 FROM u45468.agent ae WHERE ae.age_id=t.age_id AND ae.age_name ILIKE $${parametroEquipe})`:'',macroSql=macroBusca.length?`AND EXISTS (SELECT 1 FROM u45468.tasktype mt WHERE mt.tty_id=t.tty_id AND TRIM(mt.tty_description)=ANY($${parametroMacro}::text[]))`:'',cidadeSql=cidadeBusca.length?`AND EXISTS (SELECT 1 FROM u45468.local cl WHERE cl.loc_id=t.loc_id AND UPPER(TRIM(cl.loc_city))=ANY($${parametroCidade}::text[]))`:'';
 const sqlRecepcao=`WITH tarefas AS MATERIALIZED(SELECT t.tsk_id,t.loc_id,t.age_id,t.tty_id,t.tsk_insertdatehour,d.tsk_situation AS situacao_campo,d.e_situacao AS status_integracao FROM u45468.task t INNER JOIN u45468.dbout_task d ON d.tsk_id=t.tsk_id WHERE t.tsk_insertdatehour >= $1::date AND t.tsk_insertdatehour < ($2::date + INTERVAL '1 day') AND LOWER(TRIM(COALESCE(d.tsk_situation,'')))='pendente de envio para campo' ${equipeSql} ${macroSql} ${cidadeSql} ORDER BY t.tsk_insertdatehour DESC, t.tsk_id DESC LIMIT $3 OFFSET $4) SELECT t.tsk_id,t.loc_id,l.loc_integrationid AS ss,l.loc_city AS cidade_base,l.loc_neighborhood AS bairro_base,l.loc_street AS logradouro_base,l.loc_streetnumber AS numero_base,t.tsk_insertdatehour AS data_referencia,t.situacao_campo,t.status_integracao,a.age_name AS tecnico,tt.tty_description AS servico FROM tarefas t LEFT JOIN u45468.local l ON l.loc_id=t.loc_id LEFT JOIN u45468.agent a ON a.age_id=t.age_id LEFT JOIN u45468.tasktype tt ON tt.tty_id=t.tty_id ORDER BY data_referencia DESC,t.tsk_id DESC`;
 const sqlPorStatus='';
 // A tabela dbout_local é enriquecida somente após limitar a página; juntá-la antes do LIMIT causava timeout.
 const limiteStatus=filtraPorUltimaAtividade?'$3':'$1',deslocamentoStatus=filtraPorUltimaAtividade?'$4':'$2',filtroDataStatus=filtraPorUltimaAtividade?"AND d.tsk_lastexecutiondatehour >= $1::date AND d.tsk_lastexecutiondatehour < ($2::date + INTERVAL '1 day')":'';
 const sqlPorStatusRapido=['WITH tarefas AS MATERIALIZED(SELECT t.tsk_id,t.loc_id,t.age_id,t.tty_id,t.tsk_insertdatehour,d.tsk_lastexecutiondatehour,d.tsk_situation AS situacao_campo,d.e_situacao AS status_integracao','FROM u45468.task t INNER JOIN u45468.dbout_task d ON d.tsk_id=t.tsk_id','WHERE '+condicoes[tela],filtroDataStatus,equipeSql,macroSql,cidadeSql,'ORDER BY d.tsk_lastexecutiondatehour DESC NULLS LAST,t.tsk_id DESC','LIMIT '+limiteStatus+' OFFSET '+deslocamentoStatus+')','SELECT t.tsk_id,t.loc_id,l.loc_integrationid AS ss,l.loc_city AS cidade_base,l.loc_neighborhood AS bairro_base,l.loc_street AS logradouro_base,l.loc_streetnumber AS numero_base,t.tsk_insertdatehour AS data_referencia,t.situacao_campo,t.status_integracao,a.age_name AS tecnico,tt.tty_description AS servico','FROM tarefas t LEFT JOIN u45468.local l ON l.loc_id=t.loc_id LEFT JOIN u45468.agent a ON a.age_id=t.age_id LEFT JOIN u45468.tasktype tt ON tt.tty_id=t.tty_id','ORDER BY t.tsk_lastexecutiondatehour DESC NULLS LAST,t.tsk_id DESC'].join(' ');
 const valoresExtras=[...(equipeBusca?['%'+equipeBusca+'%']:[]),...(macroBusca.length?[macroBusca]:[]),...(cidadeBusca.length?[cidadeBusca]:[])];
 const valoresStatus=(filtraPorUltimaAtividade?[inicio,fim,consultaLimit,offset]:[consultaLimit,offset]).concat(valoresExtras);
 const valoresRecepcao=[inicio,fim,consultaLimit,offset].concat(valoresExtras);
 const base=await pool.query({text:tela==='recepcao'?sqlRecepcao:sqlPorStatusRapido,values:tela==='recepcao'?valoresRecepcao:valoresStatus,query_timeout:9000});
 const registrosPagina=base.rows.slice(0,limit);
 const [locals,tasks]=await Promise.all([extrasLocal(registrosPagina.map(x=>x.loc_id)),extrasTask(registrosPagina.map(x=>x.tsk_id))]);
 const rows=registrosPagina.map(x=>{const l=locals.get(String(x.loc_id))||{},t=tasks.get(String(x.tsk_id))||{},fmt=v=>v?new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(v)).replace(',',''):'';const dataFinalizacao=fmt(t.ultima_atividade_raw);return{ss:x.ss||'',cidade:l.cidade||x.cidade_base||'',bairro:l.bairro||x.bairro_base||'',setor:l.setor||'',logradouro:l.logradouro||x.logradouro_base||'',numero:l.numero||x.numero_base||'',referencia_localizacao:l.referencia_localizacao||'',localizacao:l.localizacao||'',servico:x.servico||'',tecnico:x.tecnico||'',equipe_executou:t.equipe_executou||x.tecnico||'',tarefa:x.tsk_id,tss_id:t.tss_id||'',link:(Number(t.tss_id)===50&&t.tsk_accesstoken)?`https://consglobalmetropole.umov.me/CenterWeb/report/schedule/${x.tsk_id}/${t.tsk_accesstoken}`:'',situacao_campo:x.situacao_campo||t.situacao_campo||'',tags:t.tags||'',status_integracao:x.status_integracao||l.status_integracao||t.status_integracao||'',hidrometro:l.hidrometro||'',servico_executado:l.servico_executado||'',informacao_bombeiro:l.informacao_bombeiro||'',informacao_solicitante:l.informacao_solicitante||'',esclarecimento_solicitante:l.esclarecimento_solicitante||'',inicio_atividade:fmt(t.inicio_atividade_raw),fim_atividade:fmt(t.fim_real_raw),fim_real:fmt(t.fim_real_raw),ultima_atividade:dataFinalizacao,data_finalizacao:dataFinalizacao,criado_em:fmt(x.data_referencia)}});
 const data={ok:true,count:rows.length,hasMore:base.rows.length>limit,offset,limit,ms:Date.now()-started,rows};setCache(key,data);res.set('X-Cache','MISS');res.json(data);
}catch(e){console.error('Recepção:',e);res.status(500).json({ok:false,error:e.message})}});
app.get('/api/macros',async(req,res)=>{try{const hit=getCache('macros',300000);if(hit)return res.json({ok:true,rows:hit});const r=await pool.query({text:`SELECT DISTINCT TRIM(tty_description) AS macro FROM u45468.tasktype WHERE tty_description IS NOT NULL AND TRIM(tty_description)<>'' ORDER BY 1`,query_timeout:6000});setCache('macros',r.rows);res.json({ok:true,rows:r.rows})}catch(e){res.status(500).json({ok:false,error:e.message})}});
app.get('/api/cidades',async(req,res)=>{try{const hit=getCache('cidades',300000);if(hit)return res.json({ok:true,rows:hit});const r=await pool.query({text:`SELECT DISTINCT TRIM(e_localidade) AS cidade FROM u45468.dbout_local WHERE e_localidade IS NOT NULL AND TRIM(e_localidade)<>'' ORDER BY 1`,query_timeout:6000});setCache('cidades',r.rows);res.json({ok:true,rows:r.rows})}catch(e){res.status(500).json({ok:false,error:e.message})}});
app.get('/api/equipes',async(req,res)=>{try{const q=String(req.query.q||'').trim(),key='eq:'+q.toLowerCase(),hit=getCache(key,60000);if(hit)return res.json({ok:true,rows:hit});const values=[],where=['age_name IS NOT NULL',"TRIM(age_name)<>''"];if(q){values.push('%'+q+'%');where.push('(age_name ILIKE $1 OR CAST(age_id AS TEXT) ILIKE $1)')}const r=await pool.query({text:`SELECT DISTINCT age_id AS id,age_name AS nome FROM u45468.agent WHERE ${where.join(' AND ')} ORDER BY age_name LIMIT 80`,values,query_timeout:6000});setCache(key,r.rows);res.json({ok:true,rows:r.rows})}catch(e){res.status(500).json({ok:false,error:e.message})}});

// Marca notas retornadas de campo no uMov. A chave fica exclusivamente nas
// variáveis da Vercel; ela nunca é entregue ao navegador.
const integrationStatuses=new Set(['Baixada','Rejeitada','Duplicada']);
const xmlEscape=value=>String(value).replace(/[<>&'\"]/g,char=>({'<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','"':'&quot;'}[char]));
async function postUmovXml(resource,id,xml){
 const token=String(process.env.UMOV_API_TOKEN||'').trim();
 const base=String(process.env.UMOV_API_BASE_URL||'https://api.umov.me/CenterWeb/api').replace(/\/$/,'');
 if(!token)throw new Error('Integração uMov não configurada. Cadastre UMOV_API_TOKEN na Vercel.');
 const response=await fetch(`${base}/${encodeURIComponent(token)}/${resource}/${encodeURIComponent(id)}.xml`,{
  method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'data='+encodeURIComponent(xml),signal:AbortSignal.timeout(12000)
 });
 if(!response.ok){
  const texto=(await response.text()).replace(/\s+/g,' ').trim();
  const detalhe=texto?`: ${texto.slice(0,240)}`:'';
  throw new Error(`uMov respondeu ${response.status}${detalhe}`);
 }
}
app.post('/api/status-integracao',async(req,res)=>{try{
 const status=String(req.body?.status||'').trim();
 const tarefas=[...new Set((Array.isArray(req.body?.tarefas)?req.body.tarefas:[]).map(Number).filter(Number.isInteger))].slice(0,25);
 if(!integrationStatuses.has(status))return res.status(400).json({ok:false,error:'Status de integração inválido.'});
 if(!tarefas.length)return res.status(400).json({ok:false,error:'Selecione ao menos uma SS.'});
 const elegiveis=await pool.query({text:`SELECT t.tsk_id,t.loc_id FROM u45468.task t INNER JOIN u45468.dbout_task d ON d.tsk_id=t.tsk_id WHERE t.tsk_id=ANY($1::bigint[]) AND LOWER(TRIM(COALESCE(d.tsk_situation,'')))='retornada de campo' AND NULLIF(TRIM(COALESCE(d.e_situacao,'')),'') IS NULL`,values:[tarefas],query_timeout:7000});
 const porTarefa=new Map(elegiveis.rows.map(row=>[String(row.tsk_id),row]));
 const resultados=[];
 for(const tarefa of tarefas){
  const item=porTarefa.get(String(tarefa));
  if(!item){resultados.push({tarefa,ok:false,error:'A SS não está disponível para baixa.'});continue}
  try{
   const valor=xmlEscape(status);
   await postUmovXml('schedule',item.tsk_id,`<schedule><customFields><situacao><alternativeIdentifier>${valor}</alternativeIdentifier></situacao></customFields></schedule>`);
   if(item.loc_id)await postUmovXml('serviceLocal',item.loc_id,`<serviceLocal><customFields><situacao><alternativeIdentifier>${valor}</alternativeIdentifier></situacao></customFields></serviceLocal>`);
   resultados.push({tarefa,ok:true,status});
  }catch(error){resultados.push({tarefa,ok:false,error:error.message})}
 }
 const sucesso=resultados.filter(item=>item.ok).length;
 const primeiraFalha=resultados.find(item=>!item.ok);
 res.status(sucesso?200:502).json({ok:sucesso>0,status,resultados,sucesso,falhas:resultados.length-sucesso,error:primeiraFalha?.error});
}catch(error){console.error('Status integração:',error);res.status(500).json({ok:false,error:'Não foi possível atualizar o status de integração.'})}});
// No computador local, mantenha o comportamento original: `npm start`.
// Na Vercel, o adaptador Node importa este Express app e não abre uma porta.
if (require.main === module) {
 app.listen(PORT,async()=>{
  console.log(`Recepção: http://localhost:${PORT}`);
  try{await pool.query('SELECT 1');console.log('✓ PostgreSQL/uMov conectado')}
  catch(e){console.error('✗',e.message)}
 });
}

module.exports=app;
