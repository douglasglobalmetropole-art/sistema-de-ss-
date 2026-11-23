'use strict';
const assert=require('node:assert/strict');
const {registrar,validarItens,validarRegistros,estadoIgual,SQL}=require('./umov-manual-cgm');
const reg=[{ss:'11/26-012345-01',tarefa:123}];
const row={tsk_id:123,ss:reg[0].ss,cidade:'VILA VELHA',situacao_campo:'Retornada de Campo',status_integracao:''};
let tests=0;
function ok(name,fn){fn();tests++;}
ok('ID valido',()=>assert.equal(validarItens(reg)[0].tarefa,123));
ok('ID duplicado bloqueado',()=>assert.throws(()=>validarItens([...reg,...reg]),/repetidas/));
ok('SS invalida bloqueada',()=>assert.throws(()=>validarItens([{ss:'abc',tarefa:123}]),/invalida/));
ok('status anterior diferente bloqueado',()=>assert.throws(()=>validarRegistros(reg,[{...row,status_integracao:'Rejeitada'}],'Baixada',null,x=>x),/ja possui/));
ok('divisao diferente bloqueada',()=>assert.throws(()=>validarRegistros(reg,[row],'Baixada',['CARIACICA'],x=>x),/divisao/));
ok('tarefa SS divergente bloqueada',()=>assert.throws(()=>validarRegistros(reg,[{...row,ss:'11/26-999999-02'}],'Baixada',null,x=>x),/divergente/));
ok('baixa manual so retornada',()=>assert.throws(()=>validarRegistros(reg,[{...row,situacao_campo:'Em Campo'}],'Baixada',null,x=>x),/situacao/));
ok('rejeicao manual na recepcao',()=>assert.equal(validarRegistros(reg,[{...row,situacao_campo:'Pendente de envio para campo'}],'Duplicada',null,x=>x).size,1));
ok('confirmar Baixada no Siscom e Baixada',()=>assert(estadoIgual('Baixada no Siscom','Baixada')));
ok('confirmar Duplicada',()=>assert(estadoIgual('Duplicada','Duplicada')));
ok('situation false',()=>assert(!estadoIgual('Rejeitada','Duplicada')));
ok('SQL fisico consulta readback',()=>assert(SQL.includes('customfieldvalue')&&SQL.includes('situacao_campo')));
async function chamadas(payload,options={}){
 let writes=0,rows=options.rows??[row],req={body:payload,divisaoSS:options.divisaoSS??null};
 const res={statusCode:200,set(){return this;},status(n){this.statusCode=n;return this;},json(x){this.data=x;return this;}};
 const routes={};
 const app={post(path,fn){routes[path]=fn}};
 registrar(app,{pool:{query:async()=>({rows})},autorizado:()=>options.auth!==false,podeEscrever:()=>options.write!==false,origemOk:()=>options.origin!==false,
 postUmovXml:async()=>{writes++;},identificadorSituacao:s=>s,xmlEscape:x=>x,cidadesPermitidas:()=>options.divisaoSS?.cidades||null,normalizarCidade:x=>x});
 await routes['/api/umov/manual-status'](req,res);
 return {writes,res,routes};
}
(async()=>{
 const good={processo:'MANUAL_UMOV',confirmacao:'CONFIRMAR STATUS UMOV',status:'Baixada',itens:reg};
 let r=await chamadas(good);assert.equal(r.writes,1);assert.equal(r.res.data.ok,true);tests++;
 r=await chamadas(good,{auth:false});assert.equal(r.writes,0);assert.equal(r.res.statusCode,401);tests++;
 r=await chamadas(good,{write:false});assert.equal(r.writes,0);assert.equal(r.res.statusCode,403);tests++;
 r=await chamadas(good,{origin:false});assert.equal(r.writes,0);assert.equal(r.res.statusCode,403);tests++;
 r=await chamadas({...good,confirmacao:'x'});assert.equal(r.writes,0);assert.equal(r.res.statusCode,400);tests++;
 r=await chamadas({...good,status:'Rejeitadinha'});assert.equal(r.writes,0);assert.equal(r.res.statusCode,400);tests++;
 r=await chamadas(good,{rows:[{...row,status_integracao:'Rejeitada'}]});assert.equal(r.writes,0);assert.equal(r.res.statusCode,409);tests++;
 r=await chamadas({...good,status:'Duplicada'},{rows:[{...row,situacao_campo:'Pendente de envio para campo'}]});assert.equal(r.writes,1);tests++;
 r=await chamadas({...good,status:'Rejeitada'},{rows:[{...row,status_integracao:'Rejeitada'}]});assert.equal(r.writes,0);assert.equal(r.res.data.resultados[0].ja_aplicado,true);tests++;
 r=await chamadas(good,{divisaoSS:{cidades:['CARIACICA']}});assert.equal(r.writes,0);assert.equal(r.res.statusCode,409);tests++;
 console.log('OK: '+tests+' testes unitarios de processo manual uMov. Sem chamadas reais a SISCOM/uMov.');
})().catch(e=>{console.error(e);process.exitCode=1});
