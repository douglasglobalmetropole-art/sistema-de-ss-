/* GLOBAL SS - Consulta de baixa registrada V7 (somente leitura). */
(()=>{
'use strict';
const SS=/^\d{2}\/\d{2}-\d{6}-\d{2}$/;
const byId=id=>document.getElementById(id);
const el=(tag,cls,txt)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=String(txt);return n;};
const apiBase=()=>location.pathname.startsWith('/lote1')?'/lote1/api':'/api';
const asText=v=>v===null||v===undefined||v===''?'Não informado':String(v);
const dateText=v=>{if(!v)return 'Não informado';const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleString('pt-BR');};
let modal,body,title,notice,tabs,activeSS='',generation=0,requesting=new Set();
const loaded=new Map();
function currentScreenName(){try{return typeof currentScreen==='string'?currentScreen:'';}catch{return '';}}
function selectedSS(){const ss=String(window.__detailSS?.ss||byId('dss')?.textContent||'').trim();return SS.test(ss)?ss:'';}
function readOnlyField(label,value){const field=el('div','ssv7-field');field.append(el('small','',label),el('div','ssv7-value',asText(value)));return field;}
function empty(text){return el('p','ssv7-note',text);}
function grid(fields){const n=el('div','ssv7-grid');for(const [k,v] of fields)n.append(readOnlyField(k,v));return n;}
function info(text,kind=''){notice.className='ssv7-notice '+kind;notice.textContent=text;}
function setBusy(tab,busy){const b=tabs?.querySelector('[data-v7tab="'+tab+'"]');if(b)b.disabled=busy;}
function getTab(tab){return body.querySelector('[data-v7panel="'+tab+'"]');}
async function jsonFetch(path,options={}){
 const r=await fetch(apiBase()+path,{credentials:'same-origin',cache:'no-store',...options});
 const data=await r.json().catch(()=>({}));
 if(!r.ok)throw Error(data.error||data.message||'HTTP '+r.status);
 return data;
}
async function job(operation,path,payload,ss,gen){
 const start=await jsonFetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
 if(!start.id)throw Error('A consulta não retornou identificador de tarefa.');
 for(let i=0;i<50;i++){
  if(activeSS!==ss||generation!==gen)throw Error('Consulta cancelada por mudança de SS.');
  await new Promise(resolve=>setTimeout(resolve,1200));
  const q=await jsonFetch('/siscom-gateway/jobs/'+encodeURIComponent(start.id));
  if(q.status==='erro')throw Error(q.error_message||'SISCOM recusou a consulta.');
  if(q.status==='concluido')return q.result;
 }
 throw Error('Tempo limite na consulta SISCOM. Confira o worker e a sessão individual.');
}
function table(columns,items,values){
 const t=el('table','ssv7-table'),head=el('thead'),hrow=el('tr');
 columns.forEach(c=>hrow.append(el('th','',c)));head.append(hrow);t.append(head);
 const tb=el('tbody');items.forEach(item=>{const row=el('tr');values(item).forEach(v=>row.append(el('td','',asText(v))));tb.append(row);});t.append(tb);return t;
}
function panelRender(tab,render){const pane=getTab(tab);pane.replaceChildren();render(pane);}
function localReturn(ss){const x=window.__detailSS||{};if(String(x.ss||'')!==ss)return null;return x;}
async function loadBaixa(ss,gen){
 const data=await job('consultar_ss_baixa','/siscom-gateway/consultar-ss-baixa',{numero_ss:ss},ss,gen);
 if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Dados oficiais da baixa em formato inesperado.');
 loaded.set('baixa:'+ss,data);
 panelRender('baixa',pane=>{
  pane.append(el('h3','','Dados oficiais registrados no SISCOM'));
  pane.append(empty('Consulta somente leitura. Os campos abaixo são retornados pelo SISCOM; valores ausentes não são presumidos.'));
  pane.append(grid([
   ['Número da SS',data.numero_ss||ss],
   ['Unidade executora / executor',data.unidadeExecutoraDTO?.cdExecutor],
   ['Código da unidade',data.unidadeExecutoraDTO?.cdUnidadeExecutora],
   ['Equipe (código)',data.codEquipe],
   ['Macro (código)',data.servicoMacroDTO?.cdServico],
   ['Macro (descrição)',data.servicoMacroDTO?.dcServico],
   ['Início da execução',dateText(data.dataHoraExecucaoIni)],
   ['Fim da execução',dateText(data.dataHoraExecucaoFim)],
   ['Última SS',data.ultSS]
  ]));
  pane.append(el('h4','','Descrição da execução (SISCOM)'));
  pane.append(el('div','ssv7-longtext',asText(data.descricaoExecucao)));
  const x=localReturn(ss);
  if(x){pane.append(el('h3','ssv7-subsection','Retorno original da equipe (uMov) — comparação'));
   pane.append(grid([
    ['Equipe informada no uMov',x.equipe_executou||x.tecnico],
    ['Início uMov',x.inicio_atividade],['Fim uMov',x.fim_atividade],
    ['Materiais informados no retorno',x.materiais_lancados]
   ]));
   pane.append(el('h4','','Informação de execução do retorno uMov'));
   pane.append(el('div','ssv7-longtext',asText(x.info_execucao_siscom||x.informacao_solicitante)));
  }
  pane.append(empty('Esta consulta não realiza nova baixa, não altera o status da SS e não substitui a conferência do histórico oficial.'));
 });
 info('Consulta oficial da SS '+ss+' concluída.','ok');
}
async function loadComplementar(ss,gen){
 const result=await job('consultar_complementares_ss','/siscom-gateway/complementar-consultar',{numero_ss:ss},ss,gen);
 if(!Array.isArray(result))throw Error('Lista de complementares em formato inesperado.');
 panelRender('complementar',pane=>{
  pane.append(el('h3','','SS complementares vinculadas no SISCOM'));
  if(!result.length){pane.append(empty('Nenhuma SS complementar encontrada na consulta oficial.'));return;}
  pane.append(table(['ID SISCOM','Sequencial de origem','Serviço (código)','Área','Observação'],result,x=>[x.id,x.seqSSOrigem,x.servico,x.area,x.observacao]));
 });
 info(result.length+' registro(s) complementar(es) consultado(s) no SISCOM.','ok');
}
async function loadMateriais(ss,gen){
 const result=await jsonFetch('/itens?ss='+encodeURIComponent(ss));
 if(gen!==generation||ss!==activeSS)return;
 const rows=Array.isArray(result.rows)?result.rows:[];
 panelRender('materiais',pane=>{
  pane.append(el('h3','','Itens lançados — GLOBAL SS'));
  pane.append(empty('Esta lista utiliza a mesma base do botão “Lançar Itens” do GLOBAL SS. Não é uma consulta de materiais da API SISCOM.'));
  if(!rows.length){pane.append(empty('Nenhum item localizado na base de itens do GLOBAL SS para esta SS.'));return;}
  pane.append(table(['Material','Unidade','Quantidade','Valor total'],rows,x=>[x.material_nome||x.material||x.nome,x.unidade,x.quantidade,x.valor_total??x.valor]));
 });
 info(rows.length+' item(ns) encontrado(s) na base de itens do GLOBAL SS.','ok');
}
async function loadAnexos(ss,gen){
 const result=await job('tram_anexos','/siscom-gateway/tramitacao',{operation:'tram_anexos',params:{ss,origem:'dados',page:0}},ss,gen);
 const rows=Array.isArray(result)?result:Array.isArray(result?.content)?result.content:Array.isArray(result?.data)?result.data:null;
 if(!rows)throw Error('Lista de anexos em formato inesperado. Atualize o worker com a consulta oficial de Anexos/Dados.');
 const total=Number(result?.totalElements??rows.length);
 panelRender('anexos',pane=>{
  pane.append(el('h3','','Anexos cadastrados no SISCOM'));
  pane.append(empty('Consulta oficial de metadados. Para abrir o conteúdo de um PDF, utilize a aba Anexos do SISCOM; esta tela não inventa um endereço de download.'));
  if(!rows.length){pane.append(empty('Nenhum anexo localizado nesta SS.'));return;}
  pane.append(table(['Data','Nome do arquivo','Descrição','Responsável','Origem'],rows,x=>[dateText(x.dataHoraInclusao),x.nomeArquivo,x.descricao,x.usuario,x.origemArquivo]));
  if(total>rows.length)pane.append(empty('Exibindo '+rows.length+' de '+total+' anexos. Confira os demais diretamente no SISCOM.'));
 });
 const badge=tabs.querySelector('[data-v7tab="anexos"]');if(badge)badge.textContent='Anexos ('+rows.length+')';
 info('Anexos consultados no SISCOM para '+ss+'.','ok');
}
async function loadTab(tab){
 const ss=activeSS,gen=generation,key=tab+':'+ss;
 if(!SS.test(ss))return;
 if(requesting.has(key))return;
 requesting.add(key);setBusy(tab,true);info('Consultando '+ss+'...');
 panelRender(tab,pane=>pane.append(empty('Aguarde a consulta...')));
 try{
  if(tab==='baixa')await loadBaixa(ss,gen);
  if(tab==='complementar')await loadComplementar(ss,gen);
  if(tab==='materiais')await loadMateriais(ss,gen);
  if(tab==='anexos')await loadAnexos(ss,gen);
 }catch(e){if(activeSS===ss&&generation===gen){panelRender(tab,pane=>pane.append(empty('Não foi possível confirmar os dados: '+e.message)));info('Consulta não confirmada: '+e.message,'error');}}
 finally{requesting.delete(key);setBusy(tab,false);}
}
function activate(tab){
 for(const b of tabs.querySelectorAll('[data-v7tab]')){const a=b.dataset.v7tab===tab;b.classList.toggle('active',a);b.setAttribute('aria-selected',String(a));}
 for(const p of body.querySelectorAll('[data-v7panel]'))p.hidden=p.dataset.v7panel!==tab;
 loadTab(tab);
}
function close(){generation++;modal.hidden=true;document.body.classList.remove('ssv7-modal-open');}
function open(){const ss=selectedSS();if(!ss)return alert('Selecione uma SS válida para consultar.');activeSS=ss;generation++;title.textContent='Consultar baixa da SS '+ss;modal.hidden=false;document.body.classList.add('ssv7-modal-open');const badge=tabs.querySelector('[data-v7tab="anexos"]');if(badge)badge.textContent='Anexos';activate('baixa');}
function init(){
 if(byId('ssv7ConsultaModal'))return;
 const actions=document.querySelector('#lower .actions');if(!actions)return;
 const btn=el('button','ssv7-action','▤  Consultar baixa de SS');btn.type='button';btn.id='ssv7ConsultaBtn';btn.hidden=true;btn.addEventListener('click',open);actions.append(btn);
 modal=el('div','ssv7-overlay');modal.id='ssv7ConsultaModal';modal.hidden=true;
 const dialog=el('section','ssv7-dialog');dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-label','Consultar baixa da SS no SISCOM');
 const top=el('div','ssv7-top');title=el('h2','','Consultar baixa de SS');const closeBtn=el('button','ssv7-close','×');closeBtn.type='button';closeBtn.setAttribute('aria-label','Fechar consulta');closeBtn.onclick=close;top.append(title,closeBtn);
 const desc=el('div','ssv7-context','Consulta somente leitura · Dados oficiais SISCOM e registros GLOBAL SS identificados por origem');
 tabs=el('div','ssv7-tabs');tabs.setAttribute('role','tablist');
 for(const [k,label] of [['baixa','Dados da baixa'],['complementar','Complementar'],['materiais','Materiais'],['anexos','Anexos']]){const b=el('button','',label);b.type='button';b.dataset.v7tab=k;b.setAttribute('role','tab');b.onclick=()=>activate(k);tabs.append(b);}
 notice=el('div','ssv7-notice');body=el('div','ssv7-body');
 for(const k of ['baixa','complementar','materiais','anexos']){const p=el('section','ssv7-panel');p.dataset.v7panel=k;p.hidden=k!=='baixa';body.append(p);}
 const bottom=el('div','ssv7-bottom');const refresh=el('button','ssv7-secondary','↻ Atualizar consulta');refresh.onclick=()=>{const active=tabs.querySelector('.active');if(active)loadTab(active.dataset.v7tab);};const finish=el('button','ssv7-primary','Fechar');finish.onclick=close;bottom.append(refresh,finish);
 dialog.append(top,desc,tabs,notice,body,bottom);modal.append(dialog);document.body.append(modal);
 modal.addEventListener('click',e=>{if(e.target===modal)close();});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!modal.hidden)close();});
 const sync=()=>{const screen=currentScreenName();const show=screen==='encerradas'&&SS.test(selectedSS())&&!!byId('lower')?.classList.contains('open');btn.hidden=!show;};
 const report=byId('viewReportBtn');if(report)new MutationObserver(sync).observe(report,{attributes:true,attributeFilter:['hidden']});
 const lower=byId('lower');if(lower)new MutationObserver(sync).observe(lower,{attributes:true,attributeFilter:['class']});
 const ssNode=byId('dss');if(ssNode)new MutationObserver(sync).observe(ssNode,{childList:true,characterData:true,subtree:true});
 document.addEventListener('click',()=>queueMicrotask(sync));sync();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
