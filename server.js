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
async function extrasLocal(ids){const u=[...new Set(ids.filter(Boolean).map(Number).filter(Number.isFinite))],m=new Map();if(!u.length)return m;const r=await pool.query({text:`SELECT loc_id,loc_integrationid AS ss,e_localidade AS cidade,e_bairro AS bairro,e_setor AS setor,e_reflocalizacao AS referencia_localizacao,loc_description AS localizacao,loc_street AS logradouro,loc_streetnumber AS numero,e_hidrometro AS hidrometro,e_situacao AS status_integracao,e_servicoexecutadosiscom AS servico_executado,e_informacaoexecucaosiscom AS informacao_bombeiro,e_informacaosolicitante AS informacao_solicitante,e_esclarecimentosolicitante AS esclarecimento_solicitante,to_jsonb(dbout_local) AS campos FROM u45468.dbout_local WHERE loc_id=ANY($1::bigint[])`,values:[u],query_timeout:5000});r.rows.forEach(x=>m.set(String(x.loc_id),x));return m}
async function extrasTask(ids){const u=[...new Set(ids.filter(Boolean).map(Number).filter(Number.isFinite))],m=new Map();if(!u.length)return m;const r=await pool.query({text:`SELECT d.tsk_id,d.tss_id,d.tsk_accesstoken,d.tsk_situation AS situacao_campo,d.e_tag AS tags,d.e_situacao AS status_integracao,d.tsk_realinitialdatehour AS inicio_atividade_raw,d.tsk_lastexecutiondatehour AS ultima_atividade_raw,d.tsk_realfinaldatehour AS fim_real_raw,to_jsonb(d) AS campos FROM u45468.dbout_task d WHERE d.tsk_id=ANY($1::bigint[])`,values:[u],query_timeout:5000});r.rows.forEach(x=>m.set(String(x.tsk_id),x));return m}
const campo=(row,...nomes)=>{const dados=row?.campos||{};for(const nome of nomes){const valor=dados[nome];if(valor!==null&&valor!==undefined&&String(valor).trim()!=='')return String(valor)}return ''};
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
// Busca por SS sem limite de datas; paginação feita no banco antes do enriquecimento.
app.get('/api/busca-ss',async(req,res)=>{try{
 const ss=String(req.query.ss||'').trim();if(ss.length<3)return res.json({ok:true,rows:[],total:0,hasMore:false});
 const tela=String(req.query.tela||'recepcao'),limit=Math.min(Math.max(Number(req.query.limit)||25,1),100),offset=Math.max(Number(req.query.offset)||0,0);
 const cond={recepcao:"LOWER(TRIM(COALESCE(d.tsk_situation,'')))='pendente de envio para campo'",campo:"LOWER(TRIM(COALESCE(d.tsk_situation,'')))='em campo'",baixar:"LOWER(TRIM(COALESCE(d.tsk_situation,'')))='retornada de campo' AND NULLIF(TRIM(COALESCE(d.e_situacao,'')),'') IS NULL AND d.tsk_lastexecutiondatehour IS NOT NULL",encerradas:"NULLIF(TRIM(COALESCE(d.e_situacao,'')),'') IS NOT NULL"};
 if(!cond[tela])return res.status(400).json({ok:false,error:'Aba inválida'});
 const base=`FROM u45468.local l JOIN u45468.task t ON t.loc_id=l.loc_id JOIN u45468.dbout_task d ON d.tsk_id=t.tsk_id LEFT JOIN u45468.agent a ON a.age_id=t.age_id LEFT JOIN u45468.tasktype tt ON tt.tty_id=t.tty_id WHERE l.loc_integrationid ILIKE $1 AND ${cond[tela]}`;
 const values=['%'+ss+'%'];
 // Sem COUNT(*) global: busca apenas a página solicitada e um registro extra.
 const total=null;
 const q=await pool.query({text:`SELECT t.tsk_id,t.loc_id,t.age_id,t.tty_id,t.tsk_insertdatehour,d.tsk_lastexecutiondatehour,d.tsk_situation AS situacao_campo,d.e_situacao AS status_integracao,l.loc_integrationid AS ss,l.loc_city AS cidade_base,l.loc_neighborhood AS bairro_base,l.loc_street AS logradouro_base,l.loc_streetnumber AS numero_base,a.age_name AS tecnico,tt.tty_description AS servico ${base} ORDER BY ${tela==='recepcao'?'t.tsk_insertdatehour':'d.tsk_lastexecutiondatehour'} DESC NULLS LAST,t.tsk_id DESC LIMIT $2 OFFSET $3`,values:[...values,limit+1,offset],query_timeout:9000});
 const hasMore=q.rows.length>limit; q.rows=q.rows.slice(0,limit);
 const [locals,tasks]=await Promise.all([extrasLocal(q.rows.map(x=>x.loc_id)),extrasTask(q.rows.map(x=>x.tsk_id))]);
 const fmt=v=>v?new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(v)).replace(',',''):'';
 const rows=q.rows.map(x=>{const l=locals.get(String(x.loc_id))||{},t=tasks.get(String(x.tsk_id))||{};return {ss:x.ss||l.ss||'',tarefa:x.tsk_id,local:x.loc_id,cidade:l.cidade||x.cidade_base||'',bairro:l.bairro||x.bairro_base||'',setor:l.setor||'',logradouro:l.logradouro||x.logradouro_base||'',numero:l.numero||x.numero_base||'',servico:x.servico||'',tecnico:x.tecnico||'',equipe_executou:x.tecnico||'',tags:t.tags||'',situacao_campo:x.situacao_campo||'',status_integracao:x.status_integracao||'',tss_id:t.tss_id||'',hidrometro:l.hidrometro||'',referencia_localizacao:l.referencia_localizacao||'',informacao_solicitante:l.informacao_solicitante||'',esclarecimento_solicitante:l.esclarecimento_solicitante||'',servico_executado:l.informacao_bombeiro||l.servico_executado||'',materiais_bombeiro:campo(l,'e_material','e_materialusado')||'',inicio_atividade:fmt(t.inicio_atividade_raw),fim_atividade:fmt(t.fim_real_raw),fim_real:fmt(t.fim_real_raw),ultima_atividade:fmt(t.ultima_atividade_raw),data_finalizacao:fmt(t.ultima_atividade_raw),criado_em:fmt(x.tsk_insertdatehour),link:Number(t.tss_id)===50&&t.tsk_accesstoken?`https://consglobalmetropole.umov.me/CenterWeb/report/schedule/${x.tsk_id}/${t.tsk_accesstoken}`:''}});
 res.json({ok:true,rows,total,count:rows.length,limit,offset,hasMore});
 }catch(e){console.error('Busca SS:',e);res.status(500).json({ok:false,error:e.message})}});
