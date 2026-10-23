// Teste offline: nenhum acesso à internet, ao Supabase ou ao SISCOM.
const fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict'),path=require('node:path');
const worker=fs.readFileSync(path.join(__dirname,'gateway','worker.js'),'utf8');
const sid='a'.repeat(64),secret='test-signing-secret-'.repeat(3),token='mock-only';
const row={codAtendimento:106136,codigoMacro:3900,codigoSSAnterior:null,descricaoMacro:'SERVIÇOS COMPLEMENTARES',endereco:'RUA TESTE',refAtendimento:202608,seqSS:2,ssFormatada:'08/26-106136-02',unidadeExecutoraResumidaDTO:{cdExecutor:9,dcExecutor:'CARIACICA-POLO AGUA'}};
const jobs=[],calls=[];let rejected=false;
function result(body,status=200){return {ok:status>=200&&status<300,status,json:async()=>body,text:async()=>JSON.stringify(body)};}
const fakeFetch=async(url,options={})=>{
 const u=String(url),method=options.method||'GET';calls.push({u,method,body:options.body});
 if(u.includes('/validaSS/'))return result(true);
 if(u.includes('/rejeicaoSolicitacaoServico?'))return result({content:[row]});
 if(u.includes('/listarEquipeIntegrante/'))return result([{cdEquipe:267}]);
 if(u.includes('/solicitacaoServicoDados/evento'))return result(rejected?[{id:1,tipoEventoDTO:{id:4,descricao:'Rejeição'},dataHoraEvento:'2026-10-22T10:54:00.000Z'}]:[]);
 if(u.endsWith('/rejeicaoSolicitacaoServico')&&method==='PUT'){rejected=true;return result({ok:true});}
 throw Error('URL inesperada no mock: '+u);
};
class Q {
 constructor(){this.action='select';this.filters=[];this.limitN=100;this.values={};this.wantsSelect=false;}
 select(){this.wantsSelect=true;return this}
 eq(k,v){this.filters.push([k,v]);return this}
 order(){return this}
 limit(n){this.limitN=n;return this}
 update(v){this.action='update';this.values=v;return this}
 then(ok,fail){
  try{
   const rows=jobs.filter(j=>this.filters.every(([k,v])=>j[k]===v));
   if(this.action==='update'){
    for(const j of rows)Object.assign(j,this.values);
    return Promise.resolve({data:this.wantsSelect?rows.map(j=>({id:j.id})):null,error:null}).then(ok,fail);
   }
   return Promise.resolve({data:rows.slice(0,this.limitN),error:null}).then(ok,fail);
  }catch(e){return Promise.reject(e).then(ok,fail)}
 }
}
const ctx=vm.createContext({
 require:n=>n==='dotenv'?{config(){}}:n==='@supabase/supabase-js'?{createClient:()=>({from:()=>new Q()})}:require(n),
 process:{env:{SUPABASE_URL:'https://mock.invalid',SUPABASE_SECRET_KEY:'mock',SISCOM_GATEWAY_SIGNING_SECRET:secret,SISCOM_INDIVIDUAL_WRITE_ENABLED:'true',SISCOM_REJEICAO_WRITE_ENABLED:'true'},platform:'win32',exit:()=>{throw Error('exit inesperado')}},
 console:{log(){},error(){}},fetch:fakeFetch,AbortSignal,URL,URLSearchParams,Buffer,Date,Number,String,JSON,Array,Object,Set,Map,Error,RegExp,Promise,setInterval(){},setTimeout
});
function canonical(v){if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';if(v&&typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';return JSON.stringify(v)}
function add(operation,payload){const exp=Date.now()+120000;const mac=crypto.createHmac('sha256',secret).update(canonical({operation,sid,exp,payload})).digest('hex');const id='job-'+(jobs.length+1);jobs.push({id,operation,status:'pendente',payload:{...payload,__siscom_identity:{sid,exp,mac}}});return jobs.at(-1)}
(async()=>{
 vm.runInContext(worker,ctx,{filename:'worker.js'});
 await new Promise(resolve=>setTimeout(resolve,10)); // aguarda chamada inicial do worker sem tarefas
 vm.runInContext(`individualSessions.set('${sid}',{token:'${token}',expires:Date.now()+3600000})`,ctx);
 const a=add('validar_ss_rejeicao',{numero_ss:row.ssFormatada});
 await vm.runInContext('processar()',ctx);
 assert.equal(a.status,'concluido');assert.equal(a.result.validada,true);assert.equal(calls.filter(c=>c.method==='PUT').length,0);
 const b=add('rejeitar_ss_real',{numero_ss:row.ssFormatada,motivo:'NAO_EXECUCAO',equipe:267,inicio:'2026-10-22T10:53:00.000Z',fim:'2026-10-22T10:54:00.000Z',observacao:'Não há serviço pendente no local'});
 await vm.runInContext('processar()',ctx);
 assert.equal(b.status,'concluido');assert.equal(b.result.status_rejeicao,'CONFIRMADA');
 const puts=calls.filter(c=>c.method==='PUT');assert.equal(puts.length,1);
 const body=JSON.parse(puts[0].body);assert.equal(body.flagModoRejeicao,false);assert.equal(body.motivoNaoExecucaoDTO.id,44);assert.equal(body.listSolicitacaoServicoRejeitoDTO[0].ssFormatada,row.ssFormatada);
 const c=add('rejeitar_ss_real',{numero_ss:row.ssFormatada,motivo:'NAO_EXECUCAO',equipe:267,inicio:'2026-10-22T10:53:00.000Z',fim:'2026-10-22T10:54:00.000Z',observacao:'Não há serviço pendente no local'});
 await vm.runInContext('processar()',ctx);
 assert.equal(c.status,'erro');assert.equal(c.error_message.includes('já registrada'),true);assert.equal(calls.filter(c=>c.method==='PUT').length,1);
 console.log('PASSOU: validação oficial simulada, PUT único, payload id=44, confirmação por evento 4 e bloqueio de reenvio.');
})().catch(e=>{console.error(e);process.exitCode=1});
