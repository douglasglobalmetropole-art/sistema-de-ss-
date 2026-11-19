'use strict';

const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const {consultarSequenciasFotos}=require('../umov-materiais');

let db;
let chamadas;
const pool = {
  query(query) {
    chamadas.push(query);
    return db.query(query.text, query.values);
  }
};

before(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE SCHEMA u45468;
    CREATE TABLE u45468.local (loc_id bigint PRIMARY KEY, loc_integrationid varchar(15), loc_city text);
    CREATE INDEX ON u45468.local (loc_integrationid);
    CREATE TABLE u45468.task (
      tsk_id bigint PRIMARY KEY,
      loc_id bigint,
      tss_id int,
      tsk_lastexecutiondatehour timestamp,
      tsk_accesstoken varchar
    );
    CREATE INDEX ON u45468.task (loc_id);
    INSERT INTO u45468.local VALUES
      (1,'11/26-047505-00',' vitória '),
      (2,'11/26-047505-01','SERRA'),
      (3,'11/26-047505-02','Vitória'),
      (4,'11/26-047505-03','Vitória'),
      (5,'11/26-047504-01','Vitória');
    INSERT INTO u45468.task VALUES
      (1,1,50,'2026-11-05','antigo-um'),
      (2,1,50,'2026-11-06','antigo-dois'),
      (3,2,50,'2026-11-07','outra-divisao'),
      (4,3,50,'2026-11-08','atual'),
      (5,1,20,'2026-11-09','nao-concluido'),
      (7,4,50,'2026-11-10','posterior'),
      (8,5,50,'2026-11-11','outra-ss');
  `);
});

after(async () => {
  await db.close();
});

test('consulta sequências exatas, concluídas e na ordem usando a tabela de tarefas', async () => {
  chamadas = [];
  const rows = await consultarSequenciasFotos(pool, '11/26-047505-02');
  assert.deepEqual(rows.map(row => Number(row.tarefa)), [3, 2, 1]);
  assert.equal(chamadas.length, 1);
  assert.doesNotMatch(chamadas[0].text, /dbout_task/);
});

test('valida a cidade da SS atual e filtra cada sequência pelo escopo da divisão', async () => {
  const rows = await consultarSequenciasFotos(pool, '11/26-047505-02', ['VITORIA']);
  assert.deepEqual(rows.map(row => Number(row.tarefa)), [2, 1]);
  assert.equal(await consultarSequenciasFotos(pool, '11/26-047505-02', ['SERRA']), null);
  assert.deepEqual(await consultarSequenciasFotos(pool, '11/26-047505-00', ['VITORIA']), []);
  assert.equal(await consultarSequenciasFotos(pool, '11/26-047505-00', ['SERRA']), null);
});

test('completa tokens vazios ou inválidos na vista sem repetir os relatórios físicos', async () => {
  chamadas = [];
  await db.exec(`
    INSERT INTO u45468.task VALUES
      (6,1,50,'2026-11-09',''),
      (9,1,50,'2026-11-10','token inválido'),
      (10,1,50,'2026-11-11',NULL);
    CREATE TABLE u45468.tokens_legados (id bigint, token text);
    INSERT INTO u45468.tokens_legados VALUES
      (1,'antigo-um'),(3,'outra-divisao'),(6,'recuperado'),(6,'recuperado'),(9,'recuperado-dois');
    CREATE VIEW u45468.dbout_task AS
      SELECT t.tsk_id, t.tss_id, l.token AS tsk_accesstoken
      FROM u45468.task t
      JOIN u45468.tokens_legados l ON l.id = t.tsk_id;
  `);
  const rows = await consultarSequenciasFotos(pool, '11/26-047505-02', ['VITORIA']);
  assert.deepEqual(rows.map(row => Number(row.tarefa)), [9, 6, 2, 1]);
  assert.equal(chamadas.length, 2);
  assert.deepEqual(chamadas[1].values[0].map(Number), [10, 9, 6]);
});

test('consulta token na vista legada quando a coluna física não existe', async () => {
  chamadas = [];
  await db.exec('ALTER TABLE u45468.task DROP COLUMN tsk_accesstoken');
  const rows = await consultarSequenciasFotos(pool, '11/26-047505-02', ['VITORIA']);
  assert.deepEqual(rows.map(row => Number(row.tarefa)), [9, 6, 1]);
  assert.equal(chamadas.length, 2);
  assert.match(chamadas[1].text, /JOIN LATERAL/);
});

test('preserva os relatórios físicos quando a vista não está disponível', async () => {
  chamadas = [];
  await db.exec(`
    DROP VIEW u45468.dbout_task;
    ALTER TABLE u45468.task ADD COLUMN tsk_accesstoken varchar;
    UPDATE u45468.task SET tsk_accesstoken = 'antigo-um' WHERE tsk_id = 1;
  `);
  const rows = await consultarSequenciasFotos(pool, '11/26-047505-02', ['VITORIA']);
  assert.deepEqual(rows.map(row => Number(row.tarefa)), [1]);
  assert.equal(chamadas.length, 2);
});