app.get('/api/health',async(req,res)=>{try{res.json({ok:true,...(await pool.query('SELECT current_database() banco,NOW() agora')).rows[0]})}catch(e){res.status(500).json({ok:false,error:e.message})}});
// Consulta rápida: limita task primeiro e só consulta dbout_local para até 100 SS.
app.get('/api/recepcao',async(req,res)=>{try{
 const inicio=req.query.inicio||'2026-10-01',fim=req.query.fim||'2026-10-05',limit=Math.min(Math.max(+req.query.limit||25,1),100),offset=Math.max(+req.query.offset||0,0),equipeBusca=String(req.query.equipe||'').trim(),macroBusca=String(req.query.macro||'').split('\u001f').map(x=>x.trim()).filter(Boolean),cidadeBusca=String(req.query.cidade||'').split('\u001f').map(x=>x.trim().toUpperCase()).filter(Boolean),consultaLimit=limit+1,telas=new Set(['campo','baixar','encerradas']),tela=telas.has(String(req.query.tela||''))?String(req.query.tela):'recepcao',key=`ss:${tela}:${inicio}:${fim}:${limit}:${offset}:${equipeBusca.toLowerCase()}:${macroBusca.join('|')}:${cidadeBusca.join('|')}`,hit=getCache(key,180000);if(hit){res.set('X-Cache','HIT');return res.json(hit)}const started=Date.now();
 const condicoes={campo:"LOWER(TRIM(COALESCE(d.tsk_situation,'')))='em campo'",baixar:"LOWER(TRIM(COALESCE(d.tsk_situation,'')))='retornada de campo' AND NULLIF(TRIM(COALESCE(d.e_situacao,'')),'') IS NULL AND d.tsk_lastexecutiondatehour IS NOT NULL",encerradas:"NULLIF(TRIM(COALESCE(d.e_situacao,'')),'') IS NOT NULL"};
 if(tela==='recepcao'){
  const pagina=await paginaRecepcaoRapida({inicio,fim,limit,offset,equipeBusca,macroBusca,cidadeBusca});
  const [locals,tasks]=await Promise.all([extrasLocal(pagina.rows.map(x=>x.loc_id)),extrasTask(pagina.rows.map(x=>x.tsk_id))]);
  const fmt=v=>v?new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(v)).replace(',',''):'';
  const rows=pagina.rows.map(x=>{const l=locals.get(String(x.loc_id))||{},t=tasks.get(String(x.tsk_id))||{};return{ss:l.ss||'',cidade:l.cidade||'',bairro:l.bairro||'',setor:l.setor||'',logradouro:l.logradouro||'',numero:l.numero||'',referencia_localizacao:l.referencia_localizacao||'',localizacao:l.localizacao||'',servico:x.servico||'',tecnico:x.tecnico||'',equipe_executou:'',tarefa:x.tsk_id,local:x.loc_id,tss_id:t.tss_id||'',link:'',situacao_campo:x.situacao_campo||'',tags:t.tags||'',status_integracao:x.status_integracao||l.status_integracao||'',hidrometro:l.hidrometro||'',servico_executado:'',informacao_bombeiro:'',informacao_solicitante:l.informacao_solicitante||'',esclarecimento_solicitante:l.esclarecimento_solicitante||'',inicio_atividade:'',fim_atividade:'',fim_real:'',ultima_atividade:'',data_finalizacao:'',criado_em:fmt(x.tsk_insertdatehour)}});
  const total=null; // Paginação leve: sem COUNT(*) a cada página.
  const data={ok:true,count:rows.length,total,hasMore:total===null?pagina.hasMore:offset+rows.length<total,offset,limit,ms:Date.now()-started,rows};setCache(key,data);res.set('X-Cache','MISS');return res.json(data);
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
 const rows=registrosPagina.map(x=>{const l=locals.get(String(x.loc_id))||{},t=tasks.get(String(x.tsk_id))||{},fmt=v=>v?new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(v)).replace(',',''):'';const dataFinalizacao=fmt(t.ultima_atividade_raw);return{ss:x.ss||'',cidade:l.cidade||x.cidade_base||'',bairro:l.bairro||x.bairro_base||'',setor:l.setor||'',logradouro:l.logradouro||x.logradouro_base||'',numero:l.numero||x.numero_base||'',referencia_localizacao:l.referencia_localizacao||'',localizacao:l.localizacao||'',servico:x.servico||'',tecnico:x.tecnico||'',equipe_executou:t.equipe_executou||x.tecnico||'',tarefa:x.tsk_id,local:x.loc_id,tss_id:t.tss_id||'',link:(Number(t.tss_id)===50&&t.tsk_accesstoken)?`https://consglobalmetropole.umov.me/CenterWeb/report/schedule/${x.tsk_id}/${t.tsk_accesstoken}`:'',situacao_campo:x.situacao_campo||t.situacao_campo||'',tags:t.tags||'',status_integracao:x.status_integracao||l.status_integracao||t.status_integracao||'',hidrometro:l.hidrometro||'',servico_executado:l.informacao_bombeiro||l.servico_executado||campo(l,'e_informacaoexecucao','e_informacaoexecucaocampo','e_retornoexecucao','e_servicoexecutado','e_servicoexecutadoequipe')||campo(t,'e_informacaoexecucaosiscom','e_informacaoexecucao','e_informacaoexecucaocampo','e_retornoexecucao','e_servicoexecutado','e_servicoexecutadoequipe')||'',materiais_bombeiro:campo(l,'e_materialusado','e_material','e_materiais','e_materialutilizado','e_materiaisutilizados','e_materiaislancados')||campo(t,'e_materialusado','e_material','e_materiais','e_materialutilizado','e_materiaisutilizados','e_materiaislancados')||'',informacao_solicitante:l.informacao_solicitante||'',esclarecimento_solicitante:l.esclarecimento_solicitante||'',inicio_atividade:fmt(t.inicio_atividade_raw),fim_atividade:fmt(t.fim_real_raw),fim_real:fmt(t.fim_real_raw),ultima_atividade:dataFinalizacao,data_finalizacao:dataFinalizacao,criado_em:fmt(x.data_referencia)}});
 const total=null; // Paginação leve: sem varredura para contar todas as SS.
 const data={ok:true,count:rows.length,total,hasMore:total===null?base.rows.length>limit:offset+rows.length<total,offset,limit,ms:Date.now()-started,rows};setCache(key,data);res.set('X-Cache','MISS');res.json(data);
}catch(e){console.error('Recepção:',e);res.status(500).json({ok:false,error:e.message})}});
app.get('/api/macros',async(req,res)=>{try{const hit=getCache('macros',300000);if(hit)return res.json({ok:true,rows:hit});const r=await pool.query({text:`SELECT DISTINCT TRIM(tty_description) AS macro FROM u45468.tasktype WHERE tty_description IS NOT NULL AND TRIM(tty_description)<>'' ORDER BY 1`,query_timeout:6000});setCache('macros',r.rows);res.json({ok:true,rows:r.rows})}catch(e){res.status(500).json({ok:false,error:e.message})}});
app.get('/api/cidades',async(req,res)=>{try{const hit=getCache('cidades',300000);if(hit)return res.json({ok:true,rows:hit});const r=await pool.query({text:`SELECT DISTINCT TRIM(e_localidade) AS cidade FROM u45468.dbout_local WHERE e_localidade IS NOT NULL AND TRIM(e_localidade)<>'' ORDER BY 1`,query_timeout:6000});setCache('cidades',r.rows);res.json({ok:true,rows:r.rows})}catch(e){res.status(500).json({ok:false,error:e.message})}});
app.get('/api/equipes',async(req,res)=>{try{const q=String(req.query.q||'').trim(),key='eq:'+q.toLowerCase(),hit=getCache(key,60000);if(hit)return res.json({ok:true,rows:hit});const values=[],where=['age_name IS NOT NULL',"TRIM(age_name)<>''"];if(q){values.push('%'+q+'%');where.push('(age_name ILIKE $1 OR CAST(age_id AS TEXT) ILIKE $1)')}const r=await pool.query({text:`SELECT DISTINCT age_id AS id,age_name AS nome FROM u45468.agent WHERE ${where.join(' AND ')} ORDER BY age_name LIMIT 80`,values,query_timeout:6000});setCache(key,r.rows);res.json({ok:true,rows:r.rows})}catch(e){res.status(500).json({ok:false,error:e.message})}});

