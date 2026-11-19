const fs = require('fs');
const vm = require('vm');

const api = 'duplicidades-index.js';
const js = 'public/duplicidades-indicadores.js';

let a = fs.readFileSync(api, 'utf8');
let b = fs.readFileSync(js, 'utf8');

function trocarUmaVez(texto, antigo, novo, nome) {
  const partes = texto.split(antigo);
  if (partes.length !== 2) {
    throw Error('Trecho nao localizado de forma unica: ' + nome);
  }
  return partes.join(novo);
}

// A rotina de enriquecimento permanece instalada,
// mas passa a ser opcional na consulta automatica.
a = trocarUmaVez(
  a,
  'async function buscarMatriz(ss,req){',
  'async function buscarMatriz(ss,req,comDetalhes=false){',
  'assinatura buscarMatriz'
);

a = trocarUmaVez(
  a,
  '    await enriquecerStatus([base, ...todos]);',
  '    if (comDetalhes) await enriquecerStatus([base, ...todos]);',
  'enriquecimento de status'
);

// Somente a rota de consulta publica recebe o parametro.
// A rota de aplicacao de TAG continua com suas validacoes.
const inicioConsulta = a.indexOf("app.get('/api/duplicidades/consulta'");
const inicioTag = a.indexOf("app.post('/api/duplicidades/aplicar-tag'");

if (inicioConsulta < 0 || inicioTag <= inicioConsulta) {
  throw Error('Rotas de consulta e TAG nao encontradas.');
}

let trechoConsulta = a.slice(inicioConsulta, inicioTag);

const chamadaConsulta = /const\s+dados\s*=\s*await\s+buscarMatriz\s*\(\s*ss\s*,\s*req\s*\)\s*;/g;

if ([...trechoConsulta.matchAll(chamadaConsulta)].length !== 1) {
  throw Error('Chamada da rota de consulta nao encontrada de forma unica.');
}

trechoConsulta = trechoConsulta.replace(
  chamadaConsulta,
  "const dados=await buscarMatriz(ss,req,req.query.detalhes==='1');"
);

a = a.slice(0, inicioConsulta) + trechoConsulta + a.slice(inicioTag);

// A janela de analise pede os detalhes.
// A consulta automatica permanece sem esse parametro.
const inicioAbrir = b.indexOf('  async function abrir(ss) {');
const inicioConsultar = b.indexOf('  function consultar(ss) {');

if (inicioAbrir < 0 || inicioConsultar <= inicioAbrir) {
  throw Error('Funcoes abrir/consultar nao encontradas.');
}

let trechoAbrir = b.slice(inicioAbrir, inicioConsultar);

trechoAbrir = trocarUmaVez(
  trechoAbrir,
  "'/api/duplicidades/consulta?ss=' + encodeURIComponent(ss),",
  "'/api/duplicidades/consulta?detalhes=1&ss=' + encodeURIComponent(ss),",
  'URL da janela de analise'
);

// O cache da consulta leve nao deve impedir a busca
// dos detalhes ao clicar.
trechoAbrir = trocarUmaVez(
  trechoAbrir,
  'if (dado && Date.now() - dado.tempo < CACHE_MS) {',
  'if (dado && dado.detalhes === true && Date.now() - dado.tempo < CACHE_MS) {',
  'cache da janela'
);

trechoAbrir = trocarUmaVez(
  trechoAbrir,
  'cache.set(ss,{resposta:j,tempo:Date.now()});',
  'cache.set(ss,{resposta:j,detalhes:true,tempo:Date.now()});',
  'cache detalhado'
);

b = b.slice(0, inicioAbrir) + trechoAbrir + b.slice(inicioConsultar);

// Impedir que a resposta leve substitua uma resposta
// detalhada que ja esteja no cache.
b = trocarUmaVez(
  b,
  'cache.set(ss,{resposta:j,tempo:Date.now()});',
  'if (!cache.get(ss)?.detalhes) cache.set(ss,{resposta:j,detalhes:false,tempo:Date.now()});',
  'cache da consulta automatica'
);

new vm.Script(a, {filename:api});
new vm.Script(b, {filename:js});

fs.writeFileSync(api, a, 'utf8');
fs.writeFileSync(js, b, 'utf8');

console.log('OTIMIZACAO INSTALADA');
console.log('Indicadores: consulta leve');
console.log('Janela: consulta detalhada');
console.log('Classificacoes e regras de TAG preservadas');
