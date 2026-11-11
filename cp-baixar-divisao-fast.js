'use strict';
/**
 * Consulta compartilhada das abas Notas para Baixar e Notas Baixadas.
 * Usada tanto em / quanto nas cinco divisoes, por cp-pesquisa-v6.
 * - NENHUMA data padrao/oculta;
 * - cidades filtradas ANTES de LIMIT/OFFSET;
 * - status do campo fisico situacao do uMov (a fonte de dbout_task.e_situacao);
 * - uma consulta principal, sem varrer a view dbout_task nem fazer 70 lotes;
 * - apenas SELECT; nunca escreve no SISCOM ou uMov.
 *
 * A equivalencia do campo fisico com a view deve ser conferida no uMov real.
 */
const str = x => String(x ?? '').trim();
const norm = x => str(x).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
const isDate = x => /^\d{4}-\d{2}-\d{2}$/.test(str(x));

function createStatement(params, ids, candidateWindow=200) {
  const {tela,filters={},municipios=[],macro=[],equipe='',inicio='',fim='',limit=25,offset=0}=params;
  if(!['baixar','encerradas'].includes(tela))throw Error('Aba de notas invalida.');
  if(!Array.isArray(ids.status)||!ids.status.length)throw Error('Campo situacao do uMov nao configurado para classificar SS.');
  const values=[];
  const add=value=>{values.push(value);return '$'+values.length};
  const where=[];
  const after=[];
  const cities=[...new Set((municipios||[]).map(norm).filter(Boolean))];
  if(cities.length){
    // Mesma normalizacao usada no middleware de divisoes (acentos e caixa).
    where.push(`translate(UPPER(BTRIM(l.loc_city)),'ÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛÇ','AAAAEEEIIIOOOOUUUC')=ANY(${add(cities)}::text[])`);
  }
  const statusIds=add(ids.status);
  const statusSql=`COALESCE(NULLIF(TRIM(st.valor),''),'')`;
  if(tela==='baixar'){
    where.push("LOWER(TRIM(COALESCE(t.tsk_situation,'')))='retornada de campo'");
    where.push('t.tsk_lastexecutiondatehour IS NOT NULL');
    after.push(`${statusSql}=''`);
  }else after.push(`${statusSql}<>''`);
  // Datas apenas quando realmente informadas pelo usuario.
  if(inicio){if(!isDate(inicio))throw Error('Data inicial invalida.');where.push(`t.tsk_lastexecutiondatehour >= ${add(inicio)}::date`)}
  if(fim){if(!isDate(fim))throw Error('Data final invalida.');where.push(`t.tsk_lastexecutiondatehour < (${add(fim)}::date + INTERVAL '1 day')`)}
  const filterLike=(expr,value)=>{if(str(value))where.push(`${expr} ILIKE ${add('%'+str(value)+'%')}`)};
  filterLike('l.loc_integrationid',filters.ss);
  filterLike('l.loc_street',filters.logradouro);
  filterLike('l.loc_neighborhood',filters.bairro);
  filterLike('l.loc_city',filters.cidade);
  filterLike('tt.tty_description',filters.servico);
  filterLike('a.age_name',filters.equipe_executou);
  filterLike('a.age_name',equipe);
  filterLike("TO_CHAR(t.tsk_insertdatehour,'DD/MM/YYYY HH24:MI')",filters.criado_em);
  if(macro.length)where.push(`TRIM(tt.tty_description)=ANY(${add(macro)}::text[])`);
  if(str(filters.data_finalizacao)){
    const p=add('%'+filters.data_finalizacao+'%');
    where.push(`(TO_CHAR(t.tsk_lastexecutiondatehour,'DD/MM/YYYY HH24:MI') ILIKE ${p} OR TO_CHAR(t.tsk_realfinaldatehour,'DD/MM/YYYY HH24:MI') ILIKE ${p})`);
  }
  if(str(filters.status_integracao))after.push(`${statusSql} ILIKE ${add('%'+str(filters.status_integracao)+'%')}`);
  // TAG e setor devem ser filtrados no banco ANTES da paginacao.
  const valueExpr=(register,fieldIds)=>{
    if(!Array.isArray(fieldIds)||!fieldIds.length)throw Error('Campo de filtro nao encontrado no uMov.');
    const p=add(fieldIds);
    return `(SELECT COALESCE(NULLIF(ce.cev_description::text,''),NULLIF(v.cfv_externalvalue::text,''),NULLIF(v.cfv_internalvalue::text,''),'') FROM u45468.customfieldvalue v LEFT JOIN u45468.customentityvalue ce ON ce.cev_id=CASE WHEN v.cfv_internalvalue ~ '^[0-9]{1,18}$' THEN v.cfv_internalvalue::bigint ELSE NULL END WHERE v.cfv_registerid=${register} AND v.cfd_id=ANY(${p}::bpchar[]) LIMIT 1)`;
  };
  if(str(filters.tags))after.push(`${valueExpr('c.tsk_id',ids.tags)} ILIKE ${add('%'+filters.tags+'%')}`);
  if(str(filters.setor))after.push(`${valueExpr('c.loc_id',ids.setor)} ILIKE ${add('%'+filters.setor+'%')}`);
  const size=Math.max(1,Math.min(100,Number(limit)||25));
  const off=Math.max(0,Math.min(100000,Number(offset)||0));
  const lp=add(size+1),op=add(off),wp=add(Math.min(5000,Math.max(1,Math.trunc(candidateWindow))));
  // O primeiro CTE limita a busca FISICA com data mais recente primeiro.
  // A classificacao por campo personalizado so roda nos candidatos recentes.
  // Se nao houver candidatos suficientes, query() amplia a janela no maximo
  // duas vezes, sem ocultar registros ou mentir sobre o hasMore.
  const sql=`WITH candidatos AS MATERIALIZED (
     SELECT t.tsk_id,t.loc_id,t.age_id,t.tty_id,t.tss_id,
      t.tsk_insertdatehour,t.tsk_lastexecutiondatehour,
      t.tsk_realinitialdatehour,t.tsk_realfinaldatehour,t.tsk_situation,
      (to_jsonb(t)->>'tsk_accesstoken') AS token,
      l.loc_integrationid AS ss,l.loc_city AS cidade,l.loc_neighborhood AS bairro,
      l.loc_street AS logradouro,l.loc_streetnumber AS numero,
      a.age_name AS tecnico,tt.tty_description AS servico
     FROM u45468.task t
     JOIN u45468.local l ON l.loc_id=t.loc_id
     LEFT JOIN u45468.agent a ON a.age_id=t.age_id
     LEFT JOIN u45468.tasktype tt ON tt.tty_id=t.tty_id
     WHERE ${where.length?where.join(' AND '):'TRUE'}
     ORDER BY t.tsk_lastexecutiondatehour DESC NULLS LAST,t.tsk_id DESC
     LIMIT ${wp}
   )
   SELECT total.numero_candidatos AS __candidate_count,p.*
   FROM (SELECT COUNT(*) AS numero_candidatos FROM candidatos) total
   LEFT JOIN LATERAL (
    SELECT c.*,${statusSql} AS status_integracao
    FROM candidatos c
    LEFT JOIN LATERAL (
      SELECT COALESCE(NULLIF(ce.cev_description::text,''),
       NULLIF(v.cfv_externalvalue::text,''),
       NULLIF(v.cfv_internalvalue::text,''),'') AS valor
      FROM u45468.customfieldvalue v
      LEFT JOIN u45468.customentityvalue ce ON ce.cev_id=CASE
        WHEN v.cfv_internalvalue ~ '^[0-9]{1,18}$' THEN v.cfv_internalvalue::bigint ELSE NULL END
      WHERE v.cfv_registerid=c.tsk_id AND v.cfd_id=ANY(${statusIds}::bpchar[])
      LIMIT 1
    ) st ON TRUE
    WHERE ${after.join(' AND ')}
    ORDER BY c.tsk_lastexecutiondatehour DESC NULLS LAST,c.tsk_id DESC
    LIMIT ${lp} OFFSET ${op}
   ) p ON TRUE
   ORDER BY p.tsk_lastexecutiondatehour DESC NULLS LAST,p.tsk_id DESC`;
  return {text:sql,values,size,window:Math.min(5000,Math.max(1,Math.trunc(candidateWindow)))};
}

