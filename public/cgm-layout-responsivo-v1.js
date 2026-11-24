(function(){
'use strict';

const rows=document.getElementById('rows');
const lower=document.getElementById('lower');
const title=document.getElementById('titleSS');

if(!rows||!lower||!title)return;
if(window.__cgmResponsiveInstalled)return;

window.__cgmResponsiveInstalled=true;

const body=document.body;
const table=rows.closest('table');
const wrap=table.closest('.tableScroll');
const pager=document.querySelector('.pager');
const byId=id=>document.getElementById(id);

body.classList.add('cgm-fit');
lower.classList.add('cgm-fit-panel');

const css=document.createElement('style');

css.textContent=`
html:has(body.cgm-fit:not(.tram-mode)),
body.cgm-fit:not(.tram-mode){
 height:100dvh!important;
 max-height:100dvh!important;
 overflow:hidden!important;
}

body.cgm-fit:not(.tram-mode){
 --cgm-panel-width:clamp(350px,30vw,490px);
}

body.cgm-fit:not(.tram-mode) > main{
 display:flex!important;
 flex-direction:column!important;
 height:100dvh!important;
 min-height:0!important;
 width:100%!important;
 margin:0!important;
 padding:8px!important;
 gap:6px!important;
}

body.cgm-fit.panel-open:not(.tram-mode):has(#lower.open) > main{
 width:calc(100% - var(--cgm-panel-width) - 8px)!important;
}

body.cgm-fit:not(.tram-mode) > main>.toolbar{
 flex:0 0 auto!important;
 flex-wrap:wrap!important;
 margin:0!important;
 padding:6px!important;
 gap:5px!important;
 min-width:0!important;
}

body.cgm-fit:not(.tram-mode) > main .toolbar .f{
 min-width:100px!important;
 flex:1 1 120px;
}

body.cgm-fit:not(.tram-mode) > main .toolbar .tab,
body.cgm-fit:not(.tram-mode) > main .toolbar .btn{
 height:32px!important;
 padding:0 9px!important;
 font-size:10px!important;
}

body.cgm-fit:not(.tram-mode) > main>.box{
 display:flex!important;
 flex-direction:column!important;
 flex:1 1 0!important;
 min-height:0!important;
 min-width:0!important;
 margin:0!important;
}

body.cgm-fit:not(.tram-mode) > main>.box>.tableScroll{
 flex:1 1 0!important;
 height:auto!important;
 min-height:0!important;
 max-height:none!important;
 overflow:hidden!important;
}

body.cgm-fit:not(.tram-mode) > main>.box>.tableScroll.cgm-large{
 overflow:auto!important;
}

body.cgm-fit:not(.tram-mode) > main .tableScroll>table{
 width:100%!important;
 min-width:0!important;
 table-layout:fixed!important;
}

body.cgm-fit:not(.tram-mode) > main .tableScroll th,
body.cgm-fit:not(.tram-mode) > main .tableScroll td{
 padding:5px 6px!important;
 font-size:11px!important;
}

body.cgm-fit:not(.tram-mode) > main .tableScroll .check{
 width:30px!important;
 min-width:30px!important;
}

body.cgm-fit:not(.tram-mode) > main .tableScroll th[data-key="ss"]{
 width:130px!important;
}

body.cgm-fit:not(.tram-mode) > main .tableScroll .filter input{
 height:25px!important;
 min-width:0!important;
}

body.cgm-fit #rows td.ss{
 cursor:pointer!important;
 color:#0864ac!important;
 text-decoration:underline;
 text-underline-offset:2px;
}

body.cgm-fit #rows td.ss:hover{
 background:#dceeff!important;
}

body.cgm-fit #rows tr.cgm-row-off{
 display:none!important;
}

body.cgm-fit:not(.tram-mode) > main .pager{
 flex:0 0 auto!important;
 flex-wrap:wrap!important;
 padding:5px 8px!important;
 gap:5px!important;
}

body.cgm-fit:not(.tram-mode) > main>.box>.hint{
 display:none!important;
}

.cgm-visual-pager{
 display:flex;
 align-items:center;
 gap:5px;
 font-size:11px;
}

.cgm-visual-pager button{
 border:1px solid #bed4e8;
 color:#07599a;
 background:white;
 border-radius:4px;
 height:26px;
 cursor:pointer;
}

.cgm-visual-pager button:disabled{
 opacity:.4;
 cursor:default;
}

/* PAINEL LATERAL AJUSTADO AO VIEWPORT */

html body.cgm-fit.panel-open:has(#lower.open) #lower.open{
 position:fixed!important;
 top:6px!important;
 right:6px!important;
 bottom:6px!important;
 left:auto!important;
 width:var(--cgm-panel-width,400px)!important;
 height:calc(100dvh - 12px)!important;
 max-height:calc(100dvh - 12px)!important;
 min-height:0!important;
 display:flex!important;
 flex-direction:column!important;
 align-items:stretch!important;
 gap:6px!important;
 padding:7px!important;
 margin:0!important;
 overflow:hidden!important;
 background:#eef4fa!important;
 border:1px solid #c5d8ea!important;
 border-radius:9px!important;
 z-index:55!important;
}

#lower .cgm-panel-head{
 order:-10;
 flex:0 0 auto;
 display:flex;
 align-items:center;
 justify-content:space-between;
 padding:7px 10px;
 background:#08477f;
 color:white;
 border-radius:6px;
 font-weight:800;
 font-size:13px;
}

#lower .cgm-panel-head button{
 float:none!important;
 position:static!important;
 color:white!important;
 background:#ffffff25!important;
 cursor:pointer;
}

#lower .cgm-panel-tabs{
 order:-9;
 flex:0 0 auto;
 display:flex;
 gap:4px;
}

#lower .cgm-panel-tabs button{
 flex:1;
 min-width:0;
 height:30px;
 padding:3px;
 border:1px solid #c5d9ec;
 border-radius:5px;
 background:white;
 color:#164d7f;
 font-size:11px;
 font-weight:700;
 cursor:pointer;
}

#lower .cgm-panel-tabs button.active{
 background:#086aba;
 border-color:#086aba;
 color:white;
}

html body.cgm-fit.panel-open:has(#lower.open)
#lower.open>.cgm-stage-hidden,
html body.cgm-fit.panel-open:has(#lower.open)
#lower.open>[hidden]{
 display:none!important;
}

html body.cgm-fit.panel-open:has(#lower.open)
#lower.open>.cgm-stage:not(.cgm-stage-hidden):not([hidden]){
 order:0!important;
 flex:1 1 0!important;
 width:100%!important;
 min-width:0!important;
 min-height:0!important;
 height:auto!important;
 max-height:none!important;
 margin:0!important;
 padding:8px!important;
 overflow:hidden!important;
 background:white!important;
 border:1px solid #d1e1ef!important;
 border-radius:6px!important;
}

html body.cgm-fit.panel-open:has(#lower.open)
#lower.open .cgm-details>h3{
 display:none!important;
}

html body.cgm-fit.panel-open:has(#lower.open)
#lower.open .cgm-details .details{
 display:grid!important;
 grid-template-columns:repeat(2,minmax(0,1fr))!important;
 gap:4px 7px!important;
}

html body.cgm-fit.panel-open:has(#lower.open)
#lower.open .cgm-details .field{
 display:flex!important;
 flex-direction:column!important;
 gap:2px!important;
 padding:4px!important;
 margin:0!important;
 min-height:0!important;
 background:#f4f8fc!important;
 border:0!important;
 border-radius:3px!important;
}

html body.cgm-fit.panel-open:has(#lower.open)
#lower.open .cgm-details .field>span{
 padding:0!important;
 font-size:10px!important;
 color:#56748f!important;
}

html body.cgm-fit.panel-open:has(#lower.open)
#lower.open .cgm-details .val{
 width:100%!important;
 min-height:0!important;
 padding:0!important;
 margin:0!important;
 font-size:11px!important;
 line-height:1.35!important;
 white-space:normal!important;
 overflow-wrap:anywhere!important;
 border:0!important;
 background:transparent!important;
}

html body.cgm-fit.panel-open:has(#lower.open)
#lower.open .executionGrid{
 gap:6px!important;
}

html body.cgm-fit.panel-open:has(#lower.open)
#lower.open .executionGrid[hidden]{
 display:none!important;
}

html body.cgm-fit.panel-open:has(#lower.open)
#lower.open .executionValue{
 min-height:0!important;
 max-height:70px!important;
 overflow:hidden!important;
 white-space:pre-wrap!important;
 font-size:11px!important;
}

html body.cgm-fit.panel-open:has(#lower.open)
#lower.open #note{
 width:100%!important;
 height:120px!important;
 min-height:0!important;
 max-height:120px!important;
 overflow:hidden!important;
 resize:none!important;
}

html body.cgm-fit.panel-open:has(#lower.open)
#lower.open #note[hidden]{
 display:none!important;
}

/* MAPA FLEXIVEL */

html body.cgm-fit.panel-open:has(#lower.open)
#lower.open>#gisSSCard:not(.cgm-stage-hidden){
 display:flex!important;
 flex-direction:column!important;
}

html body.cgm-fit.panel-open:has(#lower.open)
#lower.open #gisSSMap:not([hidden]){
 flex:1 1 0!important;
 height:auto!important;
 min-height:0!important;
 max-height:none!important;
}

html body.cgm-fit.panel-open:has(#lower.open)
#lower.open #gisSSMap[hidden]{
 display:none!important;
}

#lower .gisActions{
 flex-wrap:wrap;
 overflow-wrap:anywhere;
}

#lower .cgm-full-text{
 order:1;
 flex:0 0 auto;
 height:28px;
 border:1px solid #bcd5ea;
 border-radius:5px;
 background:white;
 color:#07599a;
 font-weight:700;
 font-size:11px;
 cursor:pointer;
}

/* ACOES PERMANENTEMENTE VISIVEIS */

html body.cgm-fit.panel-open:has(#lower.open)
#lower.open>.card:has(>.actions){
 order:2!important;
 flex:0 0 auto!important;
 width:100%!important;
 height:auto!important;
 min-height:0!important;
 max-height:none!important;
 padding:6px!important;
 margin:0!important;
 overflow:visible!important;
}

html body.cgm-fit.panel-open:has(#lower.open)
#lower.open>.card:has(>.actions)>h3{
 margin:0 0 5px!important;
 padding:6px!important;
 font-size:11px!important;
}

html body.cgm-fit.panel-open:has(#lower.open)
#lower.open .actions{
 display:grid!important;
 grid-template-columns:repeat(3,minmax(0,1fr))!important;
 grid-auto-rows:auto!important;
 gap:4px!important;
}

html body.cgm-fit.panel-open:has(#lower.open)
#lower.open .actions .action{
 height:39px!important;
 min-height:39px!important;
 max-height:39px!important;
 min-width:0!important;
 padding:3px!important;
 font-size:10px!important;
 line-height:1.1!important;
 white-space:normal!important;
}

html body.cgm-fit.panel-open:has(#lower.open)
#lower.open .actions .action b{
 font-size:13px!important;
 line-height:14px!important;
 margin:0 0 2px!important;
}

#lower .actions .action[hidden]{
 display:none!important;
}

@media(max-height:720px){
 html body.cgm-fit.panel-open:has(#lower.open)
 #lower.open .actions .action{
  height:32px!important;
  min-height:32px!important;
  max-height:32px!important;
 }
 html body.cgm-fit.panel-open:has(#lower.open)
 #lower.open .actions .action b{
  display:inline!important;
  margin-right:3px!important;
 }
}

@media(max-width:900px){
 body.cgm-fit.panel-open:not(.tram-mode):has(#lower.open) > main{
  width:100%!important;
 }
 html body.cgm-fit.panel-open:has(#lower.open) #lower.open{
  width:min(96vw,490px)!important;
 }
}

#cgmFullText{
 width:min(760px,94vw);
 max-height:90dvh;
 padding:18px;
 color:#173e65;
 border:1px solid #bfd3e6;
 border-radius:9px;
}

#cgmFullText::backdrop{
 background:#09274499;
}

#cgmFullText pre{
 font:13px/1.6 Arial,sans-serif;
 white-space:pre-wrap;
 overflow-wrap:anywhere;
}
/* CGM_LAYOUT_COMBINADO_V2 */

html body.cgm-fit.panel-open:has(#lower.open)
#lower.open.cgm-combined>.cgm-details{
 flex:0 1 auto!important;
 height:auto!important;
 min-height:0!important;
 max-height:min(44%,320px)!important;
 padding:5px!important;
 overflow:hidden!important;
}

html body.cgm-fit.panel-open:has(#lower.open)
#lower.open.cgm-combined .details{
 gap:3px 5px!important;
}

html body.cgm-fit.panel-open:has(#lower.open)
#lower.open.cgm-combined .field{
 padding:3px 5px!important;
 gap:2px!important;
 text-align:left!important;
}

html body.cgm-fit.panel-open:has(#lower.open)
#lower.open.cgm-combined .field>span{
 text-align:left!important;
 font-size:10px!important;
}

html body.cgm-fit.panel-open:has(#lower.open)
#lower.open.cgm-combined .val{
 font-size:11px!important;
 line-height:1.3!important;
}

html body.cgm-fit.panel-open:has(#lower.open)
#lower.open.cgm-combined>#gisSSCard:not(.cgm-stage-hidden){
 flex:1 1 0!important;
 min-height:0!important;
 height:auto!important;
 padding:0!important;
 gap:0!important;
}

html body.cgm-fit.panel-open:has(#lower.open)
#lower.open.cgm-combined #gisSSMap:not([hidden]){
 flex:1 1 0!important;
 min-height:0!important;
 height:auto!important;
 width:100%!important;
}

#lower.cgm-combined #gisSSCard .gisHead{
 flex:0 0 auto;
 padding:7px 9px!important;
 font-size:11px!important;
}

#lower.cgm-combined #gisSSCard .gisInfo,
#lower.cgm-combined #gisSSCard .gisActions{
 flex:0 0 auto;
 padding:4px 7px!important;
 font-size:10px!important;
}

/* Retorno da equipe sempre abaixo dos detalhes */

html body.cgm-fit.panel-open:has(#lower.open)
#lower.open.cgm-combined>.cgm-retorno:not(.cgm-stage-hidden){
 flex:1 1 0!important;
 min-height:0!important;
 height:auto!important;
 padding:7px!important;
 overflow:hidden!important;
}

html body.cgm-fit.panel-open:has(#lower.open)
#lower.open.cgm-combined #detailInfoTitle{
 background:#0965a5!important;
 color:white!important;
 margin:0 0 7px!important;
 padding:7px 8px!important;
 border-radius:5px!important;
 font-size:11px!important;
}

html body.cgm-fit.panel-open:has(#lower.open)
#lower.open.cgm-combined .executionGrid{
 grid-template-columns:repeat(2,minmax(0,1fr))!important;
 gap:6px!important;
}

html body.cgm-fit.panel-open:has(#lower.open)
#lower.open.cgm-combined .executionGrid label{
 font-size:10px!important;
 margin-bottom:3px!important;
}

html body.cgm-fit.panel-open:has(#lower.open)
#lower.open.cgm-combined .executionValue{
 padding:5px 6px!important;
 min-height:0!important;
 max-height:none!important;
 font-size:11px!important;
 line-height:1.35!important;
 display:-webkit-box!important;
 -webkit-box-orient:vertical;
 -webkit-line-clamp:3;
 overflow:hidden!important;
 background:#f3f8fc!important;
 border:1px solid #dce7f2!important;
 border-radius:4px!important;
}

html body.cgm-fit.panel-open:has(#lower.open)
#lower.open.cgm-combined
#executionInfo>div:has(#dMateriais),
html body.cgm-fit.panel-open:has(#lower.open)
#lower.open.cgm-combined
#executionInfo>div:has(#dPavimentacao){
 grid-column:auto!important;
}

@media(max-height:720px){

 html body.cgm-fit.panel-open:has(#lower.open)
 #lower.open.cgm-combined>.cgm-details{
  max-height:40%!important;
 }

 html body.cgm-fit.panel-open:has(#lower.open)
 #lower.open.cgm-combined .field{
  padding:2px 4px!important;
 }

 html body.cgm-fit.panel-open:has(#lower.open)
 #lower.open.cgm-combined .executionValue{
  -webkit-line-clamp:2;
 }
}

`;

document.head.append(css);

// CLIQUE NO NUMERO: SELECAO UNICA.

rows.addEventListener('click',e=>{
 const td=e.target.closest('td.ss');
 if(!td||!rows.contains(td))return;
 if(currentScreen==='tramitacao')return;

 const tr=td.closest('tr');
 const index=Array.from(rows.children).indexOf(tr);
 const x=view[index];
 const cb=tr.querySelector('.pick');

 if(!x||!cb)return;

 e.preventDefault();
 e.stopImmediatePropagation();

 anchor=index;

 selected={};
 cb.checked=true;

 // Reutiliza o fluxo oficial do checkbox.
 cb.dispatchEvent(new Event('change',{bubbles:true}));

},true);

rows.addEventListener('keydown',e=>{
 if(e.target.matches('td.ss')&&
    ['Enter',' '].includes(e.key)){
  e.preventDefault();
  e.target.click();
 }
});

// CABECALHO E ABAS DO PAINEL.

const head=document.createElement('div');
head.className='cgm-panel-head';

const ssLabel=document.createElement('span');
const close=byId('closeDetail');

head.append(ssLabel,close);

const nav=document.createElement('div');
nav.className='cgm-panel-tabs';

const detail=byId('dss').closest('.card');
const retorno=byId('note').closest('.card');
const history=byId('receptionSiscomPanel');

detail.classList.add('cgm-details','cgm-stage');
retorno.classList.add('cgm-stage','cgm-retorno');

if(history)history.classList.add('cgm-stage');

const placeholder=document.createElement('div');
placeholder.className='cgm-stage cgm-stage-hidden';
placeholder.textContent='Selecione Verificar no SISCOM para consultar o historico oficial.';

lower.prepend(head,nav);
lower.append(placeholder);

let activeTab='details';

const full=document.createElement('button');
full.type='button';
full.className='cgm-full-text';
full.textContent='Ver conteudo completo';
lower.append(full);

const tabs=[
 ['details','Detalhes'],
 ['return','Retorno'],
 ['map','Mapa'],
 ['history','Historico']
];

for(const [key,label] of tabs){
 const b=document.createElement('button');
 b.type='button';
 b.dataset.cgmTab=key;
 b.textContent=label;
 b.onclick=()=>showTab(key);
 nav.append(b);
}


let observedMap=null;

const mapObserver=typeof ResizeObserver==='function'
 ?new ResizeObserver(()=>{
   requestAnimationFrame(()=>{
    window.dispatchEvent(new Event('resize'));
   });
  }):null;

function observeMap(){
 const el=byId('gisSSMap');

 if(el&&el!==observedMap&&mapObserver){
  mapObserver.disconnect();
  mapObserver.observe(el);
  observedMap=el;
 }
}

function showTab(key){

 activeTab=key;

 const gis=byId('gisSSCard');
 if(gis)gis.classList.add('cgm-stage');

 const combined=key==='details'&&
  ['recepcao','baixar'].includes(currentScreen);

 lower.classList.toggle('cgm-combined',combined);

 const visible=new Set();

 if(key==='details'){

  visible.add(detail);

  if(currentScreen==='recepcao'){
   placeholder.textContent='Consultando localizacao oficial...';
   visible.add(gis||placeholder);
  }

  if(currentScreen==='baixar'){
   visible.add(retorno);
  }

 }else if(key==='return'){

  visible.add(retorno);

 }else if(key==='map'){

  placeholder.textContent='Aguardando localizacao oficial.';
  visible.add(gis||placeholder);

 }else{

  placeholder.textContent=
   'Selecione Verificar no SISCOM para consultar o historico.';

  visible.add(history&&!history.hidden?history:placeholder);
 }

 for(const el of lower.querySelectorAll(':scope > .cgm-stage')){
  el.classList.toggle('cgm-stage-hidden',!visible.has(el));
 }

 for(const b of nav.children){
  b.classList.toggle('active',b.dataset.cgmTab===key);
  b.hidden=b.dataset.cgmTab==='history'&&currentScreen!=='recepcao';
 }

 full.hidden=key==='map';

 full.textContent=combined&&currentScreen==='baixar'
  ?'Ver detalhes e retorno completos'
  :'Ver conteudo completo';

 observeMap();

 if(visible.has(gis)){
  requestAnimationFrame(()=>{
   window.dispatchEvent(new Event('resize'));
  });
 }
}

let previousSS='';

function syncPanel(){
 const ss=title.textContent.trim();

 ssLabel.textContent='SS '+ss;

 const panelKey=currentScreen+'|'+ss;
 if(previousSS!==panelKey){
  previousSS=panelKey;
  showTab('details');
 }else{
  showTab(activeTab);
 }
}

new MutationObserver(syncPanel).observe(title,{
 childList:true,
 characterData:true,
 subtree:true
});

new MutationObserver(()=>{
 showTab(activeTab);
}).observe(lower,{childList:true});

if(history){
 new MutationObserver(()=>{
  if(!history.hidden)showTab('history');
  else if(activeTab==='history')showTab('details');
 }).observe(history,{
  attributes:true,
  attributeFilter:['hidden']
 });
}

if(window.ResizeObserver){
 const panelResize=new ResizeObserver(()=>{
  if(activeTab==='map'||(activeTab==='details'&&currentScreen==='recepcao')){
   window.dispatchEvent(new Event('resize'));
  }
 });
 panelResize.observe(lower);
}

// TEXTO COMPLETO SEM ROLAGEM NA LATERAL.

const dialog=document.createElement('dialog');
dialog.id='cgmFullText';

const h=document.createElement('h3');
const pre=document.createElement('pre');
const exit=document.createElement('button');

exit.type='button';
exit.className='btn';
exit.textContent='Fechar';
exit.onclick=()=>dialog.close();

dialog.append(h,pre,exit);
document.body.append(dialog);

full.onclick=()=>{

 h.textContent='SS '+title.textContent.trim();

 if(activeTab==='details'){
  pre.textContent=Array.from(
   detail.querySelectorAll('.field')
  ).map(el=>el.innerText).join('\n\n');

  if(currentScreen==='baixar'){
   pre.textContent+='\n\nRETORNO DA EQUIPE\n\n'+
    byId('executionInfo').innerText;
  }

 }else if(activeTab==='return'){
  const note=byId('note');
  pre.textContent=!note.hidden?
   note.value:byId('executionInfo').innerText;

 }else{
  const events=byId('rsEventList');
  pre.textContent=history&&!history.hidden?
   history.innerText+'\n\n'+
    Array.from(events?.children||[])
     .map(x=>x.textContent).join('\n\n'):
   'Historico ainda nao consultado.';
 }

 dialog.showModal();
};

// PAGINACAO LOCAL, SEM NOVAS CONSULTAS.

let visualStart=0;
let capacity=25;
let signature='';
let anchor=null;
let scheduled=false;

const local=document.createElement('div');
local.className='cgm-visual-pager';

const prev=document.createElement('button');
const next=document.createElement('button');
const info=document.createElement('span');

prev.type=next.type='button';
prev.textContent='‹';
next.textContent='›';

local.append(prev,info,next);
pager.append(local);

prev.onclick=()=>{
 visualStart=Math.max(0,visualStart-capacity);
 fitTable();
};

next.onclick=()=>{
 visualStart+=capacity;
 fitTable();
};

function schedule(){
 if(scheduled)return;
 scheduled=true;
 requestAnimationFrame(()=>{
  scheduled=false;
  fitTable();
 });
}

function fitTable(){

 const list=Array.from(rows.children);

 const sig=currentScreen+'|'+
  String(window.__pageOffset||0)+'|'+
  view.slice(0,page).map(x=>x.tarefa).join(',');

 if(signature!==sig){
  signature=sig;
  visualStart=0;
 }

 const large=Number(page)>100;

 wrap.classList.toggle('cgm-large',large);

 local.hidden=large||currentScreen==='tramitacao';

 if(!list.length||large){
  list.forEach(tr=>tr.classList.remove('cgm-row-off'));
  return;
 }

 const visible=list.find(tr=>
  !tr.classList.contains('cgm-row-off')
 );

 const rowHeight=Math.max(
  24,visible?.getBoundingClientRect().height||28
 );

 const headHeight=table.tHead?
  table.tHead.getBoundingClientRect().height:0;

 const filterHeight=table.querySelector('tbody.filter')
  ?.getBoundingClientRect().height||0;

 capacity=Math.max(1,Math.floor(
  (wrap.clientHeight-headHeight-filterHeight-3)/rowHeight
 ));

 if(anchor!==null){
  visualStart=Math.floor(anchor/capacity)*capacity;
  anchor=null;
 }

 visualStart=Math.min(
  visualStart,
  Math.floor((list.length-1)/capacity)*capacity
 );

 list.forEach((tr,i)=>{
  const hidden=i<visualStart||i>=visualStart+capacity;
  tr.classList.toggle('cgm-row-off',hidden);

  const ss=tr.querySelector('td.ss');
  if(ss){
   ss.tabIndex=0;
   ss.setAttribute('role','button');
   ss.setAttribute('aria-label','Selecionar SS '+ss.textContent);
  }
 });

 info.textContent='Na tela: '+(visualStart+1)+'–'+
  Math.min(visualStart+capacity,list.length)+
  ' de '+list.length;

 prev.disabled=visualStart===0;
 next.disabled=visualStart+capacity>=list.length;

 const all=byId('all');
 const displayed=view.slice(
  visualStart,Math.min(visualStart+capacity,list.length)
 );

 const marked=displayed.filter(x=>selected[x.tarefa]).length;

 all.checked=displayed.length>0&&marked===displayed.length;
 all.indeterminate=marked>0&&marked<displayed.length;

 all.title='Selecionar somente as SS exibidas nesta tela';
}

byId('all').onchange=e=>{
 const list=view.slice(0,page);
 const items=Number(page)>100?list:
  list.slice(visualStart,visualStart+capacity);

 items.forEach(x=>{
  if(e.target.checked)selected[x.tarefa]=x;
  else delete selected[x.tarefa];
 });

 render();
};

new MutationObserver(schedule).observe(rows,{childList:true});

if(window.ResizeObserver){
 new ResizeObserver(schedule).observe(wrap);
}

window.addEventListener('resize',schedule);

document.querySelectorAll('.tab[data-screen]').forEach(b=>{
 b.addEventListener('click',()=>{
  visualStart=0;
  schedule();
 });
});

syncPanel();
schedule();

console.log('[CGM] Layout responsivo V1 instalado.');

})();
