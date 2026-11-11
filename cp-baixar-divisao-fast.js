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
  const tela = params.tela;
  if (!['baixar','encerradas'].includes(tela) || !params.municipios?.length) {
    throw Error('Consulta oficial rapida exige aba e municipio de divisao configurada.');
  }
  const {filters={},municipios,macro=[],equipe='',inicio='',fim='',limit=25,offset=0}=params;
  const valores=[];
  const add=x=>{valores.push(x);return '$'+valores.length};
  const where=[];
  const addLike=(expr,value)=>{if(str(value))where.push(`${expr} ILIKE ${add('%'+str(value)+'%')}`)};
  // Restricao de municipio ocorre antes de LIMIT, inclusive no Lote 1.
  where.push(`translate(UPPER(TRIM(l.loc_city)),
    'ÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛÇ','AAAAEEEIIIOOOOUUUC')=ANY(${add(municipios.map(norm))}::text[])`);
  // A situacao fisica ajuda a localizar candidatas rapidamente; a confirmacao
  // da situacao e do status SOMENTE ocorre na visao oficial dbout_task.
  if(tela==='baixar')where.push("LOWER(TRIM(COALESCE(t.tsk_situation,'')))='retornada de campo'");
  const periodo=isoDate(inicio)&&isoDate(fim);
  if(periodo){
    where.push(`t.tsk_lastexecutiondatehour >= ${add(inicio)}::date`);
    where.push(`t.tsk_lastexecutiondatehour < (${add(fim)}::date + INTERVAL '1 day')`);
  }
  addLike('l.loc_integrationid',filters.ss);
  addLike('l.loc_street',filters.logradouro);
  addLike('l.loc_neighborhood',filters.bairro);
  addLike('l.loc_city',filters.cidade);
  addLike('tt.tty_description',filters.servico);
  addLike('a.age_name',filters.equipe_executou);
  addLike('a.age_name',equipe);
  if(macro.length)where.push(`TRIM(tt.tty_description)=ANY(${add(macro)}::text[])`);
  if(str(filters.criado_em))where.push(`TO_CHAR(t.tsk_insertdatehour,'DD/MM/YYYY HH24:MI') ILIKE ${add('%'+filters.criado_em+'%')}`);

  const fixed=valores.length;
  // Busca somente IDs candidatos recentes. Nao faz JOIN da dbout_task antes
  // de ordenar e limitar a pagina fisica de candidatos.
  const size=Math.min(100,Math.max(50,limit*2));
  const output=[];
  let accepted=0,exhausted=false,cursor=null,phase='dated',scanned=0;
  const includeNullPhase=tela==='encerradas'&&!periodo;
  const start=Date.now();
  for(let batch=0;batch<70;batch++){
    if(Date.now()-start>8500)throw Error('Consulta oficial excedeu o tempo seguro. Informe um periodo de datas para reduzir a busca.');
    const args=valores.slice(0,fixed),conditions=where.slice();
    conditions.push(phase==='dated'?'t.tsk_lastexecutiondatehour IS NOT NULL':'t.tsk_lastexecutiondatehour IS NULL');
    if(cursor){
      if(phase==='dated'){
        args.push(cursor.date,cursor.id);
        conditions.push(`(t.tsk_lastexecutiondatehour,t.tsk_id) < ($${args.length-1}::timestamp,$${args.length}::bigint)`);
      }else{
        args.push(cursor.id);
        conditions.push(`t.tsk_id < $${args.length}::bigint`);
      }
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
       WHERE ${conditions.join(' AND ')}
       ORDER BY t.tsk_lastexecutiondatehour DESC NULLS LAST,t.tsk_id DESC
       LIMIT $${args.length}`;
    const candidates=(await pool.query({text:sql,values:args,query_timeout:3800})).rows;
    if(!candidates.length){
      if(phase==='dated'&&includeNullPhase){phase='null';cursor=null;continue}
      exhausted=true;break;
    }
    scanned+=candidates.length;
    // As mesmas colunas oficiais consultadas na pagina principal (/).
    // Apenas os IDs da pagina candidata sao enviados a visao dbout_task.
    const official=await pool.query({
      text:`SELECT tsk_id,tsk_situation,e_situacao,tsk_lastexecutiondatehour,
             tsk_realinitialdatehour,tsk_realfinaldatehour
            FROM u45468.dbout_task WHERE tsk_id=ANY($1::bigint[])`,
      values:[candidates.map(x=>str(x.tsk_id))],query_timeout:3800
    });
    const byId=new Map(official.rows.map(x=>[str(x.tsk_id),x]));
    let eligible=candidates.filter(x=>{
      const d=byId.get(str(x.tsk_id));if(!d)return false;
      const status=str(d.e_situacao);
      return tela==='baixar'
        ? norm(d.tsk_situation)==='RETORNADA DE CAMPO'&&!status&&d.tsk_lastexecutiondatehour!=null
        : !!status;
    }).map(x=>{
      const d=byId.get(str(x.tsk_id));
      return {...x,tsk_situation:d.tsk_situation,status_integracao:str(d.e_situacao),
        tsk_lastexecutiondatehour:d.tsk_lastexecutiondatehour,
        tsk_realinitialdatehour:d.tsk_realinitialdatehour||x.tsk_realinitialdatehour,
        tsk_realfinaldatehour:d.tsk_realfinaldatehour||x.tsk_realfinaldatehour};
    });
    if(str(filters.status_integracao))eligible=eligible.filter(x=>like(x.status_integracao,filters.status_integracao));
    if(str(filters.data_finalizacao))eligible=eligible.filter(x=>
      like(formatDate(x.tsk_lastexecutiondatehour),filters.data_finalizacao)||
      like(formatDate(x.tsk_realfinaldatehour),filters.data_finalizacao));
    if(filters.tags||filters.setor){
      const metadata=await fields(pool,eligible,ids);
      eligible=eligible.filter(x=>(!filters.tags||like(metadata.tags.get(str(x.tsk_id)),filters.tags))&&
        (!filters.setor||like(metadata.setor.get(str(x.loc_id)),filters.setor)));
    }
    for(const x of eligible){
      if(accepted>=offset)output.push(x);
      accepted++;
      if(output.length>limit)break;
    }
    if(output.length>limit)break;
    const last=candidates[candidates.length-1];
    cursor={date:last.__cursor,id:str(last.tsk_id)};
    if(candidates.length<size){
      if(phase==='dated'&&includeNullPhase){phase='null';cursor=null;continue}
      exhausted=true;break;
    }
  }
  if(!exhausted&&output.length<=limit)throw Error(
    `Pesquisa oficial ainda nao concluiu apos ${scanned} candidatos. Use datas para refinar sem ocultar SS.`);
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
