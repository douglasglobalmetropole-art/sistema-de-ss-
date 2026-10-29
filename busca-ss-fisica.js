'use strict';
/* Global SS: pesquisa pontual de SS por tabelas fisicas do uMov.
 * Lê um número exato (ou prefixo curto), sem filtro de data e sem escrever no uMov.
 * Complementa somente os registros encontrados; não varre as views globais. */
const ABAS = new Set(['recepcao', 'campo', 'baixar', 'encerradas', 'tramitacao']);
const EXATA = /^\d{2}\/\d{2}-\d{6}-\d{2}$/;
const texto = v => String(v ?? '').trim();
const norm = v => texto(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const fmt = v => v ? new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hour12: false
}).format(new Date(v)).replace(',', '') : '';
function pertence(x, tela) {
  const situacao = norm(x.situacao_campo), integracao = norm(x.status_integracao);
  if (tela === 'recepcao') return situacao === 'pendente de envio para campo';
  if (tela === 'campo') return situacao === 'em campo';
  if (tela === 'baixar') return situacao === 'retornada de campo' && !integracao && !!x.ultima_atividade;
  if (tela === 'encerradas') return !!integracao;
  if (tela === 'tramitacao') return integracao.startsWith('baixad');
  return false;
}
async function consultar(pool, ss, limite, tela, hostRelatorioUmov) {
  const exata = EXATA.test(ss);
  const q = await pool.query({
    text: `WITH locais AS MATERIALIZED (
      SELECT loc_id, loc_integrationid, loc_city, loc_neighborhood,
        loc_street, loc_streetnumber, loc_streetnumbercompl
      FROM u45468.local
      WHERE loc_integrationid ${exata ? '= $1' : 'LIKE $1'}
      ORDER BY loc_id DESC LIMIT $2
    )
    SELECT l.loc_id, l.loc_integrationid AS ss, l.loc_city AS cidade,
      l.loc_neighborhood AS bairro, l.loc_street AS logradouro,
      l.loc_streetnumber AS numero, l.loc_streetnumbercompl AS complemento,
      t.tsk_id, t.tss_id, t.tsk_situation, t.tsk_insertdatehour,
      t.tsk_realinitialdatehour, t.tsk_realfinaldatehour,
      t.tsk_lastexecutiondatehour, to_jsonb(t)->>'tsk_accesstoken' AS token,
      a.age_name AS equipe, tt.tty_description AS servico
    FROM locais l
    JOIN LATERAL (
      SELECT * FROM u45468.task t0 WHERE t0.loc_id = l.loc_id
      ORDER BY t0.tsk_id DESC LIMIT 1
    ) t ON TRUE
    LEFT JOIN u45468.agent a ON a.age_id=t.age_id
    LEFT JOIN u45468.tasktype tt ON tt.tty_id=t.tty_id
    ORDER BY l.loc_id DESC LIMIT $2`,
    values: [exata ? ss : ss + '%', limite], query_timeout: 8500
  });
  const registros = q.rows;
  if (!registros.length) return [];
  const ids = [...new Set(registros.flatMap(r => [r.loc_id, r.tsk_id]).filter(Boolean).map(String))];
  const fields = await pool.query({
    text: `SELECT v.cfv_registerid AS registro, f.cfd_table AS tabela,
      f.cfd_integrationid AS campo, v.cfv_internalvalue AS interno,
      v.cfv_externalvalue AS externo, ce.cev_description AS descricao
    FROM u45468.customfieldvalue v
    JOIN u45468.customfield f ON f.cfd_id=v.cfd_id
    LEFT JOIN u45468.customentityvalue ce
      ON ce.cev_id = CASE WHEN f.cfd_integrationid IN ('setor','situacao')
        AND v.cfv_internalvalue ~ '^[0-9]{1,18}$'
        THEN v.cfv_internalvalue::bigint ELSE NULL END
    WHERE v.cfv_registerid=ANY($1::bigint[])
      AND f.cfd_table IN ('local','task')
      AND f.cfd_integrationid IN (
        'setor','tag','situacao','hidrometro','reflocalizacao',
        'informacaosolicitante','esclarecimentosolicitante')`,
    values: [ids], query_timeout: 6500
  });
  const extrasPorRegistro = new Map();
  for (const v of fields.rows) {
    const k = v.tabela + ':' + v.registro;
    if (!extrasPorRegistro.has(k)) extrasPorRegistro.set(k, {});
    extrasPorRegistro.get(k)[String(v.campo).toLowerCase()] = {
      interno: texto(v.interno), externo: texto(v.externo), descricao: texto(v.descricao)
    };
  }
  const extrasTask = new Map();
  const statusObrigatorio = tela === 'baixar' || tela === 'encerradas' || tela === 'tramitacao';
  if (statusObrigatorio) try {
    // Essa view é consultada somente por IDs conhecidos, sem JOIN/varredura de SS.
    const d = await pool.query({
      text: `SELECT tsk_id,e_situacao,e_tag,tss_id,tsk_accesstoken
       FROM u45468.dbout_task WHERE tsk_id=ANY($1::bigint[])`,
      values: [registros.map(r => String(r.tsk_id))], query_timeout: 4500
    });
    for (const v of d.rows) extrasTask.set(String(v.tsk_id), v);
  } catch (e) {
    throw Error('Não foi possível confirmar o status de integração da SS nesta aba.');
  }
  const host = typeof hostRelatorioUmov === 'function' ? String(hostRelatorioUmov() || '') : '';
  const hostValido = /^[a-z\d.-]+$/i.test(host) ? host : '';
  return registros.map(r => {
    const local = extrasPorRegistro.get('local:' + r.loc_id) || {};
    const tarefa = extrasPorRegistro.get('task:' + r.tsk_id) || {};
    const extra = extrasTask.get(String(r.tsk_id)) || {};
    const apresentar = v => v?.descricao || v?.externo || v?.interno || '';
    const inicio = fmt(r.tsk_realinitialdatehour);
    const fim = fmt(r.tsk_realfinaldatehour);
    const ultima = fmt(r.tsk_lastexecutiondatehour);
    const token = texto(extra.tsk_accesstoken || r.token);
    const tssId = extra.tss_id || r.tss_id;
    const link = hostValido && Number(tssId) === 50 && token
      ? `https://${hostValido}/CenterWeb/report/schedule/${r.tsk_id}/${encodeURIComponent(token)}` : '';
    return {
      ss: r.ss, tarefa: r.tsk_id, local: r.loc_id,
      cidade: r.cidade || '', bairro: r.bairro || '',
      logradouro: r.logradouro || '', numero: r.numero || '', complemento: r.complemento || '',
      setor: apresentar(local.setor), servico: r.servico || '',
      tecnico: r.equipe || '', equipe_executou: r.equipe || '',
      tags: texto(extra.e_tag) || apresentar(tarefa.tag),
      situacao_campo: r.tsk_situation || '',
      status_integracao: texto(extra.e_situacao) || apresentar(tarefa.situacao),
      hidrometro: local.hidrometro?.interno || '',
      referencia_localizacao: apresentar(local.reflocalizacao),
      informacao_solicitante: apresentar(local.informacaosolicitante),
      esclarecimento_solicitante: apresentar(local.esclarecimentosolicitante),
      inicio_atividade: inicio, fim_atividade: fim, fim_real: fim,
      ultima_atividade: ultima, data_finalizacao: fim || ultima,
      periodo_execucao: [inicio, fim || ultima].filter(Boolean).join(' – '),
      criado_em: fmt(r.tsk_insertdatehour), tss_id: tssId || '', link
    };
  });
}
function registrar(app, { pool, hostRelatorioUmov }) {
  app.get('/api/localizar-ss-rapida', async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    // Não ampliar o escopo do contrato do Lote 1 nesta atualização.
    if (req.originalUrl.startsWith('/lote1/'))
      return res.status(403).json({ ok: false, error: 'Consulta indisponível para o Lote 1.' });
    const ss = texto(req.query.ss).slice(0, 40);
    const tela = texto(req.query.tela || 'recepcao');
    if (!ABAS.has(tela)) return res.status(400).json({ ok: false, error: 'Aba inválida.' });
    if (ss.length < 4 || !/^\d{2}\/\d{1,2}(?:-\d{0,6}(?:-\d{0,2})?)?$/.test(ss))
      return res.status(400).json({ ok: false, error: 'Digite pelo menos quatro caracteres válidos da SS.' });
    const limite = Math.min(30, Math.max(1, Number(req.query.limit) || 25));
    const inicio = Date.now();
    try {
      const todos = await consultar(pool, ss, limite, tela, hostRelatorioUmov);
      const rows = todos.filter(x => pertence(x, tela));
      res.json({ ok: true, rows, count: rows.length, total: rows.length, hasMore: false,
        encontrados_fora_da_aba: todos.length - rows.length, ms: Date.now() - inicio,
        fonte: 'tabelas_fisicas', datas_ignoradas: true,
        aviso: !EXATA.test(ss) && todos.length >= limite
          ? 'Pesquisa parcial limitada: digite o número completo para confirmar.' : null });
    } catch (e) {
      console.error('[busca-ss-fisica]', e.message);
      res.status(503).json({ ok: false,
        error: 'Não foi possível completar a busca por SS. Confira a conexão e o status do uMov.' });
    }
  });
}
module.exports = { registrar, pertence, consultar };
