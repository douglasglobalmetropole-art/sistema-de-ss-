'use strict';
/**
 * Notas para Baixar das divisoes: filtro municipal ANTES da paginacao,
 * situacao/status oficiais do dbout_task somente para candidatos recentes.
 * Em vez de varrer toda a view, faz leituras de IDs em blocos pequenos.
 * Nao realiza escrita em uMov nem SISCOM.
 */
const str = v => String(v ?? '').trim();
const norm = v => str(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
const like = (v,term) => str(v).toLocaleLowerCase('pt-BR').includes(str(term).toLocaleLowerCase('pt-BR'));
const isoDate = s => /^\d{4}-\d{2}-\d{2}$/.test(str(s));
const formatDate = v => v ? new Intl.DateTimeFormat('pt-BR', {
  timeZone:'UTC', day:'2-digit', month:'2-digit', year:'numeric',
  hour:'2-digit', minute:'2-digit', hour12:false
}).format(new Date(v)).replace(',', '') : '';

async function fields(pool, list, ids) {
  const tags = new Map(), setor = new Map();
  const fields = [...new Set([...(ids.tags||[]), ...(ids.setor||[])].map(str).filter(Boolean))];
  if (!fields.length || !list.length) return {tags,setor};
  const tasks = new Set(list.map(x=>str(x.tsk_id)));
  const locals = new Set(list.map(x=>str(x.loc_id)));
  const registers = [...new Set([...tasks,...locals])];
  const q = await pool.query({
    text:`SELECT v.cfv_registerid AS id,v.cfd_id,
       COALESCE(NULLIF(ce.cev_description::text,''),
                NULLIF(v.cfv_externalvalue::text,''),
                NULLIF(v.cfv_internalvalue::text,''),'') AS valor
      FROM u45468.customfieldvalue v
      LEFT JOIN u45468.customentityvalue ce ON ce.cev_id=CASE
        WHEN v.cfv_internalvalue ~ '^[0-9]{1,18}$'
        THEN v.cfv_internalvalue::bigint ELSE NULL END
      WHERE v.cfv_registerid=ANY($1::bigint[])
        AND v.cfd_id=ANY($2::bpchar[])`,
    values:[registers,fields], query_timeout:3500
  });
  const tagIds = new Set((ids.tags||[]).map(str));
  const setorIds = new Set((ids.setor||[]).map(str));
  for (const x of q.rows) {
    const id=str(x.id), field=str(x.cfd_id), value=str(x.valor);
    if (tasks.has(id) && tagIds.has(field) && !tags.has(id)) tags.set(id,value);
    if (locals.has(id) && setorIds.has(field) && !setor.has(id)) setor.set(id,value);
  }
  return {tags,setor};
}

async function query(pool, params, ids) {
  if (params.tela !== 'baixar' || !params.municipios?.length) {
    throw Error('Consulta rapida permitida somente para Notas para Baixar de divisao configurada.');
  }
  const {filters={}, municipios, macro=[], equipe='', inicio='', fim='', limit=25, offset=0} = params;
  const valores=[];
  const add=x=>{valores.push(x);return '$'+valores.length};
  const where=[
    't.tsk_lastexecutiondatehour IS NOT NULL',
    "LOWER(TRIM(COALESCE(t.tsk_situation,'')))='retornada de campo'"
  ];
  // Restricao de municipio aplicada diretamente na tabela fisica ANTES de qualquer LIMIT.
  where.push(`translate(UPPER(TRIM(l.loc_city)),
    'ÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛÇ','AAAAEEEIIIOOOOUUUC')=ANY(${add(municipios.map(norm))}::text[])`);
  if (isoDate(inicio) && isoDate(fim)) {
    where.push(`t.tsk_lastexecutiondatehour >= ${add(inicio)}::date`);
    where.push(`t.tsk_lastexecutiondatehour < (${add(fim)}::date + INTERVAL '1 day')`);
  }
  const addLike=(expr,value)=>{if(str(value))where.push(`${expr} ILIKE ${add('%'+str(value)+'%')}`)};
  addLike('l.loc_integrationid',filters.ss);
  addLike('l.loc_street',filters.logradouro);
  addLike('l.loc_neighborhood',filters.bairro);
  addLike('l.loc_city',filters.cidade);
  addLike('tt.tty_description',filters.servico);
  addLike('a.age_name',filters.equipe_executou);
  addLike('a.age_name',equipe);
  if (macro.length) where.push(`TRIM(tt.tty_description)=ANY(${add(macro)}::text[])`);
  if (str(filters.data_finalizacao)) {
    // A confirmacao do filtro de data oficial ocorre depois da leitura dos IDs.
    // Aqui nao aplicamos TO_CHAR sobre a tabela inteira.
  }
  const fixed=valores.length;
  const size=Math.min(150,Math.max(60,Math.min(100,limit)*3));
  const output=[];
  let accepted=0,finished=false,cursor=null,scanned=0;
  const started=Date.now();
  for(let batch=0;batch<90;batch++) {
    if (Date.now()-started>10500) throw Error('Consulta oficial excedeu tempo de seguranca. Refine o periodo de datas.');
    const args=valores.slice(0,fixed), cond=where.slice();
    if(cursor) {
      args.push(cursor.date,cursor.id);
      cond.push(`(t.tsk_lastexecutiondatehour,t.tsk_id) < ($${args.length-1}::timestamp,$${args.length}::bigint)`);
    }
    args.push(size);
    const sql=`SELECT t.tsk_id,t.loc_id,t.age_id,t.tty_id,t.tss_id,
       t.tsk_insertdatehour,t.tsk_lastexecutiondatehour,
       t.tsk_realinitialdatehour,t.tsk_realfinaldatehour,
       t.tsk_situation,(to_jsonb(t)->>'tsk_accesstoken') AS token,
       l.loc_integrationid AS ss,l.loc_city AS cidade,
       l.loc_neighborhood AS bairro,l.loc_street AS logradouro,
       l.loc_streetnumber AS numero,a.age_name AS tecnico,
       tt.tty_description AS servico,
       TO_CHAR(t.tsk_lastexecutiondatehour,'YYYY-MM-DD HH24:MI:SS.US') AS __cursor
       FROM u45468.task t
       JOIN u45468.local l ON l.loc_id=t.loc_id
       LEFT JOIN u45468.agent a ON a.age_id=t.age_id
       LEFT JOIN u45468.tasktype tt ON tt.tty_id=t.tty_id
       WHERE ${cond.join(' AND ')}
       ORDER BY t.tsk_lastexecutiondatehour DESC,t.tsk_id DESC
       LIMIT $${args.length}`;
    const candidates=(await pool.query({text:sql,values:args,query_timeout:4000})).rows;
    if(!candidates.length){finished=true;break}
    scanned+=candidates.length;
    const official=await pool.query({
      text:`SELECT tsk_id,tsk_situation,e_situacao,tsk_lastexecutiondatehour,
           tsk_realinitialdatehour,tsk_realfinaldatehour
         FROM u45468.dbout_task WHERE tsk_id=ANY($1::bigint[])`,
      values:[candidates.map(x=>str(x.tsk_id))], query_timeout:4000
    });
    const byId=new Map(official.rows.map(x=>[str(x.tsk_id),x]));
    let eligible=candidates.filter(x=>{
      const d=byId.get(str(x.tsk_id));
      return d && norm(d.tsk_situation)==='RETORNADA DE CAMPO' && !str(d.e_situacao)
        && d.tsk_lastexecutiondatehour != null;
    }).map(x=>{
      const d=byId.get(str(x.tsk_id));
      return {...x,tsk_situation:d.tsk_situation,status_integracao:'',
        tsk_lastexecutiondatehour:d.tsk_lastexecutiondatehour,
        tsk_realinitialdatehour:d.tsk_realinitialdatehour || x.tsk_realinitialdatehour,
        tsk_realfinaldatehour:d.tsk_realfinaldatehour || x.tsk_realfinaldatehour};
    });
    if (str(filters.data_finalizacao)) eligible=eligible.filter(x=>
      like(formatDate(x.tsk_lastexecutiondatehour),filters.data_finalizacao) ||
      like(formatDate(x.tsk_realfinaldatehour),filters.data_finalizacao));
    if (filters.tags || filters.setor) {
      const metadata=await fields(pool,eligible,ids);
      eligible=eligible.filter(x=>
        (!filters.tags || like(metadata.tags.get(str(x.tsk_id)),filters.tags)) &&
        (!filters.setor || like(metadata.setor.get(str(x.loc_id)),filters.setor))
      );
    }
    for(const x of eligible){
      if(accepted >= offset)output.push(x);
      accepted++;
      if(output.length > limit) break;
    }
    if(output.length > limit)break;
    const last=candidates[candidates.length-1];
    cursor={date:last.__cursor,id:str(last.tsk_id)};
    if(candidates.length < size){finished=true;break}
  }
  // Nao informar 'sem mais paginas' quando o limite de blocos foi alcancado.
  if(!finished&&output.length<=limit)throw Error(
    `Pesquisa limitada por seguranca apos ${scanned} candidatos. Refine o periodo para continuar.`);
  const pagina=output.slice(0,limit+1);
  const metadata=await fields(pool,pagina,ids);
  for(const row of pagina){
    row.tags=metadata.tags.get(str(row.tsk_id))||'';
    row.setor=metadata.setor.get(str(row.loc_id))||'';
    delete row.__cursor;
  }
  return {rows:pagina};
}
module.exports={query};