// Envio de SS para equipe: grava no uMov, nunca apenas na interface.
app.post('/api/enviar-equipe',async(req,res)=>{
 try{
  const tarefas=[...new Set((Array.isArray(req.body?.tarefas)?req.body.tarefas:[]).map(Number))];
  const agente=Number(req.body?.agente);
  if(!tarefas.length||tarefas.length>100||tarefas.some(x=>!Number.isSafeInteger(x)||x<=0)||!Number.isSafeInteger(agente)||agente<=0)return res.status(400).json({ok:false,error:'Selecione uma equipe válida e até 100 SS.'});
  // A atribuição do agente foi confirmada em uma requisição real do VilaBoa.
  // ID de situação é opcional: nunca inventar um valor.
  const situacaoId=String(process.env.UMOV_EM_CAMPO_SITUATION_ID||'').trim();
  if(situacaoId&&!/^[0-9]+$/.test(situacaoId))return res.status(400).json({ok:false,error:'UMOV_EM_CAMPO_SITUATION_ID deve ser numérico quando configurado.'});
  const equipe=await pool.query({text:'SELECT age_id,age_name FROM u45468.agent WHERE age_id=$1 LIMIT 1',values:[agente],query_timeout:5000});
  if(!equipe.rows.length)return res.status(404).json({ok:false,error:'Equipe não encontrada no uMov.'});
  const resultados=[];
  for(const tarefa of tarefas){
   try{
    const check=await pool.query({text:'SELECT tsk_id FROM u45468.task WHERE tsk_id=$1 LIMIT 1',values:[tarefa],query_timeout:4000});
    if(!check.rows.length)throw Error('Tarefa não encontrada');
    // A situação precisa ser configurada conforme o ID REAL da API uMov.
    // Não presumir que atribuir um agente altera automaticamente a situação.
    const situacaoXml=situacaoId?`<situation><id>${xmlEscape(situacaoId)}</id></situation>`:'';
    await postUmovXml('schedule',tarefa,`<schedule><agent><id>${agente}</id></agent>${situacaoXml}</schedule>`);
    const verificacao=await pool.query({text:`SELECT t.age_id,d.tsk_situation FROM u45468.task t LEFT JOIN u45468.dbout_task d ON d.tsk_id=t.tsk_id WHERE t.tsk_id=$1 LIMIT 1`,values:[tarefa],query_timeout:4000});
    const estado=verificacao.rows[0]||{};
    const emCampo=String(estado.tsk_situation||'').trim().toLowerCase()==='em campo';
    const equipeConfirmada=String(estado.age_id||'')===String(agente);
    resultados.push({tarefa,ok:true,confirmado:emCampo&&equipeConfirmada, situacao:estado.tsk_situation||'', aviso:emCampo&&equipeConfirmada?'':'Envio aceito; mudança para Em campo ainda não confirmada no banco.'});
   }catch(e){resultados.push({tarefa,ok:false,error:e.message})}
  }
  for(const k of [...cache.keys()])if(k.startsWith('ss:'))cache.delete(k);
  res.json({ok:resultados.every(x=>x.ok),equipe:equipe.rows[0].age_name,resultados,avisos:'Atribuição enviada ao uMov. A situação Em campo só é confirmada quando o banco sincronizado mostrar esse estado.'});
 }catch(e){res.status(500).json({ok:false,error:e.message})}
});

