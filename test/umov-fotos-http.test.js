'use strict';
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {createHmac}=require('node:crypto');
const {fixtureApp}=require('./fixtures/app');
const localFetch=globalThis.fetch;
const secret='local-test-session-secret-for-photo-fixture';
let fixture,server,base;
const consultas=[];
const html='<img src="/CenterWeb/logo.png"><img width="12" src="/icon.png">' +
  '<img data-src="/media/001.jpg" src="/media/placeholder.gif">' +
  '<img src="https://cdn.umov.me/galeria/002.jpg">';
before(async()=>{
 Object.assign(process.env,{
  SESSION_SECRET:secret,
  SISCOM_GATEWAY_SIGNING_SECRET:secret,
  SISCOM_AUTH_PUBLIC_KEY:'test-only',
  SUPABASE_URL:'https://example.invalid',
  SUPABASE_SECRET_KEY:'test-only',
  UMOV_REPORT_HOST_LOTE1:'lote-fixture.umov.me'
 });
 fixture=await fixtureApp();
 server=fixture.app.listen(0,'127.0.0.1');
 await new Promise(resolve=>server.once('listening',resolve));
 base='http://127.0.0.1:'+server.address().port;
 globalThis.fetch=async(url,options)=>{
  consultas.push({url:String(url),options});
  return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8'}});
 };
});
after(async()=>{
 globalThis.fetch=localFetch;
 if(server)await new Promise(resolve=>server.close(resolve));
 if(fixture)await fixture.close();
});
const payload=Buffer.from(JSON.stringify({role:'siscom_individual',sid:'f'.repeat(64),exp:Date.now()+300000})).toString('base64url');
const cookie='ss_siscom_individual='+payload+'.'+createHmac('sha256',secret).update(payload).digest('base64url');
function consultar(divisao,tarefa,opcoes={}){
 const ss='11/26-'+String(tarefa).padStart(6,'0')+'-01';
 return localFetch(base+divisao+'/api/relatorio-fotos',{
  method:'POST',
  headers:{Origin:base.replace('http:','https:'),Cookie:cookie,'Content-Type':'application/json',...opcoes},
  body:JSON.stringify({ss,tarefa,modo:'direto'})
 });
}
test('fotos atuais de ODVV e Lote 1 usam HTML direto e o banco de cada divisão',async()=>{
 for(const [divisao,tarefa,host] of [
  ['/ODVV',2,'consglobalmetropole.umov.me'],['/ODVT',1,'lote-fixture.umov.me'],
  ['/ODLN',2,'lote-fixture.umov.me'],['/lote1',1,'lote-fixture.umov.me']
 ]){
  const antes=fixture.getCalls();
  const response=await consultar(divisao,tarefa);
  assert.equal(response.status,200,divisao);
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.deepEqual(await response.json(),{
   ok:true,fotos:['https://'+host+'/media/001.jpg','https://cdn.umov.me/galeria/002.jpg'],
   origem:'direta',truncado:false,total:2
  });
  assert.equal(fixture.getCalls()-antes,1);
  assert.equal(consultas.at(-1).url,'https://'+host+'/CenterWeb/report/schedule/'+tarefa+'/token-'+tarefa);
  assert.equal(consultas.at(-1).options.redirect,'manual');
 }
 const before=consultas.length;
 await consultar('/ODVV',2);
 assert.equal(consultas.length,before,'o cache reaproveita o manifesto da mesma divisão');
});
test('sessão, origem e divisão são verificadas antes da leitura do relatório',async()=>{
 const before=consultas.length;
 assert.equal((await consultar('/ODVV',2,{Cookie:''})).status,401);
 assert.equal((await consultar('/ODVV',2,{Origin:'https://outro.example'})).status,401);
 assert.equal((await consultar('/ODVV',1)).status,403);
 assert.equal((await consultar('/ODVT',2)).status,403);
 assert.equal(consultas.length,before);
});
test('Lote 1 informa configuração faltante sem consultar outro domínio',async()=>{
 const before=consultas.length;
 delete process.env.UMOV_REPORT_HOST_LOTE1;
 const response=await consultar('/ODVT',1);
 assert.equal(response.status,503);
 assert.equal((await response.json()).code,'HOST_RELATORIO_LOTE1');
 assert.equal(consultas.length,before);
});
