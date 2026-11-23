'use strict';
/* CGM_DUP_INTELIGENCIA_V1 - somente leitura. Nao altera pontuacao legada,
 * definicao da SS matriz, permissao de TAG, rejeicao ou situacao operacional.
 */
const removerAcentos = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const norm = s => removerAcentos(s).toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const CODIGOS = new Set([3300,3400,3600,3700,3790,3800,3860,3880,3900,3990,3995,4300,4400,4500,4980]);
const PARES_EQUIVALENTES = [[3300,3400]];
const PARES_RELACIONADOS = [
  [3995,3300],[3995,3400],[3995,3600],[3995,3700],[3995,3790],[3995,3800],[3995,3900],
  [3790,3300],[3790,3400],[3600,3300],[3600,3400],[3700,3300],[3700,3400],
  [3800,3300],[3800,3400],[3800,3700],[3800,3790],[3800,3860],[3800,3880],[3860,3880],
  [3900,3300],[3900,3400],[3900,3990],[3990,3300],[3990,3400],
  [4300,4400],[4300,4980],[4400,4980],[4500,4400]
];
const chavePar = (a,b) => [Math.min(a,b),Math.max(a,b)].join('|');
const IGUAIS = new Set(PARES_EQUIVALENTES.map(([a,b])=>chavePar(a,b)));
const RELACIONADOS = new Set(PARES_RELACIONADOS.map(([a,b])=>chavePar(a,b)));

