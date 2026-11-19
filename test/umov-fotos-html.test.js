'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {extrairFontesHtml,consultarFontesFotos}=require('../lib/umov-fotos');
const relatorio=new URL('https://relatorio.umov.me/CenterWeb/report/schedule/1/token');

test('encontra fotos relativas, lazy e CDN sem devolver logos e elementos ocultos',()=>{
 const html=`<base href="/CenterWeb/">
  <img src="&#x2F;marca/logo.png"><div hidden><img src="/nao-mostrar.png"></div>
  <img data-src="Fotos/primeira.jpg?a=1&amp;b=2" src="pixel.gif">
  <img src="//cdn.umov.me/segunda.webp"><img src="/icon.svg">`;
 assert.deepEqual(extrairFontesHtml(html,relatorio),[
  'https://relatorio.umov.me/CenterWeb/Fotos/primeira.jpg?a=1&b=2',
  'https://cdn.umov.me/segunda.webp'
 ]);
});
test('mantém fallback para relatórios com URLs fora dos domínios aprovados',()=>{
 assert.deepEqual(extrairFontesHtml('<img src="/foto.jpg"><img src="https://external.example/foto.jpg">',relatorio),[]);
 assert.deepEqual(extrairFontesHtml('<img src="javascript:alert(1)">',relatorio),[]);
});
test('não segue redirecionamento do relatório para outro domínio',async t=>{
 const fetch=t.mock.method(globalThis,'fetch',()=>new Response(null,{status:302,headers:{Location:'https://external.example/arquivo'}}));
 assert.deepEqual(await consultarFontesFotos(relatorio),[]);
 assert.equal(fetch.mock.callCount(),1);
});
