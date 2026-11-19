'use strict';

const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const {consultarRelatoriosAgrupados}=require('../lib/relatorios-agrupados');

let db;
let chamadas;
const pool={
  query(q){
    chamadas.push(q);
    return db.query(q.text,q.values);
  }
};
const ss='06/26-025853-03';
const normalizarCidade=cidade=>cidade.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim();
const opcoes={cidades:null,normalizarCidade,host:'exemplo.umov.me'};
const consultar=(extra={})=>consultarRelatoriosAgrupados(pool,ss,{...opcoes,...extra});

before(async()=>{
  db=new PGlite();
  await db.exec(`
   CREATE SCHEMA u45468;
   CREATE TABLE u45468.local(loc_id bigint PRIMARY KEY,loc_integrationid varchar(24),loc_city text);
   CREATE INDEX ON u45468.local (loc_integrationid);
   CREATE TABLE u45468.task(tsk_id bigint PRIMARY KEY,loc_id bigint,tss_id int,tsk_accesstoken text);
   CREATE INDEX ON u45468.task (loc_id,tsk_id DESC);
   INSERT INTO u45468.local VALUES
    (1,'06/26-025853-00','Vitória'),
    (2,'06/26-025853-01','Vitória'),
    (3,'06/26-025853-02','Vitória'),
    (4,'06/26-025853-03','Vitória'),
    (5,'06/26-025853-04','Vila Velha'),
    (6,'06/26-025853-02 inv','Vila Velha'),
    (7,'06/26-025854-02','Vila Velha');
   INSERT INTO u45468.task VALUES
    (1,1,50,'primeiro'),
    (2,1,50,'segundo'),
    (3,2,10,'nao-concluido'),
    (4,4,50,'atual'),
    (5,5,50,'posterior'),
    (6,6,50,'formato-invalido'),
    (7,7,50,'outra-ss');
  `);
});
after(async()=>{await db.close()});

test('agrupa todas as tarefas válidas e mantém as sequências sem relatório em uma consulta',async()=>{
  chamadas=[];
  const result=await consultar({cidades:['VITORIA']});
  assert.equal(result.status,200);
  assert.equal(result.base,'06/26-025853');
  assert.deepEqual(result.sequencias.map(x=>[x.ss,x.tarefa]),[
    ['06/26-025853-00',1],['06/26-025853-00',2],['06/26-025853-01',null],
    ['06/26-025853-02',null],['06/26-025853-03',4]
  ]);
  assert.equal(result.sequencias[4].link,'https://exemplo.umov.me/CenterWeb/report/schedule/4/atual');
  assert.equal(chamadas.length,1);
  assert.doesNotMatch(chamadas[0].text,/dbout_task/);
});

test('valida o município mesmo em uma sequência sem tarefa e retorna vazio fora de divisão',async()=>{
  await db.exec("UPDATE u45468.local SET loc_city='Vila Velha' WHERE loc_id=3");
  chamadas=[];
  assert.equal((await consultar({cidades:['VITORIA']})).status,403);
  assert.equal(chamadas.length,1);
  assert.equal((await consultarRelatoriosAgrupados(pool,'06/26-000000-00', {...opcoes,cidades:['VITORIA']})).status,404);
  assert.deepEqual((await consultarRelatoriosAgrupados(pool,'06/26-000000-00',opcoes)).sequencias,[]);
  await db.exec("UPDATE u45468.local SET loc_city='Vitória' WHERE loc_id=3");
});

test('completa apenas os tokens ausentes pela vista legada sem duplicar PDFs',async()=>{
  await db.exec(`
    INSERT INTO u45468.task VALUES (8,2,50,NULL),(9,3,50,'token inválido');
    CREATE TABLE u45468.tokens_legados(id bigint, token text);
    INSERT INTO u45468.tokens_legados VALUES (1,'desnecessario'),(8,'recuperado'),(8,'recuperado');
    CREATE VIEW u45468.dbout_task AS
      SELECT t.tsk_id,t.tss_id,l.token AS tsk_accesstoken
      FROM u45468.task t JOIN u45468.tokens_legados l ON l.id=t.tsk_id;
  `);
  chamadas=[];
  const result=await consultar();
  assert.deepEqual(result.sequencias.map(x=>x.tarefa),[1,2,8,null,4]);
  assert.equal(result.sequencias[0].link,'https://exemplo.umov.me/CenterWeb/report/schedule/1/primeiro');
  assert.equal(chamadas.length,2);
  assert.deepEqual(chamadas[1].values,[[8,9]]);
});

test('funciona com token disponível apenas na vista e preserva o limite de segurança',async()=>{
  await db.exec('ALTER TABLE u45468.task DROP COLUMN tsk_accesstoken');
  const result=await consultar();
  assert.deepEqual(result.sequencias.map(x=>x.tarefa),[1,8,null,null]);
  await db.exec(`
    INSERT INTO u45468.local
    SELECT n,'06/26-025853-00','Vitória' FROM generate_series(100,301) n;
  `);
  assert.equal((await consultar()).status,413);
});
