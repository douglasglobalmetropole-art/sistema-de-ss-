'use strict';
/* Funcoes puras para a selecao da Matriz. Nenhuma alteracao no uMov. */
const {comparar}=require('./duplicidades-core');
const SS_RE=/^\d{2}\/\d{2}-\d{6}-\d{2}$/;
const hora=v=>{
  if(!v)return NaN;
  const t=Date.parse(v);
  return Number.isFinite(t)?t:NaN;
};
function definirMatriz(alvo,resultados){
  const pares=[alvo,...(resultados||[]).filter(r=>r.categoria==='provavel')];
  const porSS=new Map();
  for(const p of pares){
    if(!p||!SS_RE.test(String(p.ss||'')))continue;
    const antigo=porSS.get(p.ss);
    if(!antigo||Number(p.tsk_id)>Number(antigo.tsk_id))porSS.set(p.ss,p);
  }
  const candidatas=[...porSS.values()];
  if(candidatas.length<2)return {matriz:null,duplicatas:[],habilitada:false,motivo:'Nenhuma duplicidade provavel neste grupo.'};
  if(candidatas.some(x=>!Number.isFinite(hora(x.registro_em))))
    return {matriz:null,duplicatas:[],habilitada:false,motivo:'Datas de abertura incompletas. Matriz nao definida.'};
  candidatas.sort((a,b)=>hora(a.registro_em)-hora(b.registro_em)||Number(a.tsk_id)-Number(b.tsk_id));
  const matriz=candidatas[0];
  const duplicatas=candidatas.slice(1).filter(r=>comparar(matriz,r).categoria==='provavel');
  if(!duplicatas.length)return {matriz:null,duplicatas:[],habilitada:false,motivo:'Nenhuma duplicidade compativel com a Matriz.'};
  return {matriz,duplicatas,habilitada:true,motivo:null};
}
module.exports={definirMatriz,SS_RE};
