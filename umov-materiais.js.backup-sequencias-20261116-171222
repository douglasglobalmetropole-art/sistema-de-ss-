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

module.exports = { consultarMateriais };
