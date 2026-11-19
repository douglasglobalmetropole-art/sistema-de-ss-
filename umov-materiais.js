'use strict';

const CAMPO_MATERIAL = 19181466;

async function consultarMateriais(pool, numeroSS) {
  const ss = String(numeroSS || '').trim();

  const match = /^(\d{2}\/\d{2}-\d{6})-(\d{2})$/.exec(ss);

  if (!match) {
    throw new Error('Numero de SS invalido.');
  }

  const prefixo = match[1];
  const sequenciaAtual = Number(match[2]);

  const sql = `
    WITH locais AS MATERIALIZED (
      SELECT loc_id, loc_integrationid
      FROM u45468.local
      WHERE loc_description LIKE $1
      LIMIT 100
    )
    SELECT
      l.loc_integrationid AS numero_ss,
      h.hty_id AS relatorio_id,
      h.hty_finaldatehour AS data_execucao,
      hv.htv_externalvalue AS materiais
    FROM locais l
    JOIN u45468.task t
      ON t.loc_id = l.loc_id
    JOIN u45468.history h
      ON h.tsk_id = t.tsk_id
    JOIN u45468.historyvalue hv
      ON hv.hty_id = h.hty_id
     AND hv.acf_id = $2
    WHERE
      l.loc_integrationid LIKE $3
      AND NULLIF(BTRIM(hv.htv_externalvalue), '') IS NOT NULL
    ORDER BY
      l.loc_integrationid,
      h.hty_finaldatehour DESC
    LIMIT 200
  `;

  const resultado = await pool.query({
    text: sql,
    values: [
      'SS: ' + prefixo + '-%',
      CAMPO_MATERIAL,
      prefixo + '-%'
    ],
    query_timeout: 12000
  });

  return resultado.rows.filter(row => {
    const numero = String(row.numero_ss || '');
    const seq = Number(numero.slice(-2));

    return numero.startsWith(prefixo + '-') &&
      /^\d{2}$/.test(numero.slice(-2)) &&
      seq <= sequenciaAtual;
  });
}

async function consultarSequenciasFotos(pool, numeroSS, cidades = null) {
  const ss = String(numeroSS || '').trim();
  const m = /^(\d{2}\/\d{2}-\d{6})-(\d{2})$/.exec(ss);
  if (!m) throw new Error('Numero de SS invalido.');

  const anteriores = Array.from({length: Number(m[2])}, (_, i) => m[1] + '-' + String(i).padStart(2, '0'));
  // Vincula os números ao tipo da coluna para permitir a busca pelo índice.
  const numeros = anteriores.map((_, i) => '$' + (i + 3));
  const cidade = alias => `upper(translate(btrim(${alias}.loc_city),
    'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç',
    'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc'))`;
  const municipio = alias => `($2::text[] IS NULL OR ${cidade(alias)} = ANY($2::text[]))`;
  const tokenValido = alias => `btrim(${alias}.tsk_accesstoken::text) ~ '^[a-zA-Z0-9._~-]+$'`;
  const consultar = legado => pool.query({
    text: `
      SELECT escopo.autorizado, relatorio.*
      FROM (
        SELECT $2::text[] IS NULL OR EXISTS (
          SELECT 1
          FROM u45468.local atual
          WHERE atual.loc_integrationid = $1 AND ${municipio('atual')}
        ) AS autorizado
      ) escopo
      LEFT JOIN LATERAL (
        SELECT numero_ss, tarefa, data_execucao, token_valido
        FROM (
          SELECT candidatos.*,
                 row_number() OVER (
                   PARTITION BY token_valido
                   ORDER BY numero_ss DESC, data_execucao DESC NULLS LAST, tarefa DESC
                 ) AS ordem
          FROM (
            SELECT l.loc_integrationid AS numero_ss,
                   t.tsk_id AS tarefa,
                   t.tsk_lastexecutiondatehour AS data_execucao,
                   ${legado ? 'TRUE' : `COALESCE(${tokenValido('t')}, FALSE)`} AS token_valido
            FROM u45468.local l
            JOIN u45468.task t ON t.loc_id = l.loc_id
            ${legado ? `JOIN LATERAL (
              SELECT 1
              FROM u45468.dbout_task d
              WHERE d.tsk_id = t.tsk_id AND d.tss_id = 50 AND ${tokenValido('d')}
              LIMIT 1
            ) d ON TRUE` : ''}
            WHERE escopo.autorizado
              AND ${numeros.length ? `l.loc_integrationid IN (${numeros.join(', ')})` : 'FALSE'}
              AND ${municipio('l')}
              AND t.tss_id = 50
          ) candidatos
        ) classificados
        WHERE ordem <= 200
      ) relatorio ON TRUE
      ORDER BY relatorio.numero_ss DESC,
               relatorio.data_execucao DESC NULLS LAST,
               relatorio.tarefa DESC
    `,
    values: [ss, cidades, ...anteriores],
    query_timeout: 7000
  });

  let resultado;
  try {
    resultado = await consultar(false);
  } catch (error) {
    if (error.code !== '42703' && error.code !== '42501') throw error;
    // Algumas instalações só expõem o token na vista. Restringe a leitura por tarefa.
    resultado = await consultar(true);
  }

  if (!resultado.rows[0]?.autorizado) return null;
  const registros = resultado.rows.filter(row => row.tarefa != null);
  const verificar = registros.filter(row => !row.token_valido).map(row => row.tarefa);
  const validosLegados = new Set();
  if (verificar.length) {
    try {
      // A vista pode conter um token para uma tarefa concluída cujo campo físico está vazio.
      const legado = await pool.query({
        text: `SELECT candidato.tarefa
               FROM unnest($1::bigint[]) AS candidato(tarefa)
               JOIN LATERAL (
                 SELECT 1
                 FROM u45468.dbout_task d
                 WHERE d.tsk_id = candidato.tarefa AND d.tss_id = 50 AND ${tokenValido('d')}
                 LIMIT 1
               ) localizado ON TRUE`,
        values: [verificar],
        query_timeout: 2000
      });
      for (const row of legado.rows) validosLegados.add(String(row.tarefa));
    } catch (error) {
      if (!['42P01', '42703', '42501'].includes(error.code)) throw error;
      // Mantém os relatórios já comprovados na tabela física se a vista for restrita.
    }
  }

  return registros
    .filter(row => row.token_valido || validosLegados.has(String(row.tarefa)))
    .slice(0, 200)
    .map(({numero_ss, tarefa, data_execucao}) => ({numero_ss, tarefa, data_execucao}));
}
module.exports = {
  consultarMateriais,
  consultarSequenciasFotos
};
