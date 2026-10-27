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

  // V29I: pessoas/equipes operacionais ATIVAS. Cadastrados administrativos
  // (programadores, medicao, master etc.) nao sao equipes operacionais.
  const v29iStatusPermitidos = new Set(['S', 'SIM', 'A', 'ATIVO', 'ACTIVE', 'T', 'TRUE', 'Y', 'YES', '1']);
  const v29iNormalizar = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
  const v29iColunasAtivo = ['age_active','age_status','age_situation','age_enabled','age_isactive','age_is_active'];
  const v29iColunasLogin = ['age_login','age_username','age_userlogin','age_user_name','age_user','age_loginname','age_userid'];
  let v29iCacheUniverso = null;
  let v29iCacheEm = 0;
  let v29iPromise = null;
  function v29iPrimeiraColuna(existentes, preferencias) {
    return preferencias.find(x => existentes.has(x)) || '';
  }
  function v29iEquipeOperacional(nome, login) {
    const n = v29iNormalizar(nome), l = v29iNormalizar(login);
    // Nao considerar usuarios sem identificacao operacional; codigos 001/002
    // da lista fornecida sao acessos de programadores, nao equipes de campo.
    const m = n.match(/^(?:EQUIPE\s*)?(\d{3,4})(?!\d)(?:\s*[-–.]|\s|$)/);
    if (!m || Number(m[1]) < 100) return false;
    if (/(?:^|[.\-_])PROG|^PROG|PROGRAMADOR|PROGRAMACAO|MEDICAO|MASTER|ADMIN|SUPORTE|TESTE/.test(l)) return false;
    if (/PROGRAMADOR|PROGRAMACAO|MEDICAO|MASTER|ADMINISTRATIVO|SUPORTE|TESTE/.test(n)) return false;
    return true;
  }
  async function v29iUniversoEquipes(force = false) {
    if (!force && v29iCacheUniverso && Date.now() - v29iCacheEm < 90000) return v29iCacheUniverso;
    if (v29iPromise) return v29iPromise;
    v29iPromise = (async () => {
      // Descoberta controlada: nao presumir nomes de campos do uMov.
      const info = await pool.query({
        text: `SELECT column_name FROM information_schema.columns
               WHERE table_schema = 'u45468' AND table_name = 'agent'`,
        query_timeout: 6000
      });
      const cols = new Set(info.rows.map(r => String(r.column_name || '').toLowerCase()));
      const status = v29iPrimeiraColuna(cols, v29iColunasAtivo);
      const login = v29iPrimeiraColuna(cols, v29iColunasLogin);
      if (!cols.has('age_id') || !cols.has('age_name')) throw Error('Colunas basicas do cadastro uMov indisponiveis.');
      if (!status) throw Error('Nao identifiquei a coluna de ATIVO em u45468.agent. Execute DIAGNOSTICO_ATIVOS_V29I.sql no pgAdmin; o painel nao estimara equipes ativas.');
      const statusExpression = `UPPER(BTRIM(a."${status}"::text))`;
      const loginExpression = login ? `a."${login}"::text` : `NULL::text`;
      const resultado = await pool.query({
        text: `SELECT a.age_id, a.age_name, ${loginExpression} AS login,
                 ${statusExpression} AS status_ativo,
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
        query_timeout: 17000
      });
      const bruto = resultado.rows || [];
      const diferentesStatus = [...new Set(bruto.map(a => v29iNormalizar(a.status_ativo)))];
      // Falhar explicitamente se o uMov usar uma codificacao desconhecida.
      // Nunca apresentar inativos como equipes disponiveis por engano.
      if (bruto.length > 0 && !diferentesStatus.some(s => v29iStatusPermitidos.has(s))) {
        throw Error('Campo ' + status + ' nao apresentou valor ativo reconhecido; confira codigos no DIAGNOSTICO_ATIVOS_V29I.sql.');
      }
      const grupos = new Map();
      for (const a of bruto) {
        if (!v29iStatusPermitidos.has(v29iNormalizar(a.status_ativo))) continue;
        const nome = String(a.age_name || '').trim();
        const acesso = String(a.login || '').trim();
        if (!v29iEquipeOperacional(nome, acesso)) continue;
        // Identificador do uMov, nao numero impresso no nome: 201 em
        // Guarapari e 201 em Vila Velha sao equipes DIFERENTES.
        const chave = acesso ? `login:${v29iNormalizar(acesso)}` : `id:${a.age_id}`;
        let g = grupos.get(chave);
        if (!g) {
          g = {nome, login: acesso, com_ss:false, ids:[]};
          grupos.set(chave,g);
        }
        g.com_ss = g.com_ss || a.possui_ss === true || a.possui_ss === 't';
        g.ids.push(String(a.age_id));
      }
      const equipes = [...grupos.values()]
        .map(g=>({nome:g.nome, login:g.login, com_ss:g.com_ss}))
        .sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR',{numeric:true}));
      const semSS = equipes.filter(e => !e.com_ss);
      const dados = {
        ok:true, parcial:false, universo:'equipes_operacionais_ativas',
        total_cadastradas:equipes.length, total_verificadas:equipes.length,
        total_sem_ss:semSS.length, total_com_ss:equipes.length-semSS.length,
        nao_identificadas:0, equipes_sem_ss:semSS, equipes_todas:equipes,
        coluna_ativo:status, coluna_login:login || null,
        fonte:'u45468.agent (somente ATIVOS, nomes de equipe, excluidos acessos administrativos) + dbout_task (atribuicao atual)',
        observacao:'Sem SS atribuida nao comprova disponibilidade ou presenca em escala. Numeros de equipe repetidos permanecem distintos por usuario/login.'
      };
      v29iCacheUniverso = dados;
      v29iCacheEm = Date.now();
      return dados;
    })();
    try { return await v29iPromise; }
    finally { v29iPromise = null; }
  }

  app.get('/api/cp/equipes-cadastro', async (_req,res) => {
    try {
      const dados = await v29iUniversoEquipes();
      const equipes = dados.equipes_todas.map(e => ({nome:e.nome, login:e.login}));
      res.set('Cache-Control','no-store').json({ok:true,total:equipes.length,equipes,
        fonte:dados.fonte,observacao:dados.observacao});
    } catch(e) {
      console.warn('CP V29I - cadastro operacional ativo:',e.message);
      res.status(/timeout|timed out|canceling statement/i.test(String(e.message)) ? 504 : 503)
        .json({ok:false,error:'Nao foi possivel validar equipes operacionais ativas: '+e.message});
    }
  });

  app.get('/api/cp/equipes-sem-ss', async (_req,res) => {
    try {
      const dados = await v29iUniversoEquipes();
      res.set('Cache-Control','no-store').json(dados);
    } catch(e) {
      console.warn('CP V29I - equipes sem SS:',e.message);
      res.status(/timeout|timed out|canceling statement/i.test(String(e.message)) ? 504 : 503)
        .json({ok:false,error:'Nao foi possivel validar equipes operacionais ativas: '+e.message});
    }
  });

};
