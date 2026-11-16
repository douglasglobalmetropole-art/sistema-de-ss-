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

async function consultarSequenciasFotos(pool, numeroSS) {
  const ss = String(numeroSS || '').trim();
  const m = /^(\d{2}\/\d{2}-\d{6})-(\d{2})$/.exec(ss);
  if (!m) throw new Error('Numero de SS invalido.');
  const atual = Number(m[2]);
  if (!atual) return [];
  const numeros = Array.from(
    {length: atual},
    (_, i) => m[1] + '-' + String(i).padStart(2, '0')
  );
  const r = await pool.query({
    text: `
      WITH locais AS MATERIALIZED (
        SELECT loc_id, loc_integrationid
        FROM u45468.local
        WHERE loc_integrationid = ANY($1::text[])
        ORDER BY loc_integrationid DESC, loc_id DESC
        LIMIT 150
      )
      SELECT l.loc_integrationid AS numero_ss,
             t.tsk_id AS tarefa,
             d.tsk_lastexecutiondatehour AS data_execucao
      FROM locais l
      JOIN LATERAL (
        SELECT tsk_id
        FROM u45468.task
        WHERE loc_id = l.loc_id
        ORDER BY tsk_id DESC
        LIMIT 100
      ) t ON TRUE
      JOIN u45468.dbout_task d
        ON d.tsk_id = t.tsk_id AND d.tss_id = 50
      WHERE NULLIF(BTRIM(d.tsk_accesstoken), '') IS NOT NULL
      ORDER BY l.loc_integrationid DESC,
               d.tsk_lastexecutiondatehour DESC NULLS LAST,
               t.tsk_id DESC
      LIMIT 200
    `,
    values: [numeros],
    query_timeout: 12000
  });
  return r.rows;
}module.exports = {
  consultarMateriais,
  consultarSequenciasFotos
};
