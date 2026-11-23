/* CGM_UMOV_MANUAL_V1 - Baixa e rejeicao de status SOMENTE no uMov. */
(function(){
 'use strict';
 if(window.__cgmUmovManualV1)return; window.__cgmUmovManualV1=true;
 const $=id=>document.getElementById(id);
 const SS=/^\d{2}\/\d{2}-\d{6}-\d{2}$/;
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const pausa=ms=>new Promise(r=>setTimeout(r,ms));
 const apiPrefix=location.pathname.match(/^\/(ODVV|ODCV|ODLS|ODVT|ODLN|lote1)(?=\/|$)/i)?.[0]||'';
 const selected=()=>{
  const xs=typeof window.__cgmGetSelectedUmov==='function'?window.__cgmGetSelectedUmov():[];
  return [...new Map(xs.filter(x=>x&&x.ss).map(x=>[Number(x.tarefa),{ss:String(x.ss).trim(),tarefa:Number(x.tarefa),situacao:String(x.situacao_campo||'')}])).values()];
 };
 let ocupado=false;
 const css=document.createElement('style');css.textContent=`
 #cgmUmovManualModal{position:fixed;inset:0;background:#061c34b8;z-index:2000000;display:flex;align-items:center;justify-content:center;padding:18px;font:13px Arial,sans-serif}
 #cgmUmovManualModal .cgm-umov-card{background:white;color:#173c61;border-radius:11px;width:min(670px,98vw);max-height:90vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 18px 54px #001b3959}
 #cgmUmovManualModal header{background:#07599a;color:white;padding:14px 18px;display:flex;justify-content:space-between;align-items:center}
 #cgmUmovManualModal h3{font-size:16px;margin:0}
 #cgmUmovManualModal .body{padding:17px;overflow:auto}
 #cgmUmovManualModal .alerta{background:#eef6ff;border-left:3px solid #1171be;padding:11px;line-height:1.6;margin-bottom:14px}
 #cgmUmovManualModal label{display:block;font-weight:700;margin-bottom:6px}
 #cgmUmovManualModal select{width:100%;padding:9px;border:1px solid #c1d4e5;border-radius:6px;background:#fff;color:#173c61}
 #cgmUmovManualModal .rows{margin:13px 0;max-height:180px;overflow:auto;border:1px solid #dde7f0;border-radius:7px}
 #cgmUmovManualModal .rows div{padding:7px 10px;border-bottom:1px solid #e7edf3}
 #cgmUmovManualModal .rows div:last-child{border-bottom:0}
 #cgmUmovManualModal footer{padding:12px 17px;background:#f1f7fc;display:flex;gap:10px;justify-content:flex-end;align-items:center;flex-wrap:wrap}
 #cgmUmovManualModal button{padding:10px 14px;border-radius:6px;border:1px solid #b0c6dc;background:white;color:#07599a;cursor:pointer;font-weight:700}
 #cgmUmovManualModal .primary{background:#07599a;color:white;border-color:#07599a}
 #cgmUmovManualModal button:disabled{opacity:.55;cursor:wait}
 #cgmUmovManualModal .msg{margin-top:11px;white-space:pre-wrap;line-height:1.6}
 `;document.head.append(css);
 const fetchJson=async(url,payload)=>{
  const r=await fetch(apiPrefix+url,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const data=await r.json().catch(()=>({}));
  if(!r.ok&&r.status!==207)throw Error(data.error||('Falha HTTP '+r.status));
  return data;
 };
 function abrir(tipo){
  if(ocupado)return;
  const tela=typeof currentScreen==='string'?currentScreen:'';
  if(tipo==='Baixada'&&tela!=='baixar')return alert('A baixa manual uMov esta disponivel somente em Notas para Baixar.');
  if(tipo!=='Baixada'&&!['recepcao','baixar'].includes(tela))return alert('Rejeicao manual uMov somente em Recepcao e Notas para Baixar.');
  const itens=selected();
  if(!itens.length)return alert('Selecione uma ou mais SS na lista.');
  if(itens.length>25)return alert('Selecione ate 25 SS por operacao manual.');
  if(itens.some(x=>!SS.test(x.ss)||!Number.isSafeInteger(x.tarefa)||x.tarefa<1))return alert('SS ou tarefa invalida na selecao.');
  $('cgmUmovManualModal')?.remove();
  const modal=document.createElement('section');modal.id='cgmUmovManualModal';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');
  modal.innerHTML=`<div class="cgm-umov-card"><header><h3>Processo manual · Status uMov</h3><button id="cgmUmovFechar" type="button">×</button></header>
   <div class="body"><div class="alerta"><strong>Somente uMov.</strong> Esta operação altera exclusivamente o campo <strong>Status de Integração</strong> pela API uMov.
   Não consulta o histórico, não baixa e não rejeita SS no SISCOM. Para o procedimento oficial, use os botões <strong>Baixar</strong> e <strong>Rejeitar</strong>.</div>
   <label for="cgmUmovStatus">Status de integração a solicitar</label><select id="cgmUmovStatus">${tipo==='Baixada'?'<option value="Baixada">Baixada</option>':'<option value="Rejeitada">Rejeitada</option><option value="Duplicada">Duplicada (duplicata)</option>'}</select>
   <p><strong>${itens.length} SS selecionada(s)</strong></p><div class="rows">${itens.map(x=>`<div>${esc(x.ss)} <small>· ${esc(x.situacao)}</small></div>`).join('')}</div>
   <div id="cgmUmovMensagem" class="msg" aria-live="polite">Aguardando confirmação do operador.</div></div>
   <footer><button id="cgmUmovCancelar" type="button">Cancelar</button><button class="primary" id="cgmUmovEnviar" type="button">Confirmar atualização no uMov</button></footer></div>`;
  document.body.append(modal);
  const msg=$('cgmUmovMensagem'),enviar=$('cgmUmovEnviar');
  const fechar=()=>{if(!ocupado)modal.remove()};
  $('cgmUmovFechar').onclick=fechar;$('cgmUmovCancelar').onclick=fechar;
  enviar.onclick=async()=>{
   if(ocupado)return;
   const status=$('cgmUmovStatus').value;
   if(!confirm('ATUALIZAÇÃO MANUAL: alterar '+itens.length+' SS para '+status+' SOMENTE no uMov, SEM validação ou baixa/rejeição no SISCOM?'))return;
   ocupado=true;enviar.disabled=true;$('cgmUmovCancelar').disabled=true;$('cgmUmovFechar').disabled=true;
   msg.textContent='Enviando atualizações ao uMov...';
   const payload={processo:'MANUAL_UMOV',confirmacao:'CONFIRMAR STATUS UMOV',status,itens:itens.map(x=>({ss:x.ss,tarefa:x.tarefa}))};
   try{
    const r=await fetchJson('/api/umov/manual-status',payload);
    const enviados=(r.resultados||[]).filter(x=>x.ok&&!x.ja_aplicado);
    const ja=(r.resultados||[]).filter(x=>x.ok&&x.ja_aplicado);
    const falhas=(r.resultados||[]).filter(x=>!x.ok);
    let confirmados=ja.map(x=>({ss:x.ss,tarefa:x.tarefa,status_integracao:status}));
    let erroConsulta='';
    if(enviados.length){
     msg.textContent=`Solicitações aceitas: ${enviados.length}. Conferindo a sincronização no uMov...`;
     for(let tentativa=0;tentativa<8;tentativa++){
      if(tentativa)await pausa(1500);
      try{
       const retorno=await fetchJson('/api/umov/manual-status/conferir',{status,itens:enviados.map(x=>({ss:x.ss,tarefa:x.tarefa}))});
       confirmados=[...ja.map(x=>({ss:x.ss,tarefa:x.tarefa,status_integracao:status})),...(retorno.resultados||[]).filter(x=>x.confirmado)];
       if(confirmados.length===enviados.length+ja.length)break;
      }catch(e){erroConsulta=e.message;break}
     }
    }
    const ids=new Set(confirmados.map(x=>String(x.tarefa)));
    const pendentes=enviados.filter(x=>!ids.has(String(x.tarefa)));
    msg.innerHTML='<strong>Resultado do processo manual uMov</strong>\n'+
      esc(`Solicitações aceitas pela API: ${enviados.length}\nJá com status solicitado: ${ja.length}\nConfirmadas no uMov: ${confirmados.length}\nAguardando sincronização: ${pendentes.length}\nFalhas: ${falhas.length}`)+
      (falhas.length?'<br>'+esc(falhas.map(x=>x.ss+': '+(x.error||'erro')).join('\n')):'')+
      (erroConsulta?'<br>'+esc('Consulta: '+erroConsulta):'')+
      '<br><strong>Não representa baixa ou rejeição oficial no SISCOM.</strong>';
    if(confirmados.length){
      try{
       const porId=new Map(confirmados.map(x=>[String(x.tarefa),x]));
       if(typeof raw!=='undefined'&&Array.isArray(raw))raw.forEach(x=>{if(porId.has(String(x.tarefa)))x.status_integracao=porId.get(String(x.tarefa)).status_integracao||status;});
       if(typeof load==='function'&&!window.__buscaSSAtiva)Promise.resolve().then(()=>load(true)).catch(()=>{});
      }catch(e){console.warn('[CGM UMOV MANUAL] Atualizar lista:',e.message)}
    }
    if(pendentes.length)msg.insertAdjacentHTML('beforeend','<br>Não reenvie os registros pendentes sem consultar novamente o status no uMov.');
   }catch(e){msg.textContent='Nenhuma confirmação obtida: '+e.message+'. Confira o estado no uMov antes de reenviar.';}
   finally{ocupado=false;enviar.disabled=false;$('cgmUmovCancelar').disabled=false;$('cgmUmovFechar').disabled=false;}
  };
 }
 document.addEventListener('click',event=>{
  const btn=event.target.closest?.('#cgmUmovLoteBtn,#rejeitarUmovBtn');
  if(!btn)return;
  event.preventDefault();event.stopImmediatePropagation();
  abrir(btn.id==='cgmUmovLoteBtn'?'Baixada':'Rejeitada');
 },true);
})();
