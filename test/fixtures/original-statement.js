// Referencia SQL recebida no ZIP, usada apenas para comparacao de resultados.
const isoDate=x=>/^\d{4}-\d{2}-\d{2}$/.test(String(x).trim());
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
     t.tsk_situation, (to_jsonb(t)->>'tsk_accesstoken') AS token,
     l.loc_integrationid AS ss,l.loc_city AS cidade,l.loc_neighborhood AS bairro,
     l.loc_street AS logradouro,l.loc_streetnumber AS numero,
     a.age_name AS tecnico,tt.tty_description AS servico
    FROM u45468.task t JOIN u45468.local l ON l.loc_id=t.loc_id
    LEFT JOIN u45468.agent a ON a.age_id=t.age_id
    LEFT JOIN u45468.tasktype tt ON tt.tty_id=t.tty_id
    ${base.length?'WHERE '+base.join(' AND '):''}`;
  // Somente Recepcao e Em Campo sem filtros de campos personalizados:
  // paginar primeiro e consultar status/TAG/setor apenas nas linhas da pagina.
  // Nos demais casos, os filtros de status/TAG/setor continuam ANTES do LIMIT.
  const paginaPrimeiro=(tela==='recepcao'||tela==='campo')&&final.length===0;
  const sql=paginaPrimeiro
   ? `WITH b AS MATERIALIZED (
       ${baseSql}
      ), pagina AS MATERIALIZED (
       SELECT * FROM b ORDER BY ${sort.replace('p.','b.')} DESC NULLS LAST,b.tsk_id DESC
       LIMIT ${limitParam} OFFSET ${offsetParam}
      ) SELECT p.*,${status.replaceAll('b.tsk_id','p.tsk_id').replaceAll('b.loc_id','p.loc_id')} AS status_integracao,
       ${tags.replaceAll('b.tsk_id','p.tsk_id').replaceAll('b.loc_id','p.loc_id')} AS tags,
       ${setor.replaceAll('b.tsk_id','p.tsk_id').replaceAll('b.loc_id','p.loc_id')} AS setor
       FROM pagina p ORDER BY ${sort} DESC NULLS LAST,p.tsk_id DESC`
   : `WITH b AS MATERIALIZED (
       ${baseSql}
      ), p AS MATERIALIZED (
       SELECT b.*,${status} AS status_integracao,${tags} AS tags,${setor} AS setor FROM b
      ) SELECT * FROM p ${final.length?'WHERE '+final.join(' AND '):''}
      ORDER BY ${sort} DESC NULLS LAST,p.tsk_id DESC LIMIT ${limitParam} OFFSET ${offsetParam}`;
 return {text:sql,values:val};
}

module.exports=statement;
