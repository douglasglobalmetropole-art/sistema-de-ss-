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

  // CP V29F: cadastro integral de equipes do banco uMov deste contrato.
  // O filtro nao deve depender das SS retornadas no periodo.
  app.get('/api/cp/equipes-cadastro', async (_req, res) => {
    const anterior = getCache('cadastro_equipes');
    if (anterior) return res.json(anterior);
    try {
      const resultado = await pool.query({
        text: `SELECT age_id, age_name
               FROM u45468.agent
               WHERE age_name IS NOT NULL AND BTRIM(age_name) <> ''
               ORDER BY age_name, age_id`,
        query_timeout: 9500
      });
      const nomes = new Set();
      for (const row of resultado.rows) {
        const nome = String(row.age_name || '').trim();
        if (nome) nomes.add(nome);
      }
      const equipes = [...nomes].sort((a,b) => a.localeCompare(b,'pt-BR', {numeric:true})).map(nome => ({nome}));
      const dados = {ok:true, total:equipes.length, equipes,
        fonte:'u45468.agent (cadastro de equipes/agentes do banco uMov configurado para este contrato)',
        observacao:'Inclui cadastrados sem SS no periodo; cadastro pode conter inativos se o uMov os mantiver.'};
      saveCache('cadastro_equipes', dados);
      res.set('Cache-Control','no-store').json(dados);
    } catch(e) {
      console.warn('CP V29F - cadastro de equipes:', e.message);
      res.status(/timeout|timed out|canceling statement/i.test(String(e.message)) ? 504 : 500)
        .json({ok:false,error:'Nao foi possivel obter o cadastro completo de equipes no uMov.'});
    }
  });

  // V29H: todas as equipes do cadastro do uMov neste schema, sem corte
  // pelo cadastro de Frotas nem pela data selecionada no painel.
  app.get('/api/cp/equipes-sem-ss', async (_req, res) => {
    const existente = getCache('equipes-v29h-completo');
    if (existente) return res.set('Cache-Control', 'no-store').json(existente);
    try {
      // Uma unica consulta: universo integral de age_id + situacao atual de SS.
      // Nao aplicamos LIMIT nem filtro de datas. Cada equipe sem registro de
      // tarefa atual nas situacoes abaixo fica identificada como sem SS.
      const resultado = await pool.query({
        text: `SELECT a.age_id, a.age_name,
                 (atribuida.age_id IS NOT NULL) AS possui_ss
               FROM u45468.agent a
               LEFT JOIN (
                 SELECT DISTINCT age_id
                 FROM u45468.dbout_task
                 WHERE age_id IS NOT NULL
                   AND tsk_situation IN ('Em Campo', 'Pendente de Envio para Campo')
                   AND tsk_realfinaldatehour IS NULL
               ) atribuida ON atribuida.age_id = a.age_id
               WHERE a.age_name IS NOT NULL
                 AND BTRIM(a.age_name) <> ''
               ORDER BY a.age_name, a.age_id`,
        query_timeout: 14500
      });
      const grupos = new Map();
      for (const a of resultado.rows) {
        const nome = String(a.age_name || '').trim();
        if (!nome) continue;
        const codigo = codigoEquipe(nome);
        // Linhas historicas com mesmo numero de equipe formam uma unica equipe.
        const chave = codigo ? `codigo:${codigo}` : `nome:${normalizar(nome)}`;
        let g = grupos.get(chave);
        if (!g) {
          g = {nome, codigo, com_ss: false, ids: new Set()};
          grupos.set(chave, g);
        }
        // Se qualquer age_id da mesma equipe tiver SS aberta, NAO marcar sem SS.
        g.com_ss = g.com_ss || a.possui_ss === true || a.possui_ss === 't';
        g.ids.add(String(a.age_id));
      }
      const ordenar = (a, b) => a.nome.localeCompare(b.nome, 'pt-BR', {numeric:true});
      const equipes = [...grupos.values()].map(g => ({
        nome:g.nome, codigo:g.codigo, com_ss:g.com_ss
      })).sort(ordenar);
      const semSS = equipes.filter(g => !g.com_ss);
      const dados = {
        ok: true, parcial: false,
        total_cadastradas: equipes.length,
        total_verificadas: equipes.length,
        total_sem_ss: semSS.length,
        total_com_ss: equipes.length - semSS.length,
        nao_identificadas: 0,
        equipes_sem_ss: semSS,
        equipes_todas: equipes,
        fonte: 'u45468.agent (todos os cadastrados no schema uMov) + dbout_task (atribuicao atual)',
        observacao: 'Sem SS atual nao comprova escala, presenca ou disponibilidade. O cadastro pode conter agentes inativos.'
      };
      saveCache('equipes-v29h-completo', dados);
      return res.set('Cache-Control', 'no-store').json(dados);
    } catch (e) {
      console.warn('CP V29H - cadastro integral equipes:', e.message);
      return res.status(/timeout|timed out|canceling statement/i.test(String(e.message)) ? 504 : 500)
        .json({ok: false, error: 'Nao foi possivel comparar todas as equipes cadastradas com as SS atuais do uMov.'});
    }
  });
};
