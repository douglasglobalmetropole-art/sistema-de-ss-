'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const zlib=require('node:zlib');
const {create}=require('../cp-fast-cache');
test('cache comprimido continua compativel com dados antigos e rejeita payload invalido',async()=>{
 const original=global.fetch;let record;
 global.fetch=async(url,options)=>{
  if(options.method==='POST'){record=JSON.parse(options.body);return {ok:true};}
  return {ok:true,json:async()=>[record]};
 };
 try{
  const cache=create({url:'https://example.test',key:'test-key-long-enough'});
  const payload={dados:[{ss:'11/26-000001-01',texto:'x'.repeat(10000)}],truncado:false};
  assert.equal(await cache.save('page',payload),true);
  assert.deepEqual(JSON.parse(zlib.gunzipSync(Buffer.from(record.payload_b64,'base64'))),payload);
  assert.deepEqual((await cache.load('page')).payload,payload);
  record.payload_b64=zlib.gzipSync(JSON.stringify({dados:[]})).toString('base64');
  assert.equal(await cache.load('page'),null);
  record.cached_at='2020-01-01';assert.equal(await cache.load('page'),null);
 }finally{global.fetch=original;}
});
