'use strict';
const {PGlite}=require('@electric-sql/pglite');
async function database(count=180){
 if(!Number.isSafeInteger(count)||count<1||count>100000)throw Error('Invalid fixture size');
 const db=new PGlite();
 await db.exec(`CREATE SCHEMA u45468;
 CREATE TABLE u45468.task(tsk_id bigint PRIMARY KEY,loc_id bigint,age_id bigint,tty_id bigint,tss_id int,tsk_situation text,tsk_insertdatehour timestamp,tsk_lastexecutiondatehour timestamp,tsk_realinitialdatehour timestamp,tsk_realfinaldatehour timestamp,tsk_accesstoken text);
 CREATE TABLE u45468.local(loc_id bigint PRIMARY KEY,loc_integrationid text,loc_city text,loc_neighborhood text,loc_street text,loc_streetnumber text);
 CREATE TABLE u45468.agent(age_id bigint PRIMARY KEY,age_name text);
 CREATE TABLE u45468.tasktype(tty_id bigint PRIMARY KEY,tty_description text);
 CREATE TABLE u45468.customfield(cfd_id bpchar PRIMARY KEY,cfd_table text,cfd_integrationid text);
 CREATE TABLE u45468.customfieldvalue(cfv_registerid bigint,cfd_id bpchar,cfv_internalvalue text,cfv_externalvalue text);
 CREATE TABLE u45468.customentityvalue(cev_id bigint PRIMARY KEY,cev_description text);
 INSERT INTO u45468.agent VALUES(1,'Equipe 01'),(2,'Equipe 02');
 INSERT INTO u45468.tasktype VALUES(1,'Agua'),(2,'Esgoto');
 INSERT INTO u45468.customfield VALUES('status','task','situacao'),('tags','task','tag'),('setor','local','setor');
 INSERT INTO u45468.customentityvalue VALUES(1,'Baixada no Siscom');
 INSERT INTO u45468.local SELECT n,'11/26-'||lpad(n::text,6,'0')||'-01',CASE WHEN n%2=0 THEN 'VILA VELHA' ELSE 'VITÓRIA' END,'Centro','Rua '||n,'10' FROM generate_series(1,${count}) n;
 INSERT INTO u45468.task SELECT n,n,(n%2)+1,(n%2)+1,50,
 CASE WHEN n%3=0 THEN 'Pendente de envio para campo' WHEN n%3=1 THEN 'Em campo' ELSE 'Retornada de campo' END,
 '2026-11-01'::timestamp+(n||' minutes')::interval,'2026-11-02'::timestamp+(n||' minutes')::interval,'2026-11-02'::timestamp,'2026-11-02'::timestamp,'token-'||n FROM generate_series(1,${count}) n;
 INSERT INTO u45468.customfieldvalue SELECT n,'status',CASE WHEN n%4=0 THEN '1' WHEN n%4=1 THEN 'Rejeitada' ELSE '' END,'' FROM generate_series(1,${count}) n;
 INSERT INTO u45468.customfieldvalue SELECT n,'tags',CASE WHEN n%2=0 THEN 'Urgente' ELSE 'Normal' END,'' FROM generate_series(1,${count}) n;
 INSERT INTO u45468.customfieldvalue SELECT n,'setor','Setor A','' FROM generate_series(1,${count}) n;
 CREATE INDEX task_status_date ON u45468.task(lower(trim(coalesce(tsk_situation,''))),tsk_insertdatehour DESC,tsk_id DESC);
 CREATE INDEX cfv_lookup ON u45468.customfieldvalue(cfv_registerid,cfd_id);
 ANALYZE;`);
 return db;
}
const ids={status:['status'],tags:['tags'],setor:['setor'],hidrometro:[],referencia:[],info:[],esclarecimento:[],servicoExecutado:[],materiais:[]};
module.exports={database,ids};
