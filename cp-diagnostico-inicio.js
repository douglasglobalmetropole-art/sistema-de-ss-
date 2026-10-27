'use strict';
// DIAGNOSTICO CP V28: consulta temporaria e SOMENTE LEITURA.
// NAO define quais SS estao em execucao: apenas compara as fontes para validacao.
const crypto = require('node:crypto');

module.exports = function registerDiagnosticoInicio(app, pool) {
  app.post('/api/cp/diagnostico-inicio-v28', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    const secret = String(process.env.CP_DIAGNOSTICO_KEY || '');
    const supplied = String(req.get('X-CP-Diagnostico-Key') || '');
    // Se a chave nao foi configurada corretamente, a rota permanece desabilitada.
    if (secret.length < 24) return res.status(503).json({ok: false, error: 'Diagnostico nao habilitado. Configure CP_DIAGNOSTICO_KEY (minimo 24 caracteres) na Vercel.'});
    const real = Buffer.from(secret, 'utf8');
    const incoming = Buffer.from(supplied, 'utf8');
    if (real.length !== incoming.length || !crypto.timingSafeEqual(real, incoming)) {
      return res.status(403).json({ok: false, error: 'Acesso nao autorizado ao diagnostico.'});
    }
    const raw = req.body?.task_ids;
    if (!Array.isArray(raw) || raw.length < 1 || raw.length > 12) {
      return res.status(400).json({ok: false, error: 'Envie de 1 a 12 identificadores de tarefa.'});
    }
    const ids = [...new Set(raw.map(v => Number(v)))];
    if (!ids.length || ids.some(v => !Number.isSafeInteger(v) || v <= 0)) {
      return res.status(400).json({ok: false, error: 'IDs de tarefa invalidos.'});
    }
    const checks = [
      ['tarefa', {
        text: `SELECT tsk_id, tsk_realinitialdatehour, tsk_realfinaldatehour,
                      tsk_scheduleinitialdatehour, tsk_insertdatehour
               FROM u45468.task WHERE tsk_id=ANY($1::bigint[])`,
        values: [ids], query_timeout: 3200
      }],
      ['situacao', {
        text: `SELECT tsk_id, tsk_situation, tsk_realinitialdatehour,
                      tsk_realfinaldatehour, tsk_scheduleinitialdatehour,
                      tsk_lastexecutiondatehour
               FROM u45468.dbout_task WHERE tsk_id=ANY($1::bigint[])`,
        values: [ids], query_timeout: 3200
      }],
      ['historico', {
        // Busca registros historicos apenas das tarefas escolhidas.
        // Nao consulta nem devolve coordenadas ou dados pessoais.
        text: `SELECT h.tsk_id, h.hty_id, h.hty_initialdatehour, to_jsonb(h) AS campos
               FROM u45468.history h WHERE h.tsk_id=ANY($1::bigint[])
               ORDER BY h.hty_initialdatehour DESC NULLS LAST LIMIT 180`,
        values: [ids], query_timeout: 3800
      }],
      ['colunas', {
        text: `SELECT table_name, column_name, data_type
               FROM information_schema.columns
               WHERE table_schema='u45468'
                 AND table_name IN ('history','dbout_history_1650496_at_execucaoservico',
                                    'dbout_history_at_execucaoservicoeteeta')
               ORDER BY table_name, ordinal_position`,
        values: [], query_timeout: 2500
      }]
    ];
    const results = await Promise.all(checks.map(async ([name, query]) => {
      try { return [name, {ok: true, rows: (await pool.query(query)).rows}]; }
      catch (e) {
        // A mensagem tecnica e registrada no servidor, nunca exposta ao navegador.
        console.warn('Diagnostico CP V28 '+name+':', e.message);
        return [name, {ok: false, rows: [], motivo: /timeout|timed out|canceling statement/i.test(String(e.message || '')) ? 'timeout' : 'consulta indisponivel'}];
      }
    }));
    const parts = Object.fromEntries(results);
    const indexed = name => new Map(parts[name].rows.map(row => [String(row.tsk_id), row]));
    const tarefas = indexed('tarefa');
    const situacoes = indexed('situacao');
    const histories = new Map();
    for (const h of parts.historico.rows) {
      const id = String(h.tsk_id);
      if (!histories.has(id)) histories.set(id, []);
      const events = histories.get(id);
      if (events.length >= 12) continue;
      const rawFields = h.campos && typeof h.campos === 'object' ? h.campos : {};
      // Exibir apenas metadados e estados relevantes, nunca textos livres,
      // nomes, identificadores de pessoas, coordenadas, cookies ou tokens.
      const interesting = {};
      for (const [key, value] of Object.entries(rawFields)) {
        if (/^hty_(initialdatehour|finaldatehour|executiondatehour|situation|status|type|event|state)$/.test(key) &&
            value != null && ['string', 'number', 'boolean'].includes(typeof value)) {
          interesting[key] = String(value).slice(0, 90);
        }
      }
      events.push({hty_id: h.hty_id == null ? null : String(h.hty_id),
                   hty_initialdatehour: h.hty_initialdatehour || null,
                   outros_campos: interesting});
    }
    const resumo = ids.map(id => {
      const task = tarefas.get(String(id)) || {};
      const out = situacoes.get(String(id)) || {};
      const lista = histories.get(String(id)) || [];
      return {
        tsk_id: String(id),
        situacao_atual: out.tsk_situation ?? null,
        inicio_task: task.tsk_realinitialdatehour ?? null,
        inicio_dbout: out.tsk_realinitialdatehour ?? null,
        fim_task: task.tsk_realfinaldatehour ?? null,
        fim_dbout: out.tsk_realfinaldatehour ?? null,
        ultima_execucao: out.tsk_lastexecutiondatehour ?? null,
        programacao_task: task.tsk_scheduleinitialdatehour ?? null,
        historicos_amostrados: lista.length,
        historicos_com_hora: lista.filter(x => x.hty_initialdatehour).length,
        ultimo_historico: lista[0]?.hty_initialdatehour ?? null,
        eventos_amostrados: lista
      };
    });
    const colunasDe = name => parts.colunas.rows.filter(x => x.table_name === name).map(x => ({coluna: x.column_name, tipo: x.data_type}));
    return res.json({
      ok: true, somente_leitura: true,
      aviso: 'Historia de atividade ou ultima_execucao, isoladamente, nao comprovam inicio real de servico. Cobertura limitada aos IDs e eventos amostrados.',
      etapas: Object.fromEntries(results.map(([name, x]) => [name, x.ok ? 'ok' : x.motivo])),
      amostra: {quantidade_de_tarefas: ids.length, limite_historico_global: 180, limite_eventos_por_tarefa: 12},
      resumo,
      colunas_historico: colunasDe('history'),
      colunas_formularios: {
        execucao_servico: colunasDe('dbout_history_1650496_at_execucaoservico'),
        execucao_e_teeta: colunasDe('dbout_history_at_execucaoservicoeteeta')
      }
    });
  });
};
