'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
for(const file of ['worker.js','integracoes/siscom/worker.js']){
 for(const reservation of ['owned','lost','failed']){
  test(file+' reserva '+reservation+' antes de atualizar status',async()=>{
   let processOne;const updates=[];
   const supabase={from(){
    let body=null;
    const chain={select(){return this;},eq(){return this;},order(){return this;},limit(){return this;},update(value){body=value;updates.push(value);return this;},
     then(resolve,reject){
      let result;
      if(!body)result={data:[{id:'one',operation:'healthcheck',payload:{}}]};
      else if(body.status==='processando')result=reservation==='failed'?{error:Error('reservation failed')}:{data:reservation==='owned'?[{id:'one'}]:[]};
      else result={data:[]};
      return Promise.resolve(result).then(resolve,reject);
     }};return chain;
   }};
   const sandbox={console:{log(){},error(){}},process:{env:{SUPABASE_URL:'https://example.test',SUPABASE_SECRET_KEY:'test-key'},platform:'linux',once(){}},setTimeout,Buffer,URL,URLSearchParams,AbortSignal,
    require(name){
     if(name==='dotenv')return {config(){}};
     if(name==='@supabase/supabase-js')return {createClient:()=>supabase};
     if(name.endsWith('/lib/worker-polling'))return {fromEnv(fn){processOne=fn;return {stop(){}};}};
     return require(name);
    }};
   vm.runInNewContext(fs.readFileSync(file,'utf8'),sandbox,{filename:file});
   const worked=await processOne();
   assert.equal(updates[0].status,'processando');
   if(reservation==='owned'){assert.equal(worked,true);assert.equal(updates[1].status,'concluido');assert.equal(updates.length,2);}
   else assert.equal(updates.length,1,'nao alterar job reservado por outro processo');
  });
 }
}
