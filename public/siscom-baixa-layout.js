/* GLOBAL SS: reorganização visual da baixa. Preserva IDs, formulários e handlers SISCOM. */
(()=>{
 'use strict';
 const init=()=>{
  const root=document.getElementById('siscomBaixaModal');
  if(!root||root.dataset.layoutV3==='1')return;
  const q=s=>root.querySelector(s), id=s=>document.getElementById(s);
  const shell=q('.sbShell'), header=q('.sbHeader'), ribbon=q('.sbRibbon'), columns=q('.sbColumns');
  const form=q('.sbFormPane'), aside=q('.sbSummary'), footer=q('.sbFooter');
  const comp=id('sbCompSection'), anexoStatus=id('sbAnexoStatus'), official=q('.sbOfficialDetails');
  const summary=q('.sbSummaryDates'), history=q('.sbHistoryPane');
  if(!shell||!header||!ribbon||!columns||!form||!aside||!footer||!comp||!anexoStatus||!official||!summary||!history||!id('sbSS'))return;
  root.dataset.layoutV3='1';
  const node=(tag,cl,txt)=>{const el=document.createElement(tag);if(cl)el.className=cl;if(txt)el.textContent=txt;return el;};
  const title=id('siscomBaixaTitle');
  if(title){title.textContent='↧  Baixar SS no SISCOM';}
  const warning=header.querySelector('strong');
  if(warning){warning.classList.add('sbV3Warning');warning.textContent='Baixa real — confirmação obrigatória';}
  const statusBar=node('div','sbV3Statusbar');
  const officialBadge=node('span','sbV3Ok','Aguardando consulta oficial');
  const now=node('span','sbV3Date');
  now.textContent='Dados oficiais e retorno da equipe';
  statusBar.append(officialBadge,now);
  ribbon.before(statusBar);
  const sourceBadge=id('sbLoadBadge');
  if(sourceBadge){const update=()=>{officialBadge.textContent=sourceBadge.textContent.trim()||'Aguardando consulta oficial';officialBadge.classList.toggle('ready',/conclu[ií]da/i.test(officialBadge.textContent));};update();new MutationObserver(update).observe(sourceBadge,{childList:true,characterData:true,subtree:true});}
  const ribbonTitle=q('.sbRibbonTitle');if(ribbonTitle)ribbonTitle.hidden=true;
  const nav=node('div','sbV3Tabs');nav.setAttribute('role','tablist');nav.setAttribute('aria-label','Seções da baixa SISCOM');
  const tabs=[['baixa','✎','Dados da baixa'],['complementar','▤','Complementar'],['materiais','⬡','Materiais'],['anexos','▱','Anexos']];
  const panels={baixa:columns};
  for(const [key,icon,label] of tabs){const b=node('button','sbV3Tab',icon+'  '+label);b.type='button';b.dataset.sbtab=key;b.setAttribute('role','tab');b.setAttribute('aria-selected','false');nav.append(b);}
  ribbon.after(nav);
  const complement=node('section','sbV3Panel');complement.dataset.sbpanel='complementar';complement.append(comp);nav.after(complement);
  const material=node('section','sbV3Panel');material.dataset.sbpanel='materiais';complement.after(material);
  const anexos=node('section','sbV3Panel');anexos.dataset.sbpanel='anexos';material.after(anexos);
  columns.dataset.sbpanel='baixa';columns.classList.add('sbV3Panel');
  const materialHead=node('div','sbV3SectionHead','Materiais da SS — consultar e lançar itens');
  const matDesc=node('p','sbV3Note','Utiliza os mesmos materiais cadastrados e os mesmos serviços de gravação da opção “Lançar Itens”. Os itens são associados à SS selecionada.');
  const matToolbar=node('div','sbV3Toolbar');
  const matRefresh=node('button','btn','↻  Consultar itens lançados');matRefresh.type='button';
  const matPending=node('button','btn','Ver lista para salvar (0)');matPending.type='button';
  matToolbar.append(matRefresh,matPending);
  const matTable=node('div','sbV3ItemsList');matTable.setAttribute('aria-live','polite');
  const matTitle=node('h4','sbV3Subheading','Adicionar material à lista');
  const matGrid=node('div','sbV3MatGrid');
  const makeField=(label,type,placeholder)=>{const wrap=node('label','sbV3Field');wrap.append(node('span','',label));const input=node('input');input.type=type;input.placeholder=placeholder||'';wrap.append(input);return [wrap,input];};
  const [matNameWrap,matName]=makeField('Material cadastrado *','text','Digite para localizar o material');matName.setAttribute('list','sbV3Catalog');
  const catalog=node('datalist');catalog.id='sbV3Catalog';matNameWrap.append(catalog);
  const [matUnitWrap,matUnit]=makeField('Unidade','text','UN');
  const [matQtyWrap,matQty]=makeField('Quantidade *','number','1');matQty.min='0.0001';matQty.step='0.0001';matQty.value='1';
  const [matValueWrap,matValue]=makeField('Valor total (R$)','number','0,00');matValue.min='0';matValue.step='0.01';
  matGrid.append(matNameWrap,matUnitWrap,matQtyWrap,matValueWrap);
  const matButtons=node('div','sbV3Toolbar sbV3MatActions');
  const matAdd=node('button','btn','+ Adicionar à lista');matAdd.type='button';
  const matSave=node('button','btn primary','✓ Salvar materiais');matSave.type='button';
  matButtons.append(matAdd,matSave);
  const matStatus=node('p','sbV3MatStatus');matStatus.setAttribute('role','status');
  material.append(materialHead,matDesc,matToolbar,matTable,matTitle,matGrid,matButtons,matStatus);
  const anexoHead=node('div','sbV3SectionHead','Anexos da SS');
  const anexoDesc=node('p','sbV3Note','O relatório original do uMov pode ser anexado ao SISCOM. Consulte a aba Anexos oficial antes de repetir um envio.');
  const anexoBtn=node('button','btn primary','▣  Anexar relatório no SISCOM');anexoBtn.type='button';
  anexoBtn.addEventListener('click',()=>{const btn=id('sbAnexarSiscom');if(btn)btn.click();});
  anexos.append(anexoHead,anexoDesc,anexoBtn,anexoStatus);
  const formTitle=form.querySelector('.sbInnerTitle');if(formTitle)formTitle.textContent='✎  Dados da execução';
  const asideTitles=[...aside.querySelectorAll('h4')];
  if(asideTitles.length>1&&/retorno preenchido/i.test(asideTitles[0].textContent))asideTitles[0].remove();
  const returnTitle=aside.querySelector('.sbInnerTitle');if(returnTitle)returnTitle.textContent='♟  Retorno preenchido pela equipe (uMov)';
  const hTitle=history.querySelector('h4');if(hTitle)hTitle.textContent='◷  Histórico de eventos do SISCOM';
  const lastSS=id('sbUltima');if(lastSS&&lastSS.parentElement){const target=form.querySelector('.executionGrid');if(target){const label=lastSS.parentElement;label.classList.add('sbV3LastSS');target.insertBefore(label,target.querySelector('#sbInicio')?.parentElement||null);}}
  official.open=false;official.classList.add('sbV3Official');aside.append(official);
  // Os dados de retorno uMov e o histórico continuam sendo alimentados pelos scripts originais.
  const dur=id('sbDuracao');if(dur){const wrap=node('div','sbV3Duration');wrap.append(node('b','','Duração'));wrap.append(dur);const dates=aside.querySelector('.sbSummaryDates');if(dates)dates.after(wrap);}
  const anexoFooter=id('sbAnexarSiscom');if(anexoFooter)anexoFooter.classList.add('sbV3FooterAnexo');
  const fechar=id('sbFechar');if(fechar)fechar.classList.add('sbV3FooterFechar');
  const activate=key=>{
   if(!panels[key]&&key!=='complementar'&&key!=='materiais'&&key!=='anexos')return;
   for(const btn of nav.querySelectorAll('[data-sbtab]')){const active=btn.dataset.sbtab===key;btn.classList.toggle('active',active);btn.setAttribute('aria-selected',String(active));}
   for(const panel of [columns,complement,material,anexos]){panel.hidden=panel.dataset.sbpanel!==key;}
   if(key==='materiais')loadMaterials().catch(e=>matMessage(e.message,true));
  };
  nav.addEventListener('click',e=>{const btn=e.target.closest('[data-sbtab]');if(btn)activate(btn.dataset.sbtab);});
  const openOriginal=window.openSiscomBaixa;
  if(typeof openOriginal==='function')window.openSiscomBaixa=function(...args){activate('baixa');return openOriginal.apply(this,args);};
  activate('baixa');
  const apiPrefix=location.pathname.startsWith('/lote1')?'/lote1/api':'/api';
  let materials=[],loaded=false,currentSS='',draft=[],loading=false;
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const matMessage=(msg,err=false)=>{matStatus.textContent=msg;matStatus.classList.toggle('error',err);};
  async function api(url,opts){const r=await fetch(apiPrefix+url,{cache:'no-store',...opts});let data;try{data=await r.json();}catch{throw Error('Resposta inválida do servidor (HTTP '+r.status+').');}if(!r.ok||data.ok===false)throw Error(data.error||data.message||'Erro HTTP '+r.status);return data;}
  const ssAtual=()=>String(id('sbSS')?.value||'').trim();
  function row(cells,action){const tr=node('tr');for(const c of cells){const td=node('td');td.textContent=String(c??'');tr.append(td);}if(action){const td=node('td');td.append(action);tr.append(td);}return tr;}
  function renderTable(rows,pending=false){matTable.replaceChildren();if(!rows.length){matTable.append(node('p','sbV3Empty',pending?'Nenhum material na lista para salvar.':'Nenhum item lançado nesta SS.'));return;}
   const table=node('table','sbV3Table'),thead=node('thead'),tr=node('tr');for(const c of ['Material','UN','Quantidade','Valor total','Ação'])tr.append(node('th','',c));thead.append(tr);table.append(thead);const body=node('tbody');
   rows.forEach((r,i)=>{const action=node('button','btn sbV3Small',pending?'Remover':'Excluir');action.type='button';
    if(pending){action.onclick=()=>{draft.splice(i,1);matPending.textContent='Ver lista para salvar ('+draft.length+')';renderTable(draft,true);};}
    else{action.onclick=async()=>{const idValue=r.id??r.item_id;if(idValue==null||!window.confirm('Excluir este item já lançado da SS '+currentSS+'?'))return;action.disabled=true;try{await api('/itens/'+encodeURIComponent(idValue),{method:'DELETE'});await refreshItems();matMessage('Item excluído.');}catch(e){matMessage(e.message,true);}finally{action.disabled=false;}};}
    body.append(row([r.material_nome||r.material||r.nome||'',r.unidade||'',r.quantidade??'',money(r.valor_total??r.valor??0)],action));});table.append(body);matTable.append(table);
  }
  async function refreshItems(){const ss=ssAtual();if(!/^\d{2}\/\d{2}-\d{6}-\d{2}$/.test(ss))throw Error('Selecione uma SS válida antes de consultar materiais.');const r=await api('/itens?ss='+encodeURIComponent(ss));if(ss!==ssAtual())return;renderTable(r.rows||[]);matMessage('Itens gravados consultados para a SS '+ss+'.');}
  async function loadMaterials(){const ss=ssAtual();if(!/^\d{2}\/\d{2}-\d{6}-\d{2}$/.test(ss)){matMessage('Selecione uma SS para carregar os materiais.',true);return;}
   if(currentSS!==ss){if(draft.length)matMessage('Atenção: lista não salva da SS anterior descartada ao trocar a SS.',true);draft=[];currentSS=ss;matPending.textContent='Ver lista para salvar (0)';}
   if(loading)return;loading=true;matRefresh.disabled=true;
   try{if(!loaded){const r=await api('/materiais');materials=Array.isArray(r.rows)?r.rows:[];catalog.replaceChildren();for(const m of materials){const option=node('option');option.value=String(m.nome||'');catalog.append(option);}loaded=true;}await refreshItems();}
   finally{loading=false;matRefresh.disabled=false;}
  }
  const selectedMat=()=>materials.find(m=>String(m.nome||'').trim().toLocaleLowerCase('pt-BR')===matName.value.trim().toLocaleLowerCase('pt-BR'));
  const calc=()=>{const m=selectedMat();if(!m)return;matUnit.value=m.unidade||'UN';const q=Number(matQty.value||0);if(Number.isFinite(q)&&q>0&&Number.isFinite(Number(m.valor_unitario)))matValue.value=(q*Number(m.valor_unitario)).toFixed(2);};
  matName.addEventListener('change',calc);matQty.addEventListener('input',calc);
  matRefresh.onclick=()=>loadMaterials().catch(e=>matMessage(e.message,true));
  matPending.onclick=()=>{if(ssAtual()!==currentSS){matMessage('A SS foi alterada. Consulte os itens novamente.',true);return;}renderTable(draft,true);};
  matAdd.onclick=()=>{if(ssAtual()!==currentSS){matMessage('Consulte os materiais desta SS antes de adicionar.',true);return;}
   const m=selectedMat(),quantity=Number(matQty.value),value=matValue.value.trim();if(!m)return matMessage('Selecione um material existente no catálogo.',true);
   if(!matUnit.value.trim()||!Number.isFinite(quantity)||quantity<=0)return matMessage('Informe unidade e quantidade válida.',true);
   if(value!==''&&(!Number.isFinite(Number(value))||Number(value)<0))return matMessage('Informe um valor total válido.',true);
   draft.push({material:m.id,nome:m.nome,unidade:matUnit.value.trim(),quantidade:quantity,valor_total:value});matPending.textContent='Ver lista para salvar ('+draft.length+')';
   matName.value='';matUnit.value='';matQty.value='1';matValue.value='';renderTable(draft,true);matMessage('Material adicionado à lista. Ainda não foi gravado.');};
  matSave.onclick=async()=>{if(!draft.length)return matMessage('Adicione materiais à lista antes de salvar.',true);
   const ss=ssAtual();if(ss!==currentSS)return matMessage('SS diferente da lista pendente. Atualize os materiais.',true);
   if(!window.confirm('Gravar '+draft.length+' material(is) na SS '+ss+'? Confira os dados antes de confirmar.'))return;
   matSave.disabled=true;matMessage('Gravando materiais. Aguarde sem reenviar...');
   try{const response=await fetch(apiPrefix+'/itens/lote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ss,itens:draft}),cache:'no-store'});
    const r=await response.json();if(!Array.isArray(r.resultados))throw Error(r.error||'Não foi possível confirmar os itens gravados.');
    const confirmed=new Set((r.resultados||[]).filter(x=>x.ok).map(x=>x.index));draft=draft.filter((_,i)=>!confirmed.has(i));matPending.textContent='Ver lista para salvar ('+draft.length+')';
    if(draft.length){renderTable(draft,true);matMessage((r.gravados||0)+' itens confirmados. Confira os demais itens já lançados antes de reenviar.');}
    else{await refreshItems();matMessage('Materiais gravados e conferidos na lista da SS.');}
   }catch(e){matMessage('Resultado não confirmado: '+e.message+'. Consulte os itens já lançados antes de reenviar.',true);}
   finally{matSave.disabled=false;}
  };
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
