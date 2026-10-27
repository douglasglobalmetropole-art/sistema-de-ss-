'use strict';

// V29D: indicadores isolados. Nao alteram /api/cp/ss, /api/cp/ativas,
// /api/cp/programadas-status, o mapa nem as consultas existentes.
module.exports = function registrarIndicadoresAdicionais(app, pool, { sbRequest }) {
  const normalizar = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase().replace(/\s+/g, ' ');
  const codigoEquipe = s => {
    const m = normalizar(s).match(/^(?:EQUIPE\s*)?(\d{2,4})(?!\d)/);
    return m ? m[1] : '';
  };
  const ehAtivo = s => normalizar(s) === 'ATIVO';
  const cache = new Map();
  const getCache = key => {
    const registro = cache.get(key);
    return registro && Date.now() - registro.at < 90000 ? registro.value : null;
  };
  const saveCache = (key, value) => {
    cache.set(key, {at: Date.now(), value});
    while (cache.size > 60) cache.delete(cache.keys().next().value);
  };
  const dataValida = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(new Date(value + 'T12:00:00').getTime()) &&
    new Date(value + 'T12:00:00').toISOString().slice(0, 10) === value;

  app.get('/api/cp/tempo-medio', async (req, res) => {
    const di = String(req.query.di || '');
    const df = String(req.query.df || '');
    if (!dataValida(di) || !dataValida(df) || di > df) {
      return res.status(400).json({ok: false, error: 'Datas invalidas (AAAA-MM-DD).'});
    }
    const key = `tempo:${di}:${df}`;
    const existente = getCache(key);
    if (existente) return res.json(existente);
    try {
      const consulta = await pool.query({
        text: `SELECT COUNT(*)::integer AS total_ss_finalizadas,
                 ROUND(AVG(EXTRACT(EPOCH FROM (tsk_realfinaldatehour - tsk_realinitialdatehour)) / 60)::numeric, 1) AS tempo_medio_minutos
               FROM u45468.dbout_task
               WHERE tsk_realfinaldatehour >= $1::date
                 AND tsk_realfinaldatehour < ($2::date + INTERVAL '1 day')
                 AND tsk_realinitialdatehour IS NOT NULL
                 AND tsk_realfinaldatehour > tsk_realinitialdatehour`,
        values: [di, df], query_timeout: 9000
      });
      const r = consulta.rows[0] || {};
      const total = Number(r.total_ss_finalizadas || 0);
      const media = r.tempo_medio_minutos == null ? null : Number(r.tempo_medio_minutos);
      const dados = {ok: true, total_ss_finalizadas: total, tempo_medio_minutos: Number.isFinite(media) ? media : null, di, df, fonte: 'dbout_task'};
      saveCache(key, dados);
      res.set('Cache-Control', 'no-store').json(dados);
    } catch (e) {
      console.warn('CP V29D - tempo medio:', e.message);
      res.status(/timeout|timed out|canceling statement/i.test(String(e.message)) ? 504 : 500)
        .json({ok: false, error: 'Nao foi possivel confirmar o tempo medio no uMov.'});
    }
  });

  app.get('/api/cp/equipes-sem-ss', async (_req, res) => {
    const existente = getCache('equipes');
    if (existente) return res.json(existente);
    try {
      // Cadastro de equipes com VEICULO ATIVO no Supabase (nao equivale a escala/presenca em servico).
      const frota = await sbRequest('frotas_veiculos?select=status,equipe_umov&limit=1000', {signal: AbortSignal.timeout(5000)});
      if (!Array.isArray(frota) || !frota.length) {
        return res.json({ok: false, error: 'Cadastro de frota sem equipes disponiveis para conferencia.'});
      }
      const equipesFrota = new Map();
      for (const v of frota) {
        if (!ehAtivo(v.status)) continue;
        for (const raw of String(v.equipe_umov || '').split('|')) {
          const nome = raw.trim();
          if (!nome) continue;
          const codigo = codigoEquipe(nome);
          const key = codigo ? '#' + codigo : normalizar(nome);
          if (!equipesFrota.has(key)) equipesFrota.set(key, {nome, codigo});
        }
      }
      if (!equipesFrota.size) return res.json({ok: false, error: 'Nenhuma equipe com veiculo ativo cadastrada.'});
      const agentes = await pool.query({
        text: `SELECT age_id, age_name FROM u45468.agent
               WHERE age_name IS NOT NULL AND TRIM(age_name) <> ''
               ORDER BY age_id DESC LIMIT 10000`,
        query_timeout: 4500
      });
      const porCodigo = new Map();
      const porNome = new Map();
      for (const a of agentes.rows) {
        const name = normalizar(a.age_name);
        const codigo = codigoEquipe(name);
        if (codigo) {
          if (!porCodigo.has(codigo)) porCodigo.set(codigo, []);
          porCodigo.get(codigo).push(a);
        }
        if (!porNome.has(name)) porNome.set(name, []);
        porNome.get(name).push(a);
      }
      const verificadas = [], naoCorrespondentes = [];
      for (const grupo of equipesFrota.values()) {
        const matches = grupo.codigo ? (porCodigo.get(grupo.codigo) || []) : (porNome.get(normalizar(grupo.nome)) || []);
        if (!matches.length) {naoCorrespondentes.push(grupo.nome); continue;}
        verificadas.push({...grupo, agentIds: matches.map(x => Number(x.age_id)).filter(Number.isSafeInteger)});
      }
      const ids = [...new Set(verificadas.flatMap(x => x.agentIds))];
      if (!ids.length) return res.json({ok: false, error: 'Nenhuma equipe do cadastro de frota corresponde a equipe do uMov.'});
      // Uma equipe nao esta sem SS se QUALQUER agente vinculado tem SS ativa,
      // independentemente da data de programacao ou filtro atual da tela.
      const atribuidas = await pool.query({
        text: `SELECT DISTINCT age_id FROM u45468.dbout_task
               WHERE age_id = ANY($1::bigint[])
                 AND tsk_situation IN ('Em Campo','Pendente de Envio para Campo')
                 AND tsk_realfinaldatehour IS NULL`,
        values: [ids], query_timeout: 10000
      });
      const comSS = new Set(atribuidas.rows.map(x => String(x.age_id)));
      const semSS = verificadas.filter(x => !x.agentIds.some(id => comSS.has(String(id))));
      const parcial = frota.length >= 1000 || agentes.rows.length >= 10000 || naoCorrespondentes.length > 0;
      const dados = {
        ok: true, parcial,
        total_cadastradas: equipesFrota.size,
        total_verificadas: verificadas.length,
        nao_identificadas: naoCorrespondentes.length,
        total_sem_ss: semSS.length,
        equipes_sem_ss: semSS.map(x => ({nome: x.nome, codigo: x.codigo})).sort((a,b) => a.nome.localeCompare(b.nome, 'pt-BR')),
        fonte: 'Equipes vinculadas a veiculos ativos no cadastro de Frotas; SS atuais no uMov',
        observacao: 'Sem SS atribuida nao garante presenca na escala nem disponibilidade fisica.'
      };
      saveCache('equipes', dados);
      res.set('Cache-Control', 'no-store').json(dados);
    } catch (e) {
      console.warn('CP V29D - equipes sem SS:', e.message);
      res.status(/timeout|timed out|canceling statement/i.test(String(e.message)) ? 504 : 500)
        .json({ok: false, error: 'Consulta de equipes incompleta. Sem numero confirmado.'});
    }
  });
};