// Marca notas retornadas de campo no uMov. A chave fica exclusivamente nas
// variáveis da Vercel; ela nunca é entregue ao navegador.
const integrationStatuses=new Set(['Baixada','Rejeitada','Duplicada']);
const xmlEscape=value=>String(value).replace(/[<>&'\"]/g,char=>({'<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','"':'&quot;'}[char]));
// A API XML do uMov recebe o alternativeIdentifier da opção cadastrada no
// campo de lista "situacao". O rótulo mostrado no painel pode ser diferente.
const identificadorSituacao=status=>String(process.env[`UMOV_STATUS_${status.toUpperCase()}`]||(status==='Baixada'?'Baixada no Siscom':status)).trim();
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
const normalizaCampo=v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
const textoXml=v=>String(v||'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g,' ').trim();
async function getUmovXml(resource,id){
 const token=String(process.env.UMOV_API_TOKEN||'').trim();
 const base=String(process.env.UMOV_API_BASE_URL||'https://api.umov.me/CenterWeb/api').replace(/\/$/,'');
 if(!token)throw new Error('Integração uMov não configurada. Cadastre UMOV_API_TOKEN na Vercel.');
 const response=await fetch(`${base}/${encodeURIComponent(token)}/${resource}/${encodeURIComponent(id)}.xml`,{signal:AbortSignal.timeout(12000)});
 const xml=await response.text();
 if(!response.ok)throw new Error(`uMov respondeu ${response.status}: ${xml.replace(/\s+/g,' ').trim().slice(0,240)}`);
 return xml;
}
// Consulta o historico real do formulario de execucao; identifica a chave da tarefa
// pelo catalogo para nao assumir nomes de colunas entre versoes do uMov.
const historicosExecucao=['dbout_history_1650496_at_execucaoservico','dbout_history_at_execucaoservicoeteeta'];
async function retornoHistorico(tarefa){
 const key='retorno:db:'+tarefa,hit=getCache(key,60000);if(hit)return hit;
 const saida={servico_executado:'',materiais_bombeiro:'',pavimentacao:''};
 for(const tabela of historicosExecucao){
  try{
   const meta=await pool.query({text:`SELECT column_name FROM information_schema.columns WHERE table_schema='u45468' AND table_name=$1`,values:[tabela],query_timeout:4000});
   const nomes=new Set(meta.rows.map(r=>r.column_name));
   const chave=['tsk_id','task_id','tsk_id_task','hts_tsk_id'].find(n=>nomes.has(n));
   if(!chave){console.warn('Historico sem chave de tarefa conhecida:',tabela);continue}
   const campos=['e_cp_servicoexecutado','e_cp_material','e_cp_pavimentacao'];
   const selecionados=campos.filter(n=>nomes.has(n));if(!selecionados.length)continue;
   const ordenacao=['hts_id','htr_id','his_id','id'].find(n=>nomes.has(n));
   const sql=`SELECT ${selecionados.map(n=>'"'+n+'"').join(',')} FROM u45468."${tabela}" WHERE "${chave}"=$1 ${ordenacao?'ORDER BY "'+ordenacao+'" DESC':''} LIMIT 30`;
   const resultado=await pool.query({text:sql,values:[tarefa],query_timeout:6000});
   for(const r of resultado.rows){
    if(!saida.servico_executado&&r.e_cp_servicoexecutado?.trim())saida.servico_executado=r.e_cp_servicoexecutado;
    if(!saida.materiais_bombeiro&&r.e_cp_material?.trim())saida.materiais_bombeiro=r.e_cp_material;
    if(!saida.pavimentacao&&r.e_cp_pavimentacao?.trim())saida.pavimentacao=r.e_cp_pavimentacao;
   }
  }catch(err){console.warn('Consulta de retorno:',tabela,err.message)}
 }
 return setCache(key,saida);
}
app.get('/api/retorno-equipe/:tarefa',async(req,res)=>{try{
 const tarefa=Number(req.params.tarefa);if(!Number.isSafeInteger(tarefa)||tarefa<=0)return res.status(400).json({ok:false,error:'Tarefa invalida.'});
 const dados=await retornoHistorico(tarefa);
 // O banco e a fonte principal. API opcional apenas quando faltarem campos.
 if(!dados.servico_executado||!dados.materiais_bombeiro||!dados.pavimentacao){
  try{
   const xml=await getUmovXml('schedule',tarefa);
   const bloco=(xml.match(/<customFields\b[^>]*>([\s\S]*?)<\/customFields>/i)||[])[1]||xml;
   const campos={};let match;const re=/<([A-Za-z][\w.-]*)\b[^>]*>([\s\S]*?)<\/\1>/g;
   while((match=re.exec(bloco))){const valor=textoXml(match[2]);if(valor)campos[normalizaCampo(match[1])]=valor}
   const obter=(...nomes)=>nomes.map(normalizaCampo).map(nome=>campos[nome]||Object.entries(campos).find(([chave])=>chave.includes(nome))?.[1]).find(Boolean)||'';
   dados.servico_executado ||=obter('cp_servicoexecutado','servicoexecutado');
   dados.materiais_bombeiro ||=obter('cp_material','materialusado','materiais');
   dados.pavimentacao ||=obter('cp_pavimentacao','pavimentacao');
  }catch(err){console.warn('API uMov complementar:',err.message)}
 }
 res.json({ok:true,...dados});
}catch(error){res.status(500).json({ok:false,error:error.message})}});
const programacaoUrl=String(process.env.PROGRAMACAO_API_URL||'https://vilaboa.net.br/vila_velha_programacao/server.php');
async function programacaoFetch(query='',form=null){
 const sep=programacaoUrl.includes('?')?'&':'?';
 const response=await fetch(programacaoUrl+(query?sep+query:''),{method:form?'POST':'GET',headers:form?{'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8','X-Requested-With':'XMLHttpRequest'}:{'Accept':'application/json'},body:form?new URLSearchParams(form).toString():undefined,signal:AbortSignal.timeout(20000)});
 const texto=await response.text();let dados;try{dados=JSON.parse(texto)}catch{throw new Error(`Servidor de itens respondeu ${response.status}.`)}
 if(!response.ok)throw new Error(dados?.message||dados?.error||`Servidor de itens respondeu ${response.status}.`);
 return dados;
}
app.get('/api/materiais',async(req,res)=>{try{const hit=getCache('programacao:materiais',300000);if(hit)return res.json({ok:true,rows:hit});const rows=await programacaoFetch('materiais=1');setCache('programacao:materiais',Array.isArray(rows)?rows:[]);res.json({ok:true,rows:Array.isArray(rows)?rows:[]})}catch(error){res.status(502).json({ok:false,error:error.message})}});
app.get('/api/itens',async(req,res)=>{try{const ss=String(req.query.ss||'').trim();if(!ss)return res.status(400).json({ok:false,error:'Informe a SS.'});const rows=await programacaoFetch('itens=1&ss='+encodeURIComponent(ss));res.json({ok:true,rows:Array.isArray(rows)?rows:[]})}catch(error){res.status(502).json({ok:false,error:error.message})}});
app.post('/api/itens',async(req,res)=>{try{const ss=String(req.body?.ss||'').trim(),material=String(req.body?.material||'').trim(),unidade=String(req.body?.unidade||'').trim(),quantidade=String(req.body?.quantidade||'').trim(),valor_total=String(req.body?.valor_total||'').trim();if(!ss||!material||!unidade||!quantidade)return res.status(400).json({ok:false,error:'Preencha material, unidade e quantidade.'});const result=await programacaoFetch('',{inserir_item:'1',ss,material,unidade,quantidade,valor_total});res.json({ok:result?.success!==false,message:result?.message||'Item lançado com sucesso.'})}catch(error){res.status(502).json({ok:false,error:error.message})}});
// Recebe a lista uma única vez; processa sequencialmente para proteger a API de programação.
app.post('/api/itens/lote',async(req,res)=>{
 const ss=String(req.body?.ss||'').trim(),itens=req.body?.itens;
 if(!ss||!Array.isArray(itens)||!itens.length||itens.length>100)return res.status(400).json({ok:false,error:'Informe a SS e de 1 a 100 itens.'});
 const preparados=itens.map((i,index)=>({index,material:String(i?.material||'').trim(),unidade:String(i?.unidade||'').trim(),quantidade:Number(i?.quantidade),valor_total:i?.valor_total==null?'':String(i.valor_total)}));
 if(preparados.some(i=>!i.material||!i.unidade||!Number.isFinite(i.quantidade)||i.quantidade<=0||!Number.isFinite(Number(i.valor_total||0))))return res.status(400).json({ok:false,error:'Confira os materiais, unidades, quantidades e valores.'});
 const resultados=[];
 for(const i of preparados){try{const r=await programacaoFetch('',{inserir_item:'1',ss,material:i.material,unidade:i.unidade,quantidade:String(i.quantidade),valor_total:i.valor_total});if(r?.success===false)throw new Error(r.message||'Falha ao gravar');resultados.push({index:i.index,ok:true});}catch(e){resultados.push({index:i.index,ok:false,error:e.message});break;}}
 res.json({ok:resultados.length===preparados.length&&resultados.every(i=>i.ok),resultados,gravados:resultados.filter(i=>i.ok).length,total:preparados.length,message:'Confira os itens gravados e os pendentes.'});
});
app.delete('/api/itens/:id',async(req,res)=>{try{const item_id=String(req.params.id||'').trim();if(!item_id)return res.status(400).json({ok:false,error:'Item inválido.'});const result=await programacaoFetch('',{excluir_item:'1',item_id});res.json({ok:result?.success!==false,message:result?.message||'Item excluído.'})}catch(error){res.status(502).json({ok:false,error:error.message})}});
app.post('/api/status-integracao',async(req,res)=>{try{
 const status=String(req.body?.status||'').trim();
 const tarefas=[...new Set((Array.isArray(req.body?.tarefas)?req.body.tarefas:[]).map(Number).filter(Number.isInteger))].slice(0,25);
 if(!integrationStatuses.has(status))return res.status(400).json({ok:false,error:'Status de integração inválido.'});
 if(!tarefas.length)return res.status(400).json({ok:false,error:'Selecione ao menos uma SS.'});
 const resultados=[];
 for(const tarefa of tarefas){
  try{
   const valor=xmlEscape(identificadorSituacao(status));
   await postUmovXml('schedule',tarefa,`<schedule><customFields><situacao><alternativeIdentifier>${valor}</alternativeIdentifier></situacao></customFields></schedule>`);
   resultados.push({tarefa,ok:true,status});
  }catch(error){resultados.push({tarefa,ok:false,error:error.message})}
 }
 const sucesso=resultados.filter(item=>item.ok).length;
 const primeiraFalha=resultados.find(item=>!item.ok);
 res.status(sucesso?200:502).json({ok:sucesso>0,status,resultados,sucesso,falhas:resultados.length-sucesso,error:primeiraFalha?.error});
}catch(error){
 console.error('Status integração:',error);
 const detalhe=String(error?.message||'Erro interno').replace(/\s+/g,' ').trim().slice(0,300);
 res.status(500).json({ok:false,error:`Não foi possível atualizar o status de integração: ${detalhe}`})
}});
// Retorno para Recepção: solicita a mudança no uMov e só confirma após
// verificar o status real no PostgreSQL. Nunca altera apenas a interface.
app.post('/api/retornar-recepcao',async(req,res)=>{
 try{
  const tarefas=[...new Set((Array.isArray(req.body?.tarefas)?req.body.tarefas:[]).map(Number).filter(x=>Number.isSafeInteger(x)&&x>0))].slice(0,25);
  if(!tarefas.length)return res.status(400).json({ok:false,error:'Selecione ao menos uma SS.'});
  const resultados=[];
  for(const tarefa of tarefas){
   try{
    const antes=await pool.query({text:`SELECT d.tsk_situation,t.age_id FROM u45468.dbout_task d JOIN u45468.task t ON t.tsk_id=d.tsk_id WHERE d.tsk_id=$1 LIMIT 1`,values:[tarefa],query_timeout:4000});
    if(!antes.rows.length)throw Error('Tarefa não localizada no uMov.');
    const atual=String(antes.rows[0].tsk_situation||'').trim().toLowerCase();
    if(!['em campo','pendente de envio para campo'].includes(atual))throw Error('A SS não está Em Campo. Situação atual: '+atual);
    // Desvincula o agente e solicita o retorno na mesma operação uMov.
    // Não modifica diretamente as tabelas espelho do PostgreSQL.
    const pendenteId=String(process.env.UMOV_PENDENTE_SITUATION_ID||'').trim();
    if(pendenteId&&!/^[0-9]+$/.test(pendenteId))throw Error('UMOV_PENDENTE_SITUATION_ID deve ser numérico quando configurado.');
    // A remoção de agente usa o mesmo endpoint comprovado para atribuição.
    // O ID de situação só é enviado quando foi explicitamente confirmado.
    const situacaoXml=pendenteId?`<situation><id>${xmlEscape(pendenteId)}</id></situation>`:'';
    const xml=`<schedule><agent><id></id></agent>${situacaoXml}</schedule>`;
    await postUmovXml('schedule',tarefa,xml);
    let confirmado=false,ultimaSituacao=atual,ultimoAgente=antes.rows[0].age_id;
    for(let tentativa=0;tentativa<4;tentativa++){
      const check=await pool.query({text:`SELECT d.tsk_situation,t.age_id FROM u45468.dbout_task d JOIN u45468.task t ON t.tsk_id=d.tsk_id WHERE d.tsk_id=$1 LIMIT 1`,values:[tarefa],query_timeout:4000});
      ultimaSituacao=String(check.rows[0]?.tsk_situation||'').trim().toLowerCase();
      ultimoAgente=check.rows[0]?.age_id;
      if(ultimaSituacao==='pendente de envio para campo' && (ultimoAgente===null||ultimoAgente===undefined)){confirmado=true;break}
      if(tentativa<3)await new Promise(resolve=>setTimeout(resolve,700));
    }
    resultados.push({tarefa,ok:true,confirmado,situacao:ultimaSituacao,agente:ultimoAgente??null,aviso:confirmado?'':'Solicitação aceita pela API; retorno à Recepção ainda não confirmado. Verifique a situação no uMov. Se a situação não mudar, é necessário identificar o ID real de Pendente de envio para campo.'});
   }catch(error){resultados.push({tarefa,ok:false,error:String(error.message||error).slice(0,250)})}
  }
  const sucesso=resultados.filter(x=>x.ok).length,primeiraFalha=resultados.find(x=>!x.ok);
  if(sucesso)cache.clear();
  res.status(sucesso?200:502).json({ok:sucesso>0,sucesso,falhas:resultados.length-sucesso,resultados,error:primeiraFalha?.error});
 }catch(error){res.status(500).json({ok:false,error:error.message})}
});
app.post('/api/tags',async(req,res)=>{try{
 const tag=String(req.body?.tag||'').trim().replace(/\s+/g,' ').slice(0,120);
 const tarefas=[...new Set((Array.isArray(req.body?.tarefas)?req.body.tarefas:[]).map(Number).filter(Number.isInteger))].slice(0,25);
 if(!tag)return res.status(400).json({ok:false,error:'Informe uma tag.'});
 if(!tarefas.length)return res.status(400).json({ok:false,error:'Selecione ao menos uma SS.'});
 const resultados=[];
 for(const tarefa of tarefas){
  try{await postUmovXml('schedule',tarefa,`<schedule><customFields><tag>${xmlEscape(tag)}</tag></customFields></schedule>`);resultados.push({tarefa,ok:true})}
  catch(error){resultados.push({tarefa,ok:false,error:error.message})}
 }
 const sucesso=resultados.filter(item=>item.ok).length,primeiraFalha=resultados.find(item=>!item.ok);
 if(sucesso)cache.clear();
 res.status(sucesso?200:502).json({ok:sucesso>0,tag,resultados,sucesso,falhas:resultados.length-sucesso,error:primeiraFalha?.error});
}catch(error){res.status(500).json({ok:false,error:`Não foi possível gravar a tag: ${String(error?.message||'Erro interno').slice(0,300)}`})}});
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
