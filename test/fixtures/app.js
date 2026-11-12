'use strict';
const {database}=require('./database');
async function fixtureApp(){
 const main=await database(),lote=await database();
 await main.exec("UPDATE u45468.local SET loc_city='CARIACICA' WHERE loc_city='VITÓRIA'");
 await lote.exec("UPDATE u45468.local SET loc_city='SERRA' WHERE loc_city='VILA VELHA'");
 let calls=0;
 const pg=require('pg'),OriginalPool=pg.Pool;
 process.env.DB_NAME='fixture-principal';process.env.DB_NAME_LOTE1='fixture-lote1';
 process.env.UMOV_OIDC_ENABLED='false';process.env.CP_PERSISTENT_CACHE_ENABLED='false';
 class FixturePool{
  constructor(options){this.db=options.database==='fixture-lote1'?lote:main;}
  async connect(){return {query:this.query.bind(this),release(){}};}
  async query(query,values){
   calls++;
   let text=typeof query==='string'?query:query.text;
   text=text.replaceAll('"u46915".','u45468.');
   // As views dbout de producao nao fazem parte da fixture SQL fisica.
   if(/u45468\.dbout_/.test(text))return {rows:[]};
   return this.db.query(text,values||(typeof query==='object'?query.values:[])||[]);
  }
 }
 pg.Pool=FixturePool;
 const app=require('../../server');pg.Pool=OriginalPool;
 return {app,getCalls:()=>calls,async close(){await main.close();await lote.close();}};
}
module.exports={fixtureApp};
