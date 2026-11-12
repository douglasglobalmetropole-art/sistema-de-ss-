'use strict';
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {database,ids}=require('./fixtures/database');
const original=require('./fixtures/original-statement');
const v6=require('../cp-pesquisa-v6');
const perf=require('../lib/performance');
let db;
before(async()=>{db=await database();});
after(async()=>{await db.close();});
for(const tela of ['recepcao','campo','baixar','encerradas','tramitacao']){
 test('SQL preserva resultados, filtros e paginacao: '+tela,async()=>{
  for(const filters of [{},{tags:'Urgente'},{setor:'Setor A'},{ss:'0001'},{servico:'Agua'},{equipe_executou:'01'},{status_integracao:'Baixada'},{criado_em:'01/11'},{data_finalizacao:'02/11'}]){
   for(const offset of [0,3]){
    const params={tela,filters,inicio:'2026-11-01',fim:'2026-11-03',macro:[],municipios:['VILA VELHA'],equipe:'',limit:5,offset};
    const old=original(params,ids),next=v6.statement(params,ids);
    const a=await db.query(old.text,old.values),b=await db.query(next.text,next.values);
    assert.deepEqual(b.rows,a.rows,JSON.stringify({tela,filters,offset}));
   }
  }
 });
}
function response(){return {headers:{},set(k,v){this.headers[k]=v;return this;},status(n){this.code=n;return this;},json(data){this.data=data;return this;}};}
test('30 pesquisas concorrentes compartilham consultas e refresh nao cria chaves infinitas',async()=>{
 perf.invalidate();let calls=0;
 const pool={async query(q){calls++;await new Promise(r=>setTimeout(r,5));return db.query(q.text,q.values);}};
 const make=refresh=>({query:{tela:'campo',limit:'5',_refresh:refresh},url:'/api/pesquisa-global'});
 const responses=Array.from({length:30},response);
 await Promise.all(responses.map((r,i)=>v6.handler(make(String(i)),r,{pool,scope:'principal:geral'})));
 assert.equal(calls,2); // um metadado + uma pagina, sem extras locais configurados
 assert(responses.every(r=>r.data.ok&&r.data.rows.length===5));
 const hit=response();await v6.handler(make(undefined),hit,{pool,scope:'principal:geral'});
 assert.equal(hit.headers['X-Cache'],'HIT');assert.equal(calls,2);
 const second=response();await v6.handler(make(undefined),second,{pool,scope:'lote1:geral'});
 assert.equal(second.headers['X-Cache'],'MISS');assert.equal(calls,4);
 perf.invalidate();const invalid=response();await v6.handler(make(undefined),invalid,{pool,scope:'principal:geral'});
 assert.equal(invalid.headers['X-Cache'],'MISS');
});
test('SQL mantem valores fornecidos fora do texto da consulta',()=>{
 const injection="' OR 1=1 --";
 const q=v6.statement({tela:'encerradas',filters:{ss:injection},macro:[],municipios:[],equipe:'',limit:5,offset:0},ids);
 assert(!q.text.includes(injection));assert(q.values.includes('%'+injection+'%'));
});