async function query(pool,params,ids){
  const page=Math.max(1,Math.min(100,Number(params.limit)||25));
  const offset=Math.max(0,Number(params.offset)||0);
  const requested=offset+page+1;
  if(requested>5000)throw Error('Pagina muito distante sem periodo; informe datas para localizar a SS com seguranca.');
  const windows=[Math.min(5000,Math.max(200,requested*5)),
    Math.min(5000,Math.max(800,requested*15)),
    Math.min(5000,Math.max(2400,requested*45))].filter((x,i,a)=>a.indexOf(x)===i);
  const deadline=Date.now()+7600;
  let rows=null;
  for(const windowSize of windows){
    const remaining=deadline-Date.now();
    if(remaining<500)break;
    const {text,values}=createStatement(params,ids,windowSize);
    const response=await pool.query({text,values,query_timeout:Math.min(6000,remaining)});
    const data=response.rows||[];
    const candidateCount=Number(data[0]?.__candidate_count||0);
    rows=data.filter(x=>x.tsk_id!=null);
    // 26 elegiveis = pagina completa e hasMore confirmado.
    // Menos candidatos que a janela = historico esgotado, hasMore falso.
    if(rows.length>page||candidateCount<windowSize)break;
    rows=null;
  }
  if(rows===null)throw Error('Nao foi possivel confirmar a pagina completa de SS no prazo. Refine por data ou municipio.');
  for(const row of rows)delete row.__candidate_count;
  if(!rows.length)return {rows};
  // Campos informativos: consultados apenas para as 25 linhas da pagina.
  // Erro aqui nao altera classificacao nem remove a SS da pagina.
  const fields=[...new Set([...(ids.tags||[]),...(ids.setor||[])].map(str).filter(Boolean))];
  if(!fields.length)return {rows};
  const tasks=new Set(rows.map(x=>str(x.tsk_id)));
  const locals=new Set(rows.map(x=>str(x.loc_id)));
  try{
    const metadata=await pool.query({
      text:`SELECT v.cfv_registerid AS id,v.cfd_id,
        COALESCE(NULLIF(ce.cev_description::text,''),NULLIF(v.cfv_externalvalue::text,''),NULLIF(v.cfv_internalvalue::text,''),'') AS valor
        FROM u45468.customfieldvalue v
        LEFT JOIN u45468.customentityvalue ce ON ce.cev_id=CASE
          WHEN v.cfv_internalvalue ~ '^[0-9]{1,18}$' THEN v.cfv_internalvalue::bigint ELSE NULL END
        WHERE v.cfv_registerid=ANY($1::bigint[]) AND v.cfd_id=ANY($2::bpchar[])`,
      values:[[...new Set([...tasks,...locals])],fields],query_timeout:2200
    });
    const tags=new Set((ids.tags||[]).map(str)),sectors=new Set((ids.setor||[]).map(str));
    const tmap=new Map(),lmap=new Map();
    for(const x of metadata.rows){
      const id=str(x.id),field=str(x.cfd_id),value=str(x.valor);
      if(tags.has(field)&&tasks.has(id)&&!tmap.has(id))tmap.set(id,value);
      if(sectors.has(field)&&locals.has(id)&&!lmap.has(id))lmap.set(id,value);
    }
    for(const x of rows){x.tags=tmap.get(str(x.tsk_id))||'';x.setor=lmap.get(str(x.loc_id))||'';}
  }catch(e){
    // Filtros por TAG/setor foram aplicados na SQL; apenas a exibicao e opcional.
    console.warn('[SS NOTAS] metadados da pagina:',e.message);
  }
  return {rows};
}
// Auditoria solicitada: compara a classificacao calculada com dbout_task
// SOMENTE das SS retornadas. Nao participa da consulta normal.
async function audit(pool,rows,tela){
  const test=rows.filter(x=>x&&x.tsk_id!=null);
  if(!test.length)return {ok:true,verificadas:0,divergentes:0,amostras:[]};
  const official=await pool.query({
    text:`SELECT tsk_id,tsk_situation,e_situacao,tsk_lastexecutiondatehour
           FROM u45468.dbout_task WHERE tsk_id=ANY($1::bigint[])`,
    values:[test.map(x=>str(x.tsk_id))],query_timeout:5000
  });
  const map=new Map(official.rows.map(x=>[str(x.tsk_id),x]));
  const mismatches=[];
  for(const x of test){
    const d=map.get(str(x.tsk_id));
    const actual=d&&((tela==='baixar')
      ? norm(d.tsk_situation)==='RETORNADA DE CAMPO'&&!str(d.e_situacao)&&!!d.tsk_lastexecutiondatehour
      : !!str(d.e_situacao));
    if(!actual)mismatches.push({ss:str(x.ss),tarefa:str(x.tsk_id)});
  }
  return {ok:mismatches.length===0,verificadas:test.length,divergentes:mismatches.length,amostras:mismatches.slice(0,8)};
}
module.exports={query,createStatement,audit};
