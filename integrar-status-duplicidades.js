const fs = require('fs');
const vm = require('vm');

const arquivo = 'duplicidades-index.js';
let codigo = fs.readFileSync(arquivo, 'utf8');

const marcador = 'CGM_DUPLICIDADES_STATUS_REAIS_V3';

if (codigo.includes(marcador)) {
  console.log('Integracao V3 ja instalada.');
  process.exit(0);
}

const ancora = /^[ \t]*const grupo\s*=\s*definirMatriz\s*\(\s*base\s*,\s*todos\s*\)\s*;[ \t]*$/gm;

if ([...codigo.matchAll(ancora)].length !== 1) {
  throw Error('Ponto de insercao nao encontrado de forma unica.');
}

const novo = `
    // CGM_DUPLICIDADES_STATUS_REAIS_V3
    // Enriquecimento somente de leitura, separado por origem.
    const enriquecerStatus = async registros => {
      const porFonte = new Map();

      for (const registro of registros) {
        if (!['umov', 'umov_lote1'].includes(registro.origem)) continue;
        const id = Number(registro.tsk_id);
        if (!Number.isSafeInteger(id) || id <= 0) continue;

        if (!porFonte.has(registro.origem)) {
          porFonte.set(registro.origem, []);
        }
        porFonte.get(registro.origem).push(registro);
      }

      await Promise.all([...porFonte.entries()].map(async ([fonte, lista]) => {
        const {db, schema} = fonteBanco(fonte);
        if (!db) return;

        const ids = [...new Set(lista.map(r => Number(r.tsk_id)))];

        try {
          const consulta = await db.query({
            text: \`
              SELECT t.tsk_id,
                     t.tsk_situation AS situacao_campo,
                     d.e_situacao AS status_integracao
              FROM \${schema}.task t
              LEFT JOIN \${schema}.dbout_task d
                ON d.tsk_id = t.tsk_id
              WHERE t.tsk_id = ANY($1::bigint[])
            \`,
            values: [ids],
            query_timeout: 7000
          });

          const dados = new Map(
            consulta.rows.map(r => [String(r.tsk_id), r])
          );

          for (const registro of lista) {
            const atual = dados.get(String(registro.tsk_id));
            if (!atual) continue;

            registro.situacao_campo = atual.situacao_campo || '';
            registro.status_integracao = atual.status_integracao || '';
          }
        } catch (erro) {
          console.warn(
            '[duplicidades] status indisponivel para',
            fonte,
            erro.code || erro.message
          );
        }
      }));
    };

    await enriquecerStatus([base, ...todos]);

`;

codigo = codigo.replace(ancora, trecho => novo + trecho);

new vm.Script(codigo, {filename: arquivo});

fs.writeFileSync(arquivo, codigo, 'utf8');

console.log('STATUS REAIS INTEGRADOS NA API');
console.log('Fontes: umov e umov_lote1');
console.log('Campos: status_integracao e situacao_campo');
