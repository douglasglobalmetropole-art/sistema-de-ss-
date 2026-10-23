/* GLOBAL SS V10 - Relatorios originais completos agrupados por numero-base da SS.
 * Nao grava nada no SISCOM/uMov; concatena os PDFs originais no navegador.
 */
(()=>{
 'use strict';
 if(window.__globalSsAgrupadoV10)return;
 window.__globalSsAgrupadoV10=true;
 const ID='globalSsAgrupadoV10';
 const SS=/^\d{2}\/\d{2}-\d{6}-\d{2}$/;
 const api=()=>location.pathname.startsWith('/lote1')?'/lote1/api':'/api';
 const el=(tag,cls,txt)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=txt;return n;};
 let data=null,gerando=false;
 const style=el('style');style.textContent=`
 #${ID}{position:fixed;inset:0;background:#061d36ad;z-index:100000;display:flex;align-items:center;justify-content:center;padding:14px;font:14px Arial,sans-serif;color:#16395c}
 #${ID}[hidden]{display:none!important} #${ID} .ga-card{width:min(790px,98vw);max-height:92vh;overflow:auto;background:#fff;border-radius:12px;box-shadow:0 16px 50px #102c4b65}
 #${ID} .ga-header{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;background:#0e578e;color:white}
 #${ID} .ga-header h2{margin:0;font-size:19px} #${ID} .ga-close{font-size:24px;background:transparent;border:0;color:white;cursor:pointer}
 #${ID} .ga-content{padding:18px 20px} #${ID} .ga-muted{color:#637b91;font-size:12px;line-height:1.5}
 #${ID} .ga-stats{background:#e7f2fc;padding:12px;border-radius:7px;margin:12px 0;font-weight:bold}
 #${ID} .ga-list{max-height:42vh;overflow:auto;border:1px solid #d6e3f0;border-radius:7px}
 #${ID} .ga-row{display:grid;grid-template-columns:24px minmax(120px,1fr) 1fr;align-items:center;gap:8px;padding:10px;border-bottom:1px solid #e7eef5}
 #${ID} .ga-row:last-child{border-bottom:0} #${ID} .ga-row:nth-child(2n){background:#f8fbff}
 #${ID} .ga-footer{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;padding:12px 20px;border-top:1px solid #d6e3f0}
 #${ID} button.ga-btn{padding:10px 15px;border-radius:6px;border:1px solid #9fc0dd;background:white;color:#14578d;font-weight:600;cursor:pointer}
 #${ID} button.ga-primary{background:#0878d8;color:white;border-color:#0878d8} #${ID} button.ga-btn:disabled{opacity:.5;cursor:not-allowed}
 #${ID} .ga-status{margin-top:10px;white-space:pre-wrap;color:#22537b} #${ID} .ga-error{color:#b42318}
 #${ID} progress{width:100%;height:12px;margin-top:10px} @media(max-width:550px){#${ID} .ga-row{grid-template-columns:22px 1fr;gap:4px} #${ID} .ga-row small{grid-column:2}}
 `;
 document.head.append(style);
 const root=el('div');root.id=ID;root.hidden=true;root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label','Relatorios completos agrupados');
 const card=el('div','ga-card'),header=el('div','ga-header'),h=el('h2','', 'Relatório agrupado por SS'),close=el('button','ga-close','×');close.type='button';close.title='Fechar';header.append(h,close);
 const content=el('div','ga-content'),hint=el('div','ga-muted','Os relatórios originais do uMov serão unidos em ordem de sequência, preservando todas as páginas e fotos. Nenhuma operação será realizada no SISCOM.'),stats=el('div','ga-stats','Consultando sequências...'),list=el('div','ga-list'),status=el('div','ga-status'),progress=el('progress');progress.max=1;progress.value=0;progress.hidden=true;
 content.append(hint,stats,list,progress,status);
 const footer=el('div','ga-footer'),reload=el('button','ga-btn','Atualizar sequências'),view=el('button','ga-btn ga-primary','Gerar e visualizar PDF'),download=el('button','ga-btn ga-primary','Gerar e baixar PDF');
 for(const b of [reload,view,download])b.type='button';footer.append(reload,view,download);card.append(header,content,footer);root.append(card);document.body.append(root);
 const msg=(s,error=false)=>{status.textContent=s;status.classList.toggle('ga-error',error)};
 const busy=v=>{gerando=v;close.disabled=v;reload.disabled=v;view.disabled=v;download.disabled=v;list.querySelectorAll('input').forEach(x=>x.disabled=v||x.dataset.available!=='1')};
 const chosen=()=>[...list.querySelectorAll('input[data-available="1"]:checked')].map(x=>data.sequencias[Number(x.dataset.idx)]);
 const getSS=()=>{
  const detail=String(window.__detailSS?.ss||'').trim();
  const selected=Object.values(window.selected||{});
  const selectedSS=selected.length===1?String(selected[0]?.ss||'').trim():'';
  const field=String(document.getElementById('dss')?.textContent||'').trim();
  return [detail,selectedSS,field].find(x=>SS.test(x))||'';
 };
 async function load(ss){
  data=null;list.replaceChildren();stats.textContent='Consultando sequências da SS '+ss+' no banco uMov...';msg('');progress.hidden=true;
  const r=await fetch(api()+'/relatorios-agrupados?ss='+encodeURIComponent(ss),{credentials:'same-origin',cache:'no-store'});
  const j=await r.json().catch(()=>({}));if(!r.ok||!j.ok)throw Error(j.error||'Falha ao localizar as sequências');
  data=j;h.textContent='Relatórios agrupados — '+j.base;
  stats.textContent=`${j.total} sequência(s) encontrada(s) • ${j.disponiveis} com relatório original disponível`;
  if(!j.sequencias.length){msg('Nenhuma sequência encontrada no banco.');return;}
  j.sequencias.forEach((x,i)=>{
   const row=el('label','ga-row'),check=el('input');check.type='checkbox';check.dataset.idx=String(i);check.dataset.available=x.disponivel?'1':'0';check.checked=!!x.disponivel;check.disabled=!x.disponivel;
   const num=el('strong','',x.ss),state=el('small','',x.disponivel?'PDF original disponível':'Sem relatório original disponível');state.style.color=x.disponivel?'#147c4a':'#b45309';row.append(check,num,state);list.append(row);
  });
  msg('Marque as sequências desejadas. O sistema não incluirá relatórios ausentes nem duplicará a mesma sequência.');
 }
 const closeModal=()=>{if(!gerando)root.hidden=true;};close.onclick=closeModal;
 root.addEventListener('click',e=>{if(e.target===root)closeModal()});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!root.hidden)closeModal()});
 async function open(){const ss=getSS();if(!ss){alert('Selecione uma SS para agrupar seus relatórios.');return;}
  root.hidden=false;busy(true);try{await load(ss)}catch(e){stats.textContent='Consulta indisponível';msg(e.message,true)}finally{busy(false)}
 }
 reload.onclick=async()=>{const ss=getSS();if(!ss)return msg('SS inválida',true);busy(true);try{await load(ss)}catch(e){msg(e.message,true)}finally{busy(false)}};
 async function generate(mode){
  if(gerando||!data)return;
  const seqs=chosen();if(!seqs.length)return msg('Selecione pelo menos um relatório disponível.',true);
  if(seqs.length>30)return msg('Limite de 30 relatórios por arquivo. Desmarque algumas sequências.',true);
  if(!window.PDFLib?.PDFDocument)return msg('Biblioteca local de união de PDF indisponível. Reinstale o pacote V10.',true);
  // Abre aba no clique do usuário, antes de qualquer await, para evitar bloqueio de pop-up.
  const preview=mode==='view'?window.open('about:blank','_blank'):null;
  if(mode==='view'&&!preview)return msg('O navegador bloqueou a aba. Permita pop-ups ou use Gerar e baixar PDF.',true);
  busy(true);progress.hidden=false;progress.max=seqs.length;progress.value=0;
  let objectUrl=null;
  try{
   const merged=await PDFLib.PDFDocument.create();let totalBytes=0;
   for(let i=0;i<seqs.length;i++){
    const x=seqs[i];msg(`Convertendo e incorporando ${x.ss} (${i+1}/${seqs.length})...`);
    const response=await fetch(api()+'/relatorio-original-pdf',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({link:x.link,ss:x.ss})});
    if(!response.ok){const j=await response.json().catch(()=>({}));throw Error('SS '+x.ss+': '+(j.error||'falha HTTP '+response.status));}
    const bytes=await response.arrayBuffer();totalBytes+=bytes.byteLength;
    if(totalBytes>90*1024*1024)throw Error('Os PDFs excedem 90 MB. Divida o relatório em grupos menores.');
    if(new Uint8Array(bytes).slice(0,5).some((b,k)=>b!==[37,80,68,70,45][k]))throw Error('SS '+x.ss+': resposta não é PDF.');
    const source=await PDFLib.PDFDocument.load(bytes,{ignoreEncryption:false});
    const pages=await merged.copyPages(source,source.getPageIndices());pages.forEach(p=>merged.addPage(p));
    progress.value=i+1;
   }
   if(!merged.getPageCount())throw Error('Nenhuma página disponível.');
   msg('Finalizando '+merged.getPageCount()+' páginas...');
   const output=await merged.save({useObjectStreams:true});
   const blob=new Blob([output],{type:'application/pdf'});objectUrl=URL.createObjectURL(blob);
   const filename='RELATORIO_AGRUPADO_'+data.base.replace(/[^a-zA-Z0-9-]/g,'-')+'.pdf';
   if(mode==='view')preview.location.href=objectUrl;
   else{const a=el('a');a.href=objectUrl;a.download=filename;document.body.append(a);a.click();a.remove();}
   msg('PDF concluído: '+seqs.length+' relatórios completos, '+merged.getPageCount()+' páginas.');
   setTimeout(()=>URL.revokeObjectURL(objectUrl),180000);
  }catch(e){if(preview&&!preview.closed)preview.close();if(objectUrl)URL.revokeObjectURL(objectUrl);msg('Não foi gerado arquivo parcial. '+(e.message||'Erro ao agrupar PDFs.'),true)}
  finally{busy(false);progress.hidden=true}
 }
 view.onclick=()=>generate('view');download.onclick=()=>generate('download');
 // O botão já existe no sistema; captura para evitar handlers antigos de agrupamento.
 document.addEventListener('click',e=>{
  const button=e.target.closest?.('#groupedBtn');if(!button||button.hidden)return;
  e.preventDefault();e.stopImmediatePropagation();open();
 },true);
})();