function macro(v) {
  const direto=Number(v?.cd_macro_reg ?? v?.codigo_macro ?? v?.macro_codigo);
  if (CODIGOS.has(direto)) return direto;
  for (const t of [v?.servico,v?.macro,v?.dc_macro_reg]) {
    const m=String(t ?? '').match(/\b(?:3300|3400|3600|3700|3790|3800|3860|3880|3900|3990|3995|4300|4400|4500|4980)\b/);
    if (m) return Number(m[0]);
  }
  return null;
}
function relacaoMacro(a,b) {
  const x=macro(a),y=macro(b);
  if (x===null||y===null) return {tipo:'indisponivel',alvo:x,candidata:y};
  if (x===y) return {tipo:'igual',alvo:x,candidata:y};
  const par=chavePar(x,y);
  return {tipo:IGUAIS.has(par)?'equivalente':RELACIONADOS.has(par)?'relacionado':'diferente',alvo:x,candidata:y};
}
function textos(v) {
  return [v?.informacao_solicitante,v?.esclarecimento_solicitante,
    v?.referencia_localizacao,v?.informacao_servico,v?.referencia,
    v?.INFORMACAO_SERVICO,v?.REFERENCIA,v?.DC_EXECUCAO]
    .filter(x=>typeof x==='string'&&x.trim()).join(' ');
}
function extrairSSCitadas(v) {
  const r=/\b(\d{2}\/\d{2})\s*-\s*(\d{6})\s*-\s*(\d{2})\b/g;
  const achados=new Set();
  for (const m of textos(v).matchAll(r)) achados.add(m[1]+'-'+m[2]+'-'+m[3]);
  return [...achados];
}
const parseData=v=>{if(!v)return null;const d=Date.parse(v);return Number.isFinite(d)?d:null};
function diasEntre(a,b){
  const da=parseData(a),db=parseData(b);
  return da===null||db===null?null:Math.round(((da-db)/86400000)*10)/10;
}
function telefone(v) {
  const dg=String(v??'').replace(/\D/g,'');
  // Nao inferir identidade pelo telefone de 8 digitos sem DDD.
  return (dg.length===10||dg.length===11)&&new Set(dg).size>3?dg:null;
}
function coordenada(v,lat) {
  if(v===null||v===undefined||v==='')return null;
  const s=String(v).trim().replace(',','.');
  if(!/^-?\d+(?:\.\d+)?$/.test(s))return null;
  let n=Number(s);
  if(Math.abs(n)>180)n/=1e10; // Dados SISCOM escalados em 1e10
  if(!Number.isFinite(n)||(lat?Math.abs(n)>90:Math.abs(n)>180)||n===0)return null;
  return n;
}
function local(v){
  const la=coordenada(v?.latitude??v?.lat??v?.LATITUDE??v?.LAT,true);
  const lo=coordenada(v?.longitude??v?.lon??v?.long??v?.LONGITUDE??v?.LON,false);
  return la===null||lo===null?null:{lat:la,lon:lo};
}
function distanciaMetros(a,b){
  const x=local(a),y=local(b);if(!x||!y)return null;
  const rad=Math.PI/180;
  const dp=(y.lat-x.lat)*rad,dl=(y.lon-x.lon)*rad;
  const h=Math.sin(dp/2)**2+Math.cos(x.lat*rad)*Math.cos(y.lat*rad)*Math.sin(dl/2)**2;
  return Math.round(6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h))));
}
function analisarComplementar(alvo,candidata){
  const indicios=[],alertas=[],contexto=[];
  const relacao=relacaoMacro(alvo,candidata);
  if(relacao.tipo==='igual') indicios.push('Mesma macro ('+relacao.alvo+')');
  if(relacao.tipo==='equivalente') indicios.push('Macros equivalentes ('+relacao.alvo+'/'+relacao.candidata+')');
  if(relacao.tipo==='relacionado') contexto.push('Macros relacionadas ('+relacao.alvo+'/'+relacao.candidata+'); nao confirma duplicidade');
  if(relacao.tipo==='diferente') alertas.push('Macros diferentes ('+relacao.alvo+'/'+relacao.candidata+')');
  const cita=extrairSSCitadas(alvo).includes(String(candidata?.ss||'').trim());
  const citadoPelaCandidata=extrairSSCitadas(candidata).includes(String(alvo?.ss||'').trim());
  if(cita) indicios.push('SS candidata citada diretamente no atendimento');
  if(citadoPelaCandidata) indicios.push('SS avaliada citada no historico da candidata');
  const ta=telefone(alvo.telefone),tb=telefone(candidata.telefone);
  if(ta&&tb&&ta===tb) indicios.push('Mesmo telefone com DDD');
  const pa=String(alvo.protocolo_referenciado||'').replace(/\D/g,'');
  const pb=String(candidata.protocolo_referenciado||'').replace(/\D/g,'');
  if(pa.length>=10&&pa===pb) indicios.push('Mesmo protocolo referenciado');
  const dias=diasEntre(alvo.registro_em,candidata.registro_em);
  if(dias!==null){
    if(dias<0)alertas.push('Candidata registrada depois da SS avaliada');
    else if(dias>180)alertas.push('Registros separados por mais de 180 dias: avaliar reincidencia');
    else contexto.push('Candidata registrada '+dias+' dia(s) antes');
  }
  const distancia=distanciaMetros(alvo,candidata);
  if(distancia!==null){
    if(distancia<=50) indicios.push('Localizacao a '+distancia+' m');
    else if(distancia>250) alertas.push('Locais separados por '+distancia+' m');
    else contexto.push('Distancia entre locais: '+distancia+' m');
  }
  if(alvo.chave_rua&&alvo.chave_rua===candidata.chave_rua&&
    alvo.numero&&candidata.numero&&String(alvo.numero)!==String(candidata.numero))
    alertas.push('Mesma rua com numeros diferentes');
  if(alvo.matricula&&candidata.matricula&&String(alvo.matricula)!==String(candidata.matricula))
    alertas.push('Matriculas divergentes');
  if(alvo.hidrometro&&candidata.hidrometro&&String(alvo.hidrometro)!==String(candidata.hidrometro))
    alertas.push('Hidrometros divergentes');
  return {
    versao:1,relacao_macro:relacao.tipo,macro_alvo:relacao.alvo,macro_candidata:relacao.candidata,
    referencia_direta:cita,dias_entre_registros:dias,distancia_m:distancia,
    indicios,alertas,contexto,
    // Apenas evidencias: NAO alimentar categoria='provavel', grupoSeguro ou TAG automatica.
    apenas_informativo:true
  };
}
module.exports={analisarComplementar,extrairSSCitadas,relacaoMacro,distanciaMetros};
