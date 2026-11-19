const fs = require('fs');
const vm = require('vm');

const indexFile = 'public/index.html';
const dupFile = 'public/duplicidades-indicadores.js';
const marker = 'CGM_DUPLICIDADES_STATUS_V1';
const novoMarker = 'CGM_DUPLICIDADES_NATIVO_V2';

let index = fs.readFileSync(indexFile, 'utf8');
let dup = fs.readFileSync(dupFile, 'utf8');

if (dup.includes(novoMarker)) {
  console.log('Ajuste nativo ja instalado.');
  process.exit(0);
}

const originalIndex = index;
const originalDup = dup;

function substituirUma(origem, antigo, novo, nome) {
  const quantidade = origem.split(antigo).length - 1;
  if (quantidade !== 1) {
    throw new Error(nome + ': esperado 1 trecho, encontrados ' + quantidade);
  }
  return origem.replace(antigo, novo);
}

// Remover somente o ajuste provisório V1.
index = index.replace(
  /<style id="CGM_DUPLICIDADES_STATUS_V1-css">[\s\S]*?<\/style>\s*/g,
  ''
);

index = index.replace(
  /<script id="CGM_DUPLICIDADES_STATUS_V1-js">[\s\S]*?<\/script>\s*/g,
  ''
);

if (index.includes(marker)) {
  throw new Error('Ainda existe um trecho V1 no index.html.');
}

// Acrescentar funções específicas, sem alterar as classificações.
const funcoes = `
  // CGM_DUPLICIDADES_NATIVO_V2
  function dgmStatusIntegracao(r) {
    const valor = r.status_integracao ??
      r.statusIntegracao ??
      r.status_dashboard ??
      r.statusDashboard ??
      r.status_siscom ??
      r.statusSiscom;

    if (valor == null || String(valor).trim() === '') {
      return 'Não consultada';
    }

    return String(valor);
  }

  function dgmSituacaoCampo(r) {
    const valor = r.situacao_campo ??
      r.situacaoCampo ??
      r.status_campo ??
      r.statusCampo;

    if (valor == null || String(valor).trim() === '') {
      return 'Não verificada';
    }

    return String(valor);
  }

`;

const ponto = '    const lista = relacionados.map(r => {';

dup = substituirUma(
  dup,
  ponto,
  funcoes + ponto,
  'Insercao das funcoes'
);

// Inserir as células após Critérios encontrados.
const linhaAntiga =
  "          <td>${safe((r.motivos || []).join(' · ') || 'Conferir dados')}</td>";

const linhaNova =
  linhaAntiga + "\n" +
  "          <td class=\"dgm-status-integracao\">${safe(dgmStatusIntegracao(r))}</td>\n" +
  "          <td class=\"dgm-status-campo\">${safe(dgmSituacaoCampo(r))}</td>";

dup = substituirUma(
  dup,
  linhaAntiga,
  linhaNova,
  'Celulas de status'
);

// Inserir os cabeçalhos.
const cabecalhoAntigo = '                <th>Critérios encontrados</th>';

const cabecalhoNovo = cabecalhoAntigo + '\n' +
  '                <th>Status da Integração</th>\n' +
  '                <th>Situação de Campo</th>';

dup = substituirUma(
  dup,
  cabecalhoAntigo,
  cabecalhoNovo,
  'Cabecalhos'
);

// Validar o JavaScript antes de gravar.
new vm.Script(dup, { filename: dupFile });

// Verificações de integridade.
if (!dup.includes('<th>RUA</th>')) {
  throw new Error('A coluna Rua desapareceu.');
}

if (!dup.includes('dup-indicator-cell')) {
  throw new Error('Rotina dos indicadores nao encontrada.');
}

if (!dup.includes('/api/duplicidades/consulta?ss=')) {
  throw new Error('Consulta original de duplicidades ausente.');
}

// Gravar apenas depois de todas as validações.
try {
  fs.writeFileSync(indexFile, index, 'utf8');
  fs.writeFileSync(dupFile, dup, 'utf8');
} catch (e) {
  fs.writeFileSync(indexFile, originalIndex, 'utf8');
  fs.writeFileSync(dupFile, originalDup, 'utf8');
  throw e;
}

console.log('CORRECAO NATIVA INSTALADA');
console.log('Coluna Rua preservada.');
console.log('Indicadores preservados.');
console.log('Status da Integracao e Situacao de Campo adicionados.');
console.log('Ajuste provisório V1 removido.');
