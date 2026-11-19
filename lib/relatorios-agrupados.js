'use strict';

const PADRAO_SS = /^(\d{2}\/\d{2}-\d{6})-(\d{2})$/;
const TOKEN = /^[a-zA-Z0-9._~-]+$/;
const LIMITE_LOCAIS = 201;
const LIMITE_LINHAS = 8040;
const LIMITE_RELATORIOS = 200;

async function consultarRelatoriosAgrupados(pool, ss, {cidades, normalizarCidade, host}) {
  const match = PADRAO_SS.exec(ss);
  if (!match) throw new Error('Número de SS inválido.');
  const base = match[1];
  const numeros = Array.from({length: Number(match[2]) + 1}, (_, i) => base + '-' + String(i).padStart(2, '0'));
  const parametros = numeros.map((_, i) => '$' + (i + 1));

  const consultarTarefas = legado => pool.query({
    // A igualdade permite usar o índice de loc_integrationid também em bancos
    // com collation onde a consulta por prefixo com LIKE exige um índice especial.
    text: `WITH locais AS MATERIALIZED (
      SELECT loc_id, loc_integrationid AS ss, loc_city AS cidade
      FROM u45468.local
      WHERE loc_integrationid IN (${parametros.join(', ')})
      ORDER BY loc_integrationid, loc_id DESC
      LIMIT ${LIMITE_LOCAIS + 1}
    ), total AS (
      SELECT count(*) AS locais_encontrados FROM locais
    )
    SELECT total.locais_encontrados, l.ss, l.cidade, t.tsk_id AS tarefa, t.tss_id, t.tsk_accesstoken
    FROM total
    JOIN locais l ON TRUE
    LEFT JOIN LATERAL (
      SELECT tsk_id, ${legado ? 'NULL AS tss_id, NULL AS tsk_accesstoken' : 'tss_id, tsk_accesstoken'}
      FROM u45468.task
      WHERE loc_id = l.loc_id
      ORDER BY tsk_id DESC
      LIMIT 40
    ) t ON total.locais_encontrados <= ${LIMITE_LOCAIS}
    ORDER BY l.ss, t.tsk_id DESC
    LIMIT ${LIMITE_LINHAS}`,
    values: numeros,
    query_timeout: 7000
  });

  let resultado;
  let colunasNativas = true;
  try {
    resultado = await consultarTarefas(false);
  } catch (error) {
    if (error.code !== '42703' && error.code !== '42501') throw error;
    colunasNativas = false;
    resultado = await consultarTarefas(true);
  }

  const rows = resultado.rows;
  if (cidades && rows.length === 0) return {status:404,error:'SS não localizada no uMov desta divisão.'};
  if (rows.length >= LIMITE_LINHAS || Number(rows[0]?.locais_encontrados) > LIMITE_LOCAIS) return {status:413};
  if (cidades) {
    const permitidas = new Set(cidades.map(normalizarCidade));
    if (rows.some(row => !row.cidade || !permitidas.has(normalizarCidade(row.cidade)))) {
      return {status:403,error:'Uma ou mais sequências não pertencem a esta divisão.'};
    }
  }

  // Inclui os locais sem tarefa e as sequências sem relatório original.
  const relatorios = new Map();
  const verificar = new Map();
  for (const row of rows) {
    const numero = String(row.ss).trim();
    if (!relatorios.has(numero)) relatorios.set(numero, new Map());
    const tarefas = relatorios.get(numero);
    const tarefa = Number(row.tarefa);
    if (!Number.isSafeInteger(tarefa) || tarefa <= 0) continue;
    const token = String(row.tsk_accesstoken || '').trim();
    if (Number(row.tss_id) === 50 && TOKEN.test(token)) tarefas.set(tarefa, token);
    else if (row.tss_id == null || Number(row.tss_id) === 50) verificar.set(tarefa, tarefas);
  }

  if (host && verificar.size) {
    try {
      const legado = await pool.query({
        text: `SELECT candidato.tarefa, localizado.tsk_accesstoken
               FROM unnest($1::bigint[]) AS candidato(tarefa)
               JOIN LATERAL (
                 SELECT d.tsk_accesstoken
                 FROM u45468.dbout_task d
                 WHERE d.tsk_id = candidato.tarefa AND d.tss_id = 50
                   AND btrim(d.tsk_accesstoken::text) ~ '^[a-zA-Z0-9._~-]+$'
                 LIMIT 1
               ) localizado ON TRUE`,
        values: [[...verificar.keys()]],
        query_timeout: 2000
      });
      for (const row of legado.rows) {
        const tarefa = Number(row.tarefa);
        verificar.get(tarefa)?.set(tarefa, String(row.tsk_accesstoken).trim());
      }
    } catch (error) {
      if (!colunasNativas || !['42P01', '42703', '42501'].includes(error.code)) throw error;
    }
  }

  const sequencias = [];
  for (const [numero, tarefas] of relatorios) {
    if (!host || !tarefas.size) {
      sequencias.push({ss:numero,disponivel:false,tarefa:null,link:null});
      continue;
    }
    for (const [tarefa, token] of [...tarefas].sort((a, b) => a[0] - b[0])) {
      sequencias.push({ss:numero,disponivel:true,tarefa,link:`https://${host}/CenterWeb/report/schedule/${tarefa}/${token}`});
    }
  }
  if (sequencias.length > LIMITE_RELATORIOS) return {status:413};

  return {status:200,base,sequencias};
}

module.exports = {consultarRelatoriosAgrupados,PADRAO_SS};
