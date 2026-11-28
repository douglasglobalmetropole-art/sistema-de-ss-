'use strict';

const CAMPO_MATERIAL = 19181466;

async function consultarMateriais(pool, numeroSS, todas=false) {
  const ss = String(numeroSS || '').trim();

  const match = /^(\d{2}\/\d{2}-\d{6})-(\d{2})$/.exec(ss);

  if (!match) {
    throw new Error('Numero de SS invalido.');
  }

  const prefixo = match[1];
  const sequenciaAtual = Number(match[2]);

  if(todas){
    const numeros=Array.from(
      {length:100},
      (_,i)=>prefixo+'-'+String(i).padStart(2,'0')
    );

    const sql=[
      'WITH locais AS MATERIALIZED (',
      ' SELECT loc_id,loc_integrationid',
      ' FROM u45468.local',
      ' WHERE loc_integrationid=ANY($1::text[])',
      ')',
      'SELECT l.loc_integrationid AS numero_ss,',
      ' h.hty_id AS relatorio_id,',
      ' h.hty_finaldatehour AS data_execucao,',
      ' hv.htv_externalvalue AS materiais',
      'FROM locais l',
      'JOIN u45468.task t ON t.loc_id=l.loc_id',
      'JOIN u45468.history h ON h.tsk_id=t.tsk_id',
      'JOIN u45468.historyvalue hv',
      ' ON hv.hty_id=h.hty_id AND hv.acf_id=$2',
      "WHERE NULLIF(BTRIM(hv.htv_externalvalue),'') IS NOT NULL",
      'ORDER BY l.loc_integrationid,h.hty_finaldatehour DESC',
      'LIMIT 201'
    ].join(' ');

    const r=await pool.query({
      text:sql,
      values:[numeros,CAMPO_MATERIAL],
      query_timeout:12000
    });

    if(r.rows.length>200)
      throw Error('Limite de materiais atingido.');

    const vistos=new Set();

    return r.rows.filter(row=>{
      if(!numeros.includes(String(row.numero_ss)))
        throw Error('SS fora do atendimento.');

      const chave=JSON.stringify([
        row.numero_ss,
        row.relatorio_id,
        row.materiais
      ]);

      if(vistos.has(chave))return false;
      vistos.add(chave);
      return true;
    });
  }

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

async function consultarSequenciasFotos(pool, numeroSS, todas=false) {
  const ss=String(numeroSS||'').trim();
  const m=/^(\d{2}\/\d{2}-\d{6})-(\d{2})$/.exec(ss);
  if(!m)throw Error('Numero de SS invalido.');
  const ate=todas?100:Number(m[2]);if(!ate)return [];
  // Busca exata por sequencias anteriores; sem varredura de prefixo em toda a base.
  const numeros=Array.from({length:ate},(_,i)=>m[1]+'-'+String(i).padStart(2,'0'));
  const q=await pool.query({text:`
    WITH locais AS MATERIALIZED (
      SELECT loc_id,loc_integrationid FROM u45468.local
      WHERE loc_integrationid=ANY($1::text[]) LIMIT 500
    )
    SELECT l.loc_integrationid AS numero_ss,t.tsk_id AS tarefa,
      COALESCE(NULLIF(to_jsonb(t)->>'tsk_lastexecutiondatehour',''),
               NULLIF(d.data_execucao,'')) AS data_execucao
    FROM locais l JOIN u45468.task t ON t.loc_id=l.loc_id AND t.tss_id=50
    LEFT JOIN LATERAL (
      SELECT to_jsonb(dt)->>'tsk_lastexecutiondatehour' AS data_execucao,
             to_jsonb(dt)->>'tsk_accesstoken' AS token
      FROM u45468.dbout_task dt
      WHERE dt.tsk_id=t.tsk_id AND dt.tss_id=50 LIMIT 1
    ) d ON TRUE
    WHERE NULLIF(BTRIM(COALESCE(to_jsonb(t)->>'tsk_accesstoken','')),'') IS NOT NULL
       OR NULLIF(BTRIM(COALESCE(d.token,'')),'') IS NOT NULL
    ORDER BY l.loc_integrationid DESC,data_execucao DESC NULLS LAST,t.tsk_id DESC
    LIMIT 200
  `,values:[numeros],query_timeout:10000});
  if(todas && q.rows.length>=200)throw Error('Limite de relatorios atingido; consulta nao pode ser considerada completa.');
  const vistos=new Set();
  return q.rows.filter(r=>{const k=r.numero_ss+'|'+r.tarefa;if(vistos.has(k))return false;vistos.add(k);return true;});
}
module.exports = {
  consultarMateriais,
  consultarSequenciasFotos
};
