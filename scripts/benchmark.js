'use strict';
// Comparacao local, com PostgreSQL embarcado e dados sinteticos. Nao mede producao.
const {performance}=require('node:perf_hooks');
const assert=require('node:assert/strict');
const {database,ids}=require('../test/fixtures/database');
const original=require('../test/fixtures/original-statement');
const {statement}=require('../cp-pesquisa-v6');
const {formatDate}=require('../lib/performance');
const median=values=>values.slice().sort((a,b)=>a-b)[Math.floor(values.length/2)];
async function main(){
 const count=20000,db=await database(count),results=[];
 try{
  for(const [tela,filters] of [['recepcao',{}],['campo',{}],['baixar',{}],['encerradas',{}],['tramitacao',{}],['encerradas',{tags:'Urgente'}]]){
   const params={tela,filters,inicio:'2026-11-01',fim:'2026-12-01',macro:[],municipios:[],equipe:'',limit:25,offset:0};
   const a=original(params,ids),b=statement(params,ids);
   const oldRows=(await db.query(a.text,a.values)).rows,newRows=(await db.query(b.text,b.values)).rows;
   assert.deepEqual(newRows,oldRows);
   const times={original:[],optimized:[]};
   for(let i=0;i<5;i++){
    // Alterna a ordem para reduzir o efeito de aquecimento.
    for(const label of i%2?['optimized','original']:['original','optimized']){
     const q=label==='original'?a:b,start=performance.now();await db.query(q.text,q.values);times[label].push(performance.now()-start);
    }
   }
   const oldMs=median(times.original),newMs=median(times.optimized);
   results.push({tela,filters,original_ms:+oldMs.toFixed(2),optimized_ms:+newMs.toFixed(2),reduction_percent:+((1-newMs/oldMs)*100).toFixed(1),same_results:true});
  }
  const date=new Date('2026-11-01T12:00:00Z');let start=performance.now();
  for(let i=0;i<1000;i++)new Intl.DateTimeFormat('pt-BR',{timeZone:'UTC',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(date);
  const oldFormat=performance.now()-start;start=performance.now();for(let i=0;i<1000;i++)formatDate(date);
  const newFormat=performance.now()-start;
  console.log(JSON.stringify({environment:'Node '+process.version+' / PostgreSQL PGlite / sintetico sem rede',task_rows:count,iterations:5,statistic:'median, warm queries, alternating order',sql:results,date_format_1000:{original_ms:+oldFormat.toFixed(2),optimized_ms:+newFormat.toFixed(2)}},null,2));
 }finally{await db.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
