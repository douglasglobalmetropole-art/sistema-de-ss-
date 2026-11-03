'use strict';
/**
 * GLOBAL SS / CP — pesquisa por colunas V4.
 * 1) Seleciona candidatos SOMENTE nas tabelas fisicas task/local.
 * 2) Le status e TAGs da view dbout_task por LOTES de IDs (sem JOIN global).
 * 3) Aplica classificacao oficial antes da paginacao; so depois enriquece a pagina.
 * Nao grava no uMov nem modifica as outras APIs do sistema.
 */
const TELAS = new Set(['recepcao','campo','baixar','encerradas','tramitacao']);
const CAMPOS = {
  recepcao: ['ss','equipe_executou','logradouro','bairro','cidade','setor','servico','tags','criado_em'],
  campo: ['ss','logradouro','bairro','cidade','setor','servico','tags','equipe_executou'],
  baixar: ['ss','logradouro','bairro','cidade','setor','servico','tags','equipe_executou','data_finalizacao'],
  encerradas: ['ss','logradouro','bairro','cidade','setor','servico','tags','equipe_executou','data_finalizacao','status_integracao','criado_em'],
  tramitacao: ['ss','logradouro','bairro','cidade','setor','servico','tags','equipe_executou','data_finalizacao','status_integracao','criado_em']
};
const C = new Map();
const str = x => String(x ?? '').trim();
const low = x => str(x).toLocaleLowerCase('pt-BR');
const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const fmt = v => v ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(v)).replace(',', '') : '';
const matches = (actual, term) => low(actual).includes(low(term));
function isInTab(d, tela) {
  const situacao = low(d?.tsk_situation);
  const integracao = str(d?.e_situacao);
  if (tela === 'recepcao') return situacao === 'pendente de envio para campo';
  if (tela === 'campo') return situacao === 'em campo';
  if (tela === 'baixar') return situacao === 'retornada de campo' && !integracao && !!d?.tsk_lastexecutiondatehour;
  if (tela === 'encerradas') return !!integracao;
  if (tela === 'tramitacao') return low(integracao).startsWith('baixad');
  return false;
}
function createQuery(req, tela, limit, offset) {
  const values = [], predicates = [];
  const push = (expr, value) => { values.push(value); predicates.push(expr.replace(/\?/g, '$' + values.length)); };
  const fields = Object.fromEntries(CAMPOS[tela].map(k => [k, str(req.query[k]).slice(0, 100)]).filter(([, v]) => v));
  // A pesquisa pelo numero da SS ignora datas, como na interface original.
  const ini = str(req.query.inicio), fim = str(req.query.fim);
  if (!fields.ss && dateRe.test(ini) && dateRe.test(fim)) {
    const coluna = tela === 'recepcao' ? 't.tsk_insertdatehour' : 't.tsk_lastexecutiondatehour';
    push(`${coluna} >= ?::date`, ini);
    push(`${coluna} < (?::date + INTERVAL '1 day')`, fim);
  }
  // Restricoes fisicas: dbout_task sera consultada depois por ID.
  if (tela === 'recepcao') predicates.push("LOWER(TRIM(COALESCE(t.tsk_situation,'')))='pendente de envio para campo'");
  if (tela === 'campo') predicates.push("LOWER(TRIM(COALESCE(t.tsk_situation,'')))='em campo'");
  if (tela === 'baixar') predicates.push("LOWER(TRIM(COALESCE(t.tsk_situation,'')))='retornada de campo'");
  for (const [k, s] of Object.entries(fields)) {
    const v = '%' + s + '%';
    if (k === 'ss') push('l.loc_integrationid ILIKE ?', v);
    else if (k === 'logradouro') push('(l.loc_street ILIKE ? OR EXISTS (SELECT 1 FROM u45468.dbout_local dx WHERE dx.loc_id=l.loc_id AND dx.loc_street ILIKE ?))', v);
    else if (k === 'bairro') push('(l.loc_neighborhood ILIKE ? OR EXISTS (SELECT 1 FROM u45468.dbout_local dx WHERE dx.loc_id=l.loc_id AND dx.e_bairro ILIKE ?))', v);
    else if (k === 'cidade') push('(l.loc_city ILIKE ? OR EXISTS (SELECT 1 FROM u45468.dbout_local dx WHERE dx.loc_id=l.loc_id AND dx.e_localidade ILIKE ?))', v);
    else if (k === 'setor') push('EXISTS (SELECT 1 FROM u45468.dbout_local dx WHERE dx.loc_id=l.loc_id AND dx.e_setor ILIKE ?)', v);
    else if (k === 'servico') push('EXISTS (SELECT 1 FROM u45468.tasktype tx WHERE tx.tty_id=t.tty_id AND tx.tty_description ILIKE ?)', v);
    else if (k === 'equipe_executou') push('EXISTS (SELECT 1 FROM u45468.agent ax WHERE ax.age_id=t.age_id AND ax.age_name ILIKE ?)', v);
    else if (k === 'data_finalizacao') push("(TO_CHAR(t.tsk_realinitialdatehour,'DD/MM/YYYY HH24:MI') ILIKE ? OR TO_CHAR(t.tsk_realfinaldatehour,'DD/MM/YYYY HH24:MI') ILIKE ? OR TO_CHAR(t.tsk_lastexecutiondatehour,'DD/MM/YYYY HH24:MI') ILIKE ?)", v);
    else if (k === 'criado_em') push(tela === 'recepcao' ? "TO_CHAR(t.tsk_insertdatehour,'DD/MM/YYYY HH24:MI') ILIKE ?" : "TO_CHAR(t.tsk_realinitialdatehour,'DD/MM/YYYY HH24:MI') ILIKE ?", v);
    // TAG e status de integracao so podem ser avaliados apos buscar dbout_task dos IDs.
  }
  const macros = str(req.query.macro).split('\u001f').map(x => x.trim()).filter(Boolean);
  const cidades = str(req.query.municipios || req.query.cidade).split('\u001f').map(x => x.trim().toUpperCase()).filter(Boolean);
  const equipeSuperior = str(req.query.equipe).slice(0, 100);
  if (macros.length) push('EXISTS (SELECT 1 FROM u45468.tasktype mt WHERE mt.tty_id=t.tty_id AND TRIM(mt.tty_description)=ANY(?::text[]))', macros);
  if (cidades.length) push('(UPPER(TRIM(l.loc_city))=ANY(?::text[]) OR EXISTS (SELECT 1 FROM u45468.dbout_local dc WHERE dc.loc_id=l.loc_id AND UPPER(TRIM(dc.e_localidade))=ANY(?::text[])))', cidades);
  if (equipeSuperior) push('EXISTS (SELECT 1 FROM u45468.agent ae WHERE ae.age_id=t.age_id AND ae.age_name ILIKE ?)', '%' + equipeSuperior + '%');
  const order = tela === 'recepcao' ? 't.tsk_insertdatehour' : 't.tsk_lastexecutiondatehour';
  const sql = `SELECT t.tsk_id,t.loc_id,t.age_id,t.tty_id,t.tsk_insertdatehour,t.tsk_lastexecutiondatehour,t.tsk_situation,
    l.loc_integrationid AS ss,l.loc_city AS cidade_base,l.loc_neighborhood AS bairro_base,
    l.loc_street AS logradouro_base,l.loc_streetnumber AS numero_base
    FROM u45468.task t JOIN u45468.local l ON l.loc_id=t.loc_id
    ${predicates.length ? 'WHERE ' + predicates.join(' AND ') : ''}
    ORDER BY ${order} DESC NULLS LAST,t.tsk_id DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;
  return {sql, values, fields};
}
// O caractere ? eh repetido para os tres filtros de data ou os dois de endereco.
// Converte cada ? na MESMA referencia de parametro dentro de um predicado.
async function handler(req, res, dep) {
  const started = Date.now();
  const tela = str(req.query.tela || 'recepcao');
  if (!TELAS.has(tela)) return res.status(400).json({ok:false,error:'Aba inválida'});
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
  const offset = Math.min(100000, Math.max(0, Number(req.query.offset) || 0));
  const key = req.originalUrl || req.url || '';
  const hit = !req.query._refresh && C.get(key);
  if (hit && started - hit.ts < 45000) {
    res.set('X-Cache', 'HIT'); res.set('X-CP-Search-Plan', 'fisica-lotes-v4/cache');
    return res.json({...hit.data,ms:Date.now()-started,tempos:{banco_ms:0,detalhes_ms:0,cache:true}});
  }
  const {pool, extrasLocal, extrasTask, campo, hostRelatorioUmov} = dep;
  const {sql, values, fields} = createQuery(req, tela, limit, offset);
  const selected = [], chunk = 200, maxCandidatos = 30000, maxMs = 13500;
  let scanned = 0, matched = 0, reachedEnd = false, msBanco = 0;
  try {
    while (selected.length < limit + 1 && scanned < maxCandidatos) {
      if (Date.now() - started > maxMs) throw new Error('Pesquisa ampla excedeu o tempo seguro; reduza o período ou utilize mais filtros.');
      const t0 = Date.now();
      const candidates = await pool.query({text: sql, values: [...values, chunk, scanned], query_timeout: 6000});
      msBanco += Date.now() - t0;
      if (!candidates.rows.length) {reachedEnd = true;break;}
      scanned += candidates.rows.length;
      const ids = candidates.rows.map(r => r.tsk_id);
      const t1 = Date.now();
      const classification = await pool.query({
        text: `SELECT tsk_id,tsk_situation,e_situacao,e_tag,tsk_lastexecutiondatehour,
            tsk_realinitialdatehour,tsk_realfinaldatehour
            FROM u45468.dbout_task WHERE tsk_id=ANY($1::bigint[])`,
        values: [ids], query_timeout: 6000
      });
      msBanco += Date.now() - t1;
      const byId = new Map(classification.rows.map(d => [String(d.tsk_id), d]));
      for (const x of candidates.rows) {
        const d = byId.get(String(x.tsk_id));
        if (!d || !isInTab(d, tela)) continue;
        if (fields.tags && !matches(d.e_tag, fields.tags)) continue;
        if (fields.status_integracao && !matches(d.e_situacao, fields.status_integracao)) continue;
        if (matched++ >= offset) selected.push({...x, ...{
          situacao_campo:d.tsk_situation,status_integracao:d.e_situacao,
          tags:d.e_tag,ultimo_raw:d.tsk_lastexecutiondatehour,
          inicio_raw:d.tsk_realinitialdatehour,fim_raw:d.tsk_realfinaldatehour
        }});
        if (selected.length > limit) break;
      }
      if (candidates.rows.length < chunk) {reachedEnd = true;break;}
    }
    if (selected.length <= limit && !reachedEnd) {
      // NUNCA declarar "fim" ao atingir o limite artificial de varredura.
      throw new Error('A pesquisa ultrapassou o limite de candidatos; restrinja os filtros para uma paginação correta.');
    }
    const items = selected.slice(0, limit);
    const tExtras = Date.now();
    const [locals, tasks, agents, types] = await Promise.all([
      extrasLocal(items.map(x => x.loc_id)), extrasTask(items.map(x => x.tsk_id)),
      pool.query({text:'SELECT age_id,age_name FROM u45468.agent WHERE age_id=ANY($1::bigint[])',values:[items.map(x=>x.age_id).filter(Boolean)],query_timeout:5000}),
      pool.query({text:'SELECT tty_id,tty_description FROM u45468.tasktype WHERE tty_id=ANY($1::bigint[])',values:[items.map(x=>x.tty_id).filter(Boolean)],query_timeout:5000})
    ]);
    const msExtras = Date.now() - tExtras;
    const agentMap = new Map(agents.rows.map(x => [String(x.age_id),x.age_name]));
    const typeMap = new Map(types.rows.map(x => [String(x.tty_id),x.tty_description]));
    const rows = items.map(x => {
      const l = locals.get(String(x.loc_id)) || {}, t = tasks.get(String(x.tsk_id)) || {};
      const status = x.status_integracao || '';
      const ultimo = t.ultima_atividade_raw || x.ultimo_raw;
      const inicio = t.inicio_atividade_raw || x.inicio_raw;
      const fim = t.fim_real_raw || x.fim_raw;
      const token = t.tsk_accesstoken;
      const host = hostRelatorioUmov();
      const link = host && Number(t.tss_id) === 50 && token
        ? `https://${host}/CenterWeb/report/schedule/${x.tsk_id}/${encodeURIComponent(token)}` : '';
      return {
        ss:x.ss||l.ss||'',tarefa:x.tsk_id,local:x.loc_id,
        cidade:l.cidade||x.cidade_base||'',bairro:l.bairro||x.bairro_base||'',
        setor:l.setor||'',logradouro:l.logradouro||x.logradouro_base||'',
        numero:l.numero||x.numero_base||'',servico:typeMap.get(String(x.tty_id))||'',
        tecnico:agentMap.get(String(x.age_id))||'',equipe_executou:agentMap.get(String(x.age_id))||'',
        tags:x.tags||t.tags||'',situacao_campo:x.situacao_campo||'',status_integracao:status,
        tss_id:t.tss_id||'',hidrometro:l.hidrometro||'',referencia_localizacao:l.referencia_localizacao||'',
        informacao_solicitante:l.informacao_solicitante||'',esclarecimento_solicitante:l.esclarecimento_solicitante||'',
        servico_executado:l.informacao_bombeiro||l.servico_executado||'',
        materiais_bombeiro:campo(l,'e_material','e_materialusado')||'',
        inicio_atividade:fmt(inicio),fim_atividade:fmt(fim),fim_real:fmt(fim),
        ultima_atividade:fmt(ultimo),data_finalizacao:fmt(ultimo),
        periodo_execucao:[fmt(inicio),fmt(fim||ultimo)].filter(Boolean).join(' – '),
        criado_em:fmt(x.tsk_insertdatehour),link
      };
    });
    const data = {ok:true,rows,total:null,count:rows.length,limit,offset,
      hasMore:selected.length>limit,ms:Date.now()-started,
      tempos:{banco_ms:msBanco,detalhes_ms:msExtras,candidatos:scanned},plano:'fisica-lotes-v4'};
    if (C.size > 100) C.clear();
    C.set(key,{ts:Date.now(),data});
    res.set('X-Cache','MISS');res.set('X-CP-Search-Plan','fisica-lotes-v4');
    res.set('Server-Timing',`banco;dur=${msBanco},detalhes;dur=${msExtras}`);
    return res.json(data);
  } catch (e) {
    console.error('[CP pesquisa V4]', e.message);
    const timeout = /timeout|timed out|canceling statement|tempo seguro|limite de candidatos/i.test(e.message);
    return res.status(timeout?504:500).json({ok:false,error:e.message,plano:'fisica-lotes-v4'});
  }
}
module.exports = {handler,createQuery,isInTab};
