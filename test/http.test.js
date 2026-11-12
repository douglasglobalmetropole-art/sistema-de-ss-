'use strict';
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {fixtureApp}=require('./fixtures/app');
let fixture,server,base;
before(async()=>{fixture=await fixtureApp();server=fixture.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port;});
after(async()=>{if(server)await new Promise(r=>server.close(r));if(fixture)await fixture.close();});
test('HTTP real: gzip, cache, invalidacao e isolamento entre lotes/divisoes',async()=>{
 const search='/api/pesquisa-global?tela=campo&limit=50';
 let response=await fetch(base+search,{headers:{'Accept-Encoding':'gzip'}});
 assert.equal(response.status,200);assert.equal(response.headers.get('content-encoding'),'gzip');
 assert((await response.json()).rows.length>0);
 response=await fetch(base+search);assert.equal(response.headers.get('x-cache'),'HIT');
 await fetch(base+'/api/auth/logout',{method:'POST'});
 response=await fetch(base+search);assert.equal(response.headers.get('x-cache'),'MISS');
 for(const [prefix,allowed] of [['ODVV',['VILA VELHA']],['ODVT',['VITÓRIA']],['ODLN',['SERRA']]]){
  response=await fetch(base+'/'+prefix+search);
  assert.equal(response.status,200,prefix);
  const data=await response.json();assert(data.rows.length>0,prefix);
  assert(data.rows.every(row=>allowed.includes(row.cidade)),prefix);
 }
 const a=await fetch(base+search).then(r=>r.json());
 const b=await fetch(base+'/lote1'+search).then(r=>r.json());
 assert(a.rows.every(r=>!['SERRA','VITÓRIA'].includes(r.cidade)));
 assert(b.rows.every(r=>['SERRA','VITÓRIA'].includes(r.cidade)));
});
test('catalogos compartilham consulta e assets podem usar cache do navegador',async()=>{
 const before=fixture.getCalls();
 const responses=await Promise.all(Array.from({length:20},()=>fetch(base+'/api/macros').then(r=>r.json())));
 assert(responses.every(r=>r.ok));assert.equal(fixture.getCalls()-before,1);
 const asset=await fetch(base+'/duplicidades-global.js');assert.equal(asset.status,200);assert.match(asset.headers.get('cache-control'),/max-age=3600/);
 const html=await fetch(base+'/');assert.equal(html.status,200);assert.equal(html.headers.get('cache-control'),'no-cache');
 for(const path of ['/ODVV','/ODVT','/lote1']){
  const page=await fetch(base+path);assert.equal(page.status,200,path);assert((await page.text()).includes(path+'/api/'));
 }
});
