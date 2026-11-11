'use strict';
// Mesma classificacao oficial do /api/recepcao original, com filtro municipal
// aplicado ANTES de LIMIT/OFFSET. Uma consulta SQL, sem loop de 70 lotes.
const str = x => String(x ?? '').trim();
const norm = x => str(x).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
const isoDate = x => /^\d{4}-\d{2}-\d{2}$/.test(str(x));
async function query(pool,params,ids){
 const {tela,filters={},municipios=[],macro=[],equipe='',inicio='',fim='',limit=25,offset=0}=params;
 if(!['baixar','encerradas'].includes(tela)||!municipios.length)throw Error('Consulta exige aba e municipios da divisao.');
 const vals=[],add=x=>{vals.push(x);return '$'+vals.length};
 const where=[];
 // Filtrar na tabela local antes da paginacao. Mantem a protecao do servidor.
 const city=add(municipios.map(norm));
 where.push(`translate(UPPER(TRIM(l.loc_city)),'ÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛÇ','AAAAEEEIIIOOOOUUUC')=ANY(${city}::text[])`);
 if(tela==='baixar')where.push("LOWER(TRIM(COALESCE(d.tsk_situation,'')))='retornada de campo'","NULLIF(TRIM(COALESCE(d.e_situacao,'')),'') IS NULL",'d.tsk_lastexecutiondatehour IS NOT NULL');
 else where.push("NULLIF(TRIM(COALESCE(d.e_situacao,'')),'') IS NOT NULL");
 if(isoDate(inicio))where.push(`d.tsk_lastexecutiondatehour >= ${add(inicio)}::date`);
 if(isoDate(fim))where.push(`d.tsk_lastexecutiondatehour < (${add(fim)}::date + INTERVAL '1 day')`);
 const like=(expr,v)=>{if(str(v))where.push(`${expr} ILIKE ${add('%'+str(v)+'%')}`)};
 like('l.loc_integrationid',filters.ss);
 like('l.loc_street',filters.logradouro);
 like('l.loc_neighborhood',filters.bairro);
 like('l.loc_city',filters.cidade);
 like('tt.tty_description',filters.servico);
 like('a.age_name',filters.equipe_executou);
 like('a.age_name',equipe);
 like("TO_CHAR(t.tsk_insertdatehour,'DD/MM/YYYY HH24:MI')",filters.criado_em);
 if(macro.length)where.push(`TRIM(tt.tty_description)=ANY(${add(macro)}::text[])`);
 if(str(filters.data_finalizacao)){
  const p=add('%'+filters.data_finalizacao+'%');
  where.push(`(TO_CHAR(d.tsk_lastexecutiondatehour,'DD/MM/YYYY HH24:MI') ILIKE ${p} OR TO_CHAR(t.tsk_realfinaldatehour,'DD/MM/YYYY HH24:MI') ILIKE ${p})`);
 }
 like('d.e_situacao',filters.status_integracao);
 const fieldExpr=(register,idsForField)=>{
  if(!idsForField?.length)return "''";
  const p=add(idsForField);
  return `(SELECT COALESCE(NULLIF(ce.cev_description::text,''),NULLIF(v.cfv_externalvalue::text,''),NULLIF(v.cfv_internalvalue::text,''),'') FROM u45468.customfieldvalue v LEFT JOIN u45468.customentityvalue ce ON ce.cev_id=CASE WHEN v.cfv_internalvalue ~ '^[0-9]{1,18}$' THEN v.cfv_internalvalue::bigint ELSE NULL END WHERE v.cfv_registerid=${register} AND v.cfd_id=ANY(${p}::bpchar[]) LIMIT 1)`;
 };
 // Criar parametros de campos personalizados somente quando usados no SQL.
 // Caso contrario, o PostgreSQL recebe $2/$3 sem tipo definido (42P18).
 if(str(filters.tags)){
  const tagsExpr=fieldExpr('t.tsk_id',ids.tags);
  where.push(`${tagsExpr} ILIKE ${add('%'+filters.tags+'%')}`);
 }
 if(str(filters.setor)){
  const setorExpr=fieldExpr('l.loc_id',ids.setor);
  where.push(`${setorExpr} ILIKE ${add('%'+filters.setor+'%')}`);
 }
 const lp=add(Math.min(100,Math.max(1,Number(limit)||25))+1),op=add(Math.max(0,Number(offset)||0));
 // Replica o SQL original: dbout_task classifica; a ordenacao/limite
 // acontecem ANTES do enriquecimento de TAG e setor.
 const sql=`WITH pagina AS MATERIALIZED (
  SELECT t.tsk_id,t.loc_id,t.age_id,t.tty_id,t.tss_id,t.tsk_insertdatehour,
   d.tsk_lastexecutiondatehour,t.tsk_realinitialdatehour,t.tsk_realfinaldatehour,
   d.tsk_situation,COALESCE(d.e_situacao,'') AS status_integracao,
   (to_jsonb(t)->>'tsk_accesstoken') AS token,
   l.loc_integrationid AS ss,l.loc_city AS cidade,l.loc_neighborhood AS bairro,
   l.loc_street AS logradouro,l.loc_streetnumber AS numero,
   a.age_name AS tecnico,tt.tty_description AS servico
  FROM u45468.task t
  JOIN u45468.dbout_task d ON d.tsk_id=t.tsk_id
  JOIN u45468.local l ON l.loc_id=t.loc_id
  LEFT JOIN u45468.agent a ON a.age_id=t.age_id
  LEFT JOIN u45468.tasktype tt ON tt.tty_id=t.tty_id
  WHERE ${where.join(' AND ')}
  ORDER BY d.tsk_lastexecutiondatehour DESC NULLS LAST,t.tsk_id DESC
  LIMIT ${lp} OFFSET ${op}
 ) SELECT * FROM pagina ORDER BY tsk_lastexecutiondatehour DESC NULLS LAST,tsk_id DESC`;
 const result=await pool.query({text:sql,values:vals,query_timeout:8500});
 const rows=result.rows;
 if(rows.length){
  const taskIds=[...new Set(rows.map(r=>str(r.tsk_id)))],localIds=[...new Set(rows.map(r=>str(r.loc_id)))];
  const fieldIds=[...new Set([...(ids.tags||[]),...(ids.setor||[])].map(str))];
  if(fieldIds.length){
   try{
    const meta=await pool.query({text:`SELECT v.cfv_registerid AS id,v.cfd_id,COALESCE(NULLIF(ce.cev_description::text,''),NULLIF(v.cfv_externalvalue::text,''),NULLIF(v.cfv_internalvalue::text,''),'') AS valor FROM u45468.customfieldvalue v LEFT JOIN u45468.customentityvalue ce ON ce.cev_id=CASE WHEN v.cfv_internalvalue ~ '^[0-9]{1,18}$' THEN v.cfv_internalvalue::bigint ELSE NULL END WHERE v.cfv_registerid=ANY($1::bigint[]) AND v.cfd_id=ANY($2::bpchar[])`,values:[[...new Set([...taskIds,...localIds])],fieldIds],query_timeout:2500});
    const tags=new Set((ids.tags||[]).map(str)),setores=new Set((ids.setor||[]).map(str));
    const byTask=new Map(),byLocal=new Map();
    for(const m of meta.rows){const id=str(m.id),field=str(m.cfd_id);if(tags.has(field)&&taskIds.includes(id)&&!byTask.has(id))byTask.set(id,str(m.valor));if(setores.has(field)&&localIds.includes(id)&&!byLocal.has(id))byLocal.set(id,str(m.valor));}
    for(const r of rows){r.tags=byTask.get(str(r.tsk_id))||'';r.setor=byLocal.get(str(r.loc_id))||'';}
   }catch(e){if(filters.tags||filters.setor)throw e;console.warn('[SS] Metadados opcionais:',e.message)}
  }
 }
 return {rows};
}
module.exports={query};
