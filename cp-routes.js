'use strict';
const path = require('node:path');

// Rotas adicionais da Central de Operacoes. Nao substituem as APIs do GLOBAL SS.
module.exports = function registerCentralOperacoes(app, pool) {
  app.get(['/cp', '/cp/'], (_req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.sendFile(path.join(__dirname, 'public', 'central-operacoes.html'));
  });

  app.get('/api/cp/ss', async (req, res) => {
    const di = String(req.query.di || '');
    const df = String(req.query.df || '');
    const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) &&
      !Number.isNaN(Date.parse(s + 'T00:00:00Z')) &&
      new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
    if (!isDate(di) || !isDate(df)) {
      return res.status(400).json({ error: 'Informe datas validas no formato AAAA-MM-DD.' });
    }
    const dias = (Date.parse(df + 'T00:00:00Z') - Date.parse(di + 'T00:00:00Z')) / 86400000;
    if (dias < 0 || dias > 31) {
      return res.status(400).json({ error: 'O periodo deve ter de 1 a 32 dias corridos. Reduza o intervalo.' });
    }

    // Limite explicito: nunca apresenta dados parciais como se fossem totais.
    const MAX_ROWS = 2000;
    const sql = `
      SELECT
        t.tsk_id, l.loc_integrationid AS ss,
        l.loc_city AS cidade, l.loc_neighborhood AS bairro,
        l.loc_street AS rua, l.loc_streetnumber AS numero,
        a.age_name AS equipe, tt.tty_description AS servico,
        d.tsk_situation AS situacao_campo, d.e_situacao AS status_integracao,
        t.tsk_insertdatehour AS criado_em,
        d.tsk_scheduleinitialdatehour AS programacao,
        d.tsk_realinitialdatehour AS inicio_real,
        d.tsk_realfinaldatehour AS fim_real
      FROM u45468.task t
      JOIN u45468.dbout_task d ON d.tsk_id = t.tsk_id
      JOIN u45468.local l ON l.loc_id = t.loc_id
      LEFT JOIN u45468.agent a ON a.age_id = t.age_id
      LEFT JOIN u45468.tasktype tt ON tt.tty_id = t.tty_id
      WHERE t.tsk_insertdatehour >= $1::date
        AND t.tsk_insertdatehour < ($2::date + INTERVAL '1 day')
      ORDER BY t.tsk_insertdatehour DESC, t.tsk_id DESC
      LIMIT ${MAX_ROWS + 1}`;
    try {
      const result = await pool.query({ text: sql, values: [di, df], query_timeout: 14000 });
      const truncated = result.rows.length > MAX_ROWS;
      res.set('Cache-Control', 'no-store');
      res.set('X-CP-Truncated', truncated ? '1' : '0');
      res.json(result.rows.slice(0, MAX_ROWS).map(row => ({
        ...row,
        tsk_id: Number(row.tsk_id),
        equipe: row.equipe || '',
        situacao_campo: row.situacao_campo || '',
        status_integracao: row.status_integracao || '',
        // Nao criar coordenadas ou dados de mobile nao confirmados.
      })));
    } catch (error) {
      console.error('Central de Operacoes - consulta:', error.message);
      const timeout = error.code === '57014' || /timeout/i.test(error.message || '');
      res.status(timeout ? 504 : 502).json({
        error: timeout ? 'Consulta ao uMov excedeu o tempo limite. Reduza o periodo.' :
          'Nao foi possivel consultar os dados da Central de Operacoes no uMov.'
      });
    }
  });
};
