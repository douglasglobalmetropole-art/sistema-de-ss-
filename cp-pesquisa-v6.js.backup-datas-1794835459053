'use strict';
/**
 * Pesquisa GLOBAL SS V6. Utiliza tabelas físicas do uMov, a mesma estratégia
 * da /api/localizar-ss-rapida. Não depende de views dbout_* para filtrar.
 * Sem gravar no uMov; filtros, status e TAG antes de LIMIT/OFFSET.
 * Ativação reversível por CP_PESQUISA_V6=false.
 */
const TELAS=new Set(['recepcao','campo','baixar','encerradas','tramitacao']);
const CAMPOS={
 recepcao:['ss','equipe_executou','logradouro','bairro','cidade','setor','servico','tags','criado_em'],
 campo:['ss','logradouro','bairro','cidade','setor','servico','tags','equipe_executou'],
 baixar:['ss','logradouro','bairro','cidade','setor','servico','tags','equipe_executou','data_finalizacao'],
 encerradas:['ss','logradouro','bairro','cidade','setor','servico','tags','equipe_executou','data_finalizacao','status_integracao','criado_em'],
 tramitacao:['ss','logradouro','bairro','cidade','setor','servico','tags','equipe_executou','data_finalizacao','status_integracao','criado_em']
};
const perf=require('./lib/performance');
const C=perf.scopedMap(()=> 'search',100);
const searchFlight=perf.singleFlight(100),metadataFlight=perf.singleFlight(20);
const fieldCache=new Map();
const str=x=>String(x??'').trim();
const norm=x=>str(x).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
const isoDate=x=>/^\d{4}-\d{2}-\d{2}$/.test(str(x));
const fmt=require('./lib/performance').formatDate;
const bounded=(v,def,max)=>{const n=Number(v);return Number.isInteger(n)&&n>=0?Math.min(n,max):def};
function parse(req){
 const tela=str(req.query.tela||'recepcao');
 if(!TELAS.has(tela))throw Object.assign(new Error('Aba inválida.'),{status:400});
 const filters=Object.fromEntries(CAMPOS[tela].map(k=>[k,str(req.query[k]).slice(0,100)]).filter(([,v])=>v));
 const inicio=str(req.query.inicio),fim=str(req.query.fim);
 if ((inicio&&!isoDate(inicio))||(fim&&!isoDate(fim)))throw Object.assign(new Error('Período inválido.'),{status:400});
 const macro=str(req.query.macro).split('\u001f').map(str).filter(Boolean).slice(0,30);
 const municipios=(Array.isArray(req.divisaoSS?.cidades)?req.divisaoSS.cidades:str(req.query.municipios||req.query.cidade).split('\u001f')).map(norm).filter(Boolean).slice(0,30);
 return {tela,filters,inicio,fim,macro,municipios,equipe:str(req.query.equipe).slice(0,100),limit:Math.max(1,bounded(req.query.limit,25,100)),offset:bounded(req.query.offset,0,100000)};
}
async function loadFieldIds(pool,base='principal'){
 const cached=fieldCache.get(base);if(cached&&Date.now()-cached.timestamp<300000)return cached.fields;
 const q=await pool.query({text:`SELECT cfd_id,cfd_table,cfd_integrationid FROM u45468.customfield WHERE cfd_table IN ('task','local') AND LOWER(TRIM(cfd_integrationid)) IN ('situacao','tag','tags','setor','hidrometro','reflocalizacao','informacaosolicitante','esclarecimentosolicitante','servicoexecutadosiscom','informacaoexecucaosiscom','materialusado','material','materiais')`,query_timeout:4000});
 const find=(table,...keys)=>q.rows.filter(x=>str(x.cfd_table)===table&&keys.includes(str(x.cfd_integrationid).toLowerCase())).map(x=>str(x.cfd_id)).filter(Boolean);
 const fields={status:find('task','situacao'),tags:find('task','tag','tags'),setor:find('local','setor'),hidrometro:find('local','hidrometro'),referencia:find('local','reflocalizacao'),info:find('local','informacaosolicitante'),esclarecimento:find('local','esclarecimentosolicitante'),servicoExecutado:find('local','servicoexecutadosiscom','informacaoexecucaosiscom'),materiais:find('local','materialusado','material','materiais')};
 // Sem metadado não é possível classificar "Notas Baixadas" com segurança.
 if(!fields.status.length)throw Object.assign(new Error('Campo oficial de situação não localizado no uMov; pesquisa V6 não ativada para evitar classificação incorreta.'),{status:503});
 fieldCache.set(base,{timestamp:Date.now(),fields});return fields;
}
function fieldIds(pool,base='principal'){return metadataFlight(base,()=>loadFieldIds(pool,base));}
function statement(params, ids){
 const val=[];const add=x=>{val.push(x);return '$'+val.length};
 const {tela,filters,inicio,fim,macro,municipios,equipe,limit,offset}=params;
 const base=[];
 if(!filters.ss&&isoDate(inicio)&&isoDate(fim)){
  const col='t.tsk_insertdatehour';
  base.push(`${col} >= ${add(inicio)}::date`,`${col} < (${add(fim)}::date + INTERVAL '1 day')`);
 }
 const conditions={recepcao:"LOWER(TRIM(COALESCE(t.tsk_situation,'')))='pendente de envio para campo'",campo:"LOWER(TRIM(COALESCE(t.tsk_situation,'')))='em campo'",baixar:"LOWER(TRIM(COALESCE(t.tsk_situation,'')))='retornada de campo'"};
 if(conditions[tela])base.push(conditions[tela]);
 const like=(expression,value)=>base.push(`${expression} ILIKE ${add('%'+value+'%')}`);
 if(filters.ss)like('l.loc_integrationid',filters.ss);
 if(filters.logradouro)like('l.loc_street',filters.logradouro);
 if(filters.bairro)like('l.loc_neighborhood',filters.bairro);
 if(filters.cidade)like('l.loc_city',filters.cidade);
 if(filters.servico)like('tt.tty_description',filters.servico);
 if(filters.equipe_executou)like('a.age_name',filters.equipe_executou);
 if(filters.criado_em)like("TO_CHAR(t.tsk_insertdatehour,'DD/MM/YYYY HH24:MI')",filters.criado_em);
 if(filters.data_finalizacao){
  const p=add('%'+filters.data_finalizacao+'%');
  base.push(`(TO_CHAR(t.tsk_lastexecutiondatehour,'DD/MM/YYYY HH24:MI') ILIKE ${p} OR TO_CHAR(t.tsk_realfinaldatehour,'DD/MM/YYYY HH24:MI') ILIKE ${p})`);
 }
 if(macro.length)base.push(`TRIM(tt.tty_description)=ANY(${add(macro)}::text[])`);
 if(municipios.length){
  const cityParam=add(municipios);
  // Filtragem direta pela tabela fisica antes da paginacao.
  const normCity=expr=>`translate(UPPER(TRIM(${expr})),'ÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛÇ','AAAAEEEIIIOOOOUUUC')`;
  base.push(`${normCity('l.loc_city')}=ANY(${cityParam}::text[])`);
 }
 if(equipe)like('a.age_name',equipe);
 const statusParam=add(ids.status),tagsParam=add(ids.tags),setorParam=add(ids.setor);
 // Pesquisa valor do campo na tabela física, em vez de abrir toda a view dbout_task.
 const valueExpr=(tableAlias,idColumn,cfdParameter)=>`(SELECT COALESCE(NULLIF(ce.cev_description::text,''),NULLIF(v.cfv_externalvalue::text,''),NULLIF(v.cfv_internalvalue::text,''),'') FROM u45468.customfieldvalue v LEFT JOIN u45468.customentityvalue ce ON ce.cev_id=CASE WHEN v.cfv_internalvalue ~ '^[0-9]{1,18}$' THEN v.cfv_internalvalue::bigint ELSE NULL END WHERE v.cfv_registerid=${tableAlias}.${idColumn} AND v.cfd_id=ANY(${cfdParameter}::bpchar[]) LIMIT 1)`;
 const status=valueExpr('b','tsk_id',statusParam),tags=valueExpr('b','tsk_id',tagsParam),setor=valueExpr('b','loc_id',setorParam);
 const final=[];
  // Recepcao: excluir SS cujo status de integracao no uMov ja e Rejeitada.
 // A classificacao acontece no SQL, antes de LIMIT/OFFSET.
 if(tela==='recepcao')final.push(
  "LOWER(TRIM(COALESCE(p.status_integracao,''))) NOT LIKE 'rejeitad%'"
 );
 if(tela==='baixar')final.push("COALESCE(NULLIF(TRIM(p.status_integracao),''),'')=''",'p.tsk_lastexecutiondatehour IS NOT NULL');
 else if(tela==='encerradas')final.push("NULLIF(TRIM(p.status_integracao),'') IS NOT NULL");
 else if(tela==='tramitacao')final.push("LOWER(TRIM(COALESCE(p.status_integracao,''))) LIKE 'baixad%'");
 if(filters.tags)final.push(`p.tags ILIKE ${add('%'+filters.tags+'%')}`);
 if(filters.setor)final.push(`p.setor ILIKE ${add('%'+filters.setor+'%')}`);
 if(filters.status_integracao)final.push(`p.status_integracao ILIKE ${add('%'+filters.status_integracao+'%')}`);
 // Filtros são avaliados antes da paginação. Inclui uma linha a mais para hasMore.
 const limitParam=add(limit+1), offsetParam=add(offset);
 const sort=tela==='recepcao'?'p.tsk_insertdatehour':'p.tsk_lastexecutiondatehour';
  const baseSql=`SELECT t.tsk_id,t.loc_id,t.age_id,t.tty_id,t.tss_id,
     t.tsk_insertdatehour,t.tsk_lastexecutiondatehour,t.tsk_realinitialdatehour,t.tsk_realfinaldatehour,
     t.tsk_situation,
     l.loc_integrationid AS ss,l.loc_city AS cidade,l.loc_neighborhood AS bairro,
     l.loc_street AS logradouro,l.loc_streetnumber AS numero
    FROM u45468.task t JOIN u45468.local l ON l.loc_id=t.loc_id
    ${filters.equipe_executou||equipe?'LEFT JOIN u45468.agent a ON a.age_id=t.age_id':''}
    ${filters.servico||macro.length?'LEFT JOIN u45468.tasktype tt ON tt.tty_id=t.tty_id':''}
    ${base.length?'WHERE '+base.join(' AND '):''}`;
  // Filtra/classifica antes do LIMIT, mas enriquece apenas a pagina.
  // A base pode ser integrada ao plano: nao materializar todas as tarefas.
  const expressions={status_integracao:status,tags,setor};
  // Com filtros personalizados combinados, uma classificacao intermediaria
  // evita que o otimizador repita subconsultas correlacionadas em nested loops.
  const classify=!!(filters.tags||filters.setor||filters.status_integracao);
  const needed=new Set();
  if(classify)for(const condition of final)for(const match of condition.matchAll(/p\.(status_integracao|tags|setor)/g))needed.add(match[1]);
  const filtered=final.map(condition=>condition.replace(/p\.(status_integracao|tags|setor)/g,(_,field)=>classify?'b.'+field:expressions[field]).replace(/\bp\./g,'b.'));
  const onPage=expression=>expression.replaceAll('b.tsk_id','p.tsk_id').replaceAll('b.loc_id','p.loc_id');
  const classified=classify?`, classificadas AS MATERIALIZED (
    SELECT b.*,${[...needed].map(field=>expressions[field]+' AS '+field).join(',')} FROM b
   )`:'';
  const pageFields=Object.entries(expressions).filter(([field])=>!needed.has(field)).map(([field,expr])=>onPage(expr)+' AS '+field);
  const sql=`WITH b AS NOT MATERIALIZED (
    ${baseSql}
   )${classified}, pagina AS MATERIALIZED (
    SELECT b.* FROM ${classify?'classificadas':'b'} b ${filtered.length?'WHERE '+filtered.join(' AND '):''}
    ORDER BY ${sort.replace('p.','b.')} DESC NULLS LAST,b.tsk_id DESC
    LIMIT ${limitParam} OFFSET ${offsetParam}
   ) SELECT p.*,${pageFields.length?pageFields.join(',')+',':''}
     a.age_name AS tecnico,tt.tty_description AS servico,
     (SELECT to_jsonb(token_task)->>'tsk_accesstoken' FROM u45468.task token_task
      WHERE token_task.tsk_id=p.tsk_id LIMIT 1) AS token
    FROM pagina p
    LEFT JOIN u45468.agent a ON a.age_id=p.age_id
    LEFT JOIN u45468.tasktype tt ON tt.tty_id=p.tty_id
    ORDER BY ${sort} DESC NULLS LAST,p.tsk_id DESC`;
 return {text:sql,values:val};
}
async function extraFields(pool,rows,ids){
 const locals=[...new Set(rows.map(x=>String(x.loc_id)).filter(Boolean))];
 const fields=[...new Set([...ids.hidrometro,...ids.referencia,...ids.info,...ids.esclarecimento,...ids.servicoExecutado,...ids.materiais])];
 if(!locals.length||!fields.length)return new Map();
 const q=await pool.query({text:`SELECT cfv_registerid AS id,cfd_id,cfv_internalvalue AS interno,cfv_externalvalue AS externo FROM u45468.customfieldvalue WHERE cfv_registerid=ANY($1::bigint[]) AND cfd_id=ANY($2::bpchar[])`,values:[locals,fields],query_timeout:3000});
 const m=new Map();
 for(const x of q.rows){const key=str(x.id),record=m.get(key)||{},id=str(x.cfd_id),v=str(x.externo||x.interno);for(const [field,list] of Object.entries(ids))if(list.includes(id))record[field]=v;m.set(key,record);}
 return m;
}
function transform(rows,extras,hostRelatorioUmov){
 const host=typeof hostRelatorioUmov==='function'?str(hostRelatorioUmov()):'';
 const safeHost=/^[a-z0-9.-]+$/i.test(host)?host:'';
 return rows.map(x=>{
  const ext=extras.get(str(x.loc_id))||{};
  const ini=fmt(x.tsk_realinitialdatehour),fim=fmt(x.tsk_realfinaldatehour),ultima=fmt(x.tsk_lastexecutiondatehour);
  const token=str(x.token);
  return {ss:x.ss||'',tarefa:x.tsk_id,local:x.loc_id,
   cidade:x.cidade||'',bairro:x.bairro||'',logradouro:x.logradouro||'',numero:x.numero||'',setor:x.setor||'',
   servico:x.servico||'',tecnico:x.tecnico||'',equipe_executou:x.tecnico||'',
   tags:x.tags||'',situacao_campo:x.tsk_situation||'',status_integracao:x.status_integracao||'',
   tss_id:x.tss_id||'',hidrometro:ext.hidrometro||'',referencia_localizacao:ext.referencia||'',
   informacao_solicitante:ext.info||'',esclarecimento_solicitante:ext.esclarecimento||'',servico_executado:ext.servicoExecutado||'',informacao_bombeiro:ext.servicoExecutado||'',materiais_bombeiro:ext.materiais||'',
   inicio_atividade:ini,fim_atividade:fim,fim_real:fim,ultima_atividade:ultima,
   data_finalizacao:ultima||fim,periodo_execucao:[ini,fim||ultima].filter(Boolean).join(' – '),
   criado_em:fmt(x.tsk_insertdatehour),
   link:safeHost&&Number(x.tss_id)===50&&token?`https://${safeHost}/CenterWeb/report/schedule/${x.tsk_id}/${encodeURIComponent(token)}`:''
  };
 });
}
async function handler(req,res,{pool,hostRelatorioUmov,scope='principal:geral'}){
 const started=Date.now();let params;
 try{params=parse(req)}catch(e){return res.status(e.status||400).json({ok:false,error:e.message})}
 const version=perf.getGeneration();
 const key=scope+':'+JSON.stringify(params);
 const flightKey=version+':'+key;
 const cached=!req.query._refresh&&C.get(key);
 if(cached&&Date.now()-cached.ts<30000){res.set('X-Cache','HIT');res.set('X-CP-Search-Plan','fisica-campos-v6/cache');return res.json({...cached.data,ms:Date.now()-started})}
 try{
  const result=await searchFlight(flightKey,async()=>{
  const ids=await fieldIds(pool,scope.startsWith('lote1:')?'lote1':'principal');
  if(params.filters.tags&&!ids.tags.length)throw Object.assign(new Error('Campo TAG nao localizado no cadastro fisico do uMov; consulte o mapeamento antes de pesquisar.'),{status:503});
  if(params.filters.setor&&!ids.setor.length)throw Object.assign(new Error('Campo setor nao localizado no cadastro fisico do uMov; consulte o mapeamento antes de pesquisar.'),{status:503});
  const stmt=statement(params,ids);
  const t0=Date.now();const q=await pool.query({...stmt,query_timeout:8500});const msBanco=Date.now()-t0;
  const page=q.rows.slice(0,params.limit);
  // Dados auxiliares são opcionais e não devem deixar a LISTAGEM refém de uma view.
  const t1=Date.now();let details=new Map(),detalhesParciais=false;
  try{details=await extraFields(pool,page,ids)}catch(e){detalhesParciais=true;console.warn('[CP V6] metadados locais indisponíveis:',e.message)}
  const rows=transform(page,details,hostRelatorioUmov);

  const data={ok:true,rows,count:rows.length,total:null,hasMore:q.rows.length>params.limit,
   limit:params.limit,offset:params.offset,ms:Date.now()-started,
   tempos:{banco_ms:msBanco,detalhes_ms:Date.now()-t1},plano:'fisica-campos-v6-otimizada',detalhes_parciais:detalhesParciais};
  if(perf.getGeneration()===version)C.set(key,{ts:Date.now(),data});
  return {data,msBanco,msDetalhes:Date.now()-t1};
  });
  const {data,msBanco,msDetalhes}=result;
  res.set('X-Cache','MISS');res.set('X-CP-Search-Plan','fisica-campos-v6');
  res.set('Server-Timing',`banco;dur=${msBanco},detalhes;dur=${msDetalhes}`);
  return res.json({...data,ms:Date.now()-started});
 }catch(e){console.error('[CP V6] pesquisa:',e.message);const timeout=/timeout|timed out|canceling statement|read timeout/i.test(e.message);return res.status(e.status|| (timeout?504:503)).json({ok:false,error:timeout?'A pesquisa excedeu o limite de resposta do uMov. Verifique o plano SQL físico.':e.message,plano:'fisica-campos-v6'});}
}
module.exports={handler,statement,parse,transform,fieldIds};
