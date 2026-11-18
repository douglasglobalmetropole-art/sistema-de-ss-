/* CGM_DUPLICAR_SS_UMOV_V1 - Copiar SS em Notas para Baixar. */
(function(){
  'use strict';
  const actions=document.querySelector('.actions');
  if(!actions||document.getElementById('duplicateBtn'))return;
  const button=document.createElement('button');
  button.id='duplicateBtn';button.type='button';button.className='action';button.hidden=true;
  button.innerHTML='<b>▣</b>Copiar SS';
  const anchor=document.getElementById('rejectBtn');
  if(anchor)actions.insertBefore(button,anchor);else actions.appendChild(button);
  if(typeof currentScreen!=='undefined'&&currentScreen==='baixar')button.hidden=false;
  const style=document.createElement('style');
  style.textContent=`
  #cgmDupModal{position:fixed;inset:0;z-index:110000;background:rgba(7,35,63,.55);display:none;align-items:center;justify-content:center;padding:16px}
  #cgmDupModal.open{display:flex}
  #cgmDupModal .cgm-dup-card{width:min(520px,96vw);max-height:92vh;overflow-y:auto;background:#fff;border:1px solid #b7d0e3;border-radius:9px;box-shadow:0 18px 52px #062b4750;color:#163e67;font:12px Arial,sans-serif}
  #cgmDupModal .cgm-dup-head{background:#07599a;color:white;padding:13px 16px;display:flex;align-items:center;justify-content:space-between;font-weight:700;font-size:14px}
  #cgmDupModal .cgm-dup-body{padding:16px;display:grid;gap:12px}
  #cgmDupModal .cgm-dup-source{padding:10px;background:#eef5fb;border:1px solid #d3e3ef;border-radius:5px;line-height:1.5}
  #cgmDupModal label{display:block;font-weight:700;margin-bottom:5px}
  #cgmDupModal input{width:100%;box-sizing:border-box;height:36px;border:1px solid #b9cede;border-radius:5px;padding:7px 9px;background:#fff;color:#153e6d;font:12px Arial}
  #cgmDupModal .cgm-dup-results{max-height:140px;overflow-y:auto;border:1px solid #d7e3ed;border-radius:5px;margin-top:4px}
  #cgmDupModal .cgm-dup-choice{display:block;width:100%;padding:9px 10px;background:#fff;border:0;border-bottom:1px solid #e7eef4;text-align:left;color:#154a77;cursor:pointer}
  #cgmDupModal .cgm-dup-choice:hover{background:#eaf4fd}
  #cgmDupModal .cgm-dup-dates{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  #cgmDupModal .cgm-dup-footer{padding:12px 16px;display:flex;justify-content:flex-end;gap:8px;border-top:1px solid #dce7f0}
  #cgmDupModal .cgm-dup-btn{border:1px solid #a7c5df;background:#fff;color:#07599a;padding:9px 14px;border-radius:5px;font-weight:700;cursor:pointer}
  #cgmDupModal .cgm-dup-btn.primary{background:#07599a;color:#fff;border-color:#07599a}
  #cgmDupModal .cgm-dup-btn:disabled{opacity:.55;cursor:wait}
  #cgmDupModal .cgm-dup-status{white-space:pre-wrap;line-height:1.5;font-size:12px}
  #cgmDupModal .cgm-dup-muted{font-size:11px;color:#607a92;line-height:1.4}
  `;
  document.head.appendChild(style);
  const modal=document.createElement('div');modal.id='cgmDupModal';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label','Copiar SS');
  modal.innerHTML=`<div class="cgm-dup-card"><div class="cgm-dup-head"><span>Copiar SS</span><button type="button" class="cgm-dup-btn" id="cgmDupX">Fechar ×</button></div>
  <div class="cgm-dup-body">
    <div class="cgm-dup-source" id="cgmDupSource"></div>
    <div><label for="cgmDupAgent">Bombeiro de destino (opcional)</label><input id="cgmDupAgent" autocomplete="off" placeholder="Digite o código ou nome para pesquisar"/><div id="cgmDupAgentSelected" class="cgm-dup-muted">Em branco: nova tarefa sem equipe, para a Recepção.</div><div class="cgm-dup-results" id="cgmDupResults" hidden></div></div>

    <div class="cgm-dup-muted">A cópia mantém a mesma SS e o local de atendimento, mas recebe um novo ID de tarefa. O histórico de execução e as fotos não são duplicados. A SS original permanece intacta.</div>
    <div class="cgm-dup-status" id="cgmDupStatus" role="status"></div>
  </div><div class="cgm-dup-footer"><button type="button" class="cgm-dup-btn" id="cgmDupCancel">Cancelar</button><button type="button" class="cgm-dup-btn primary" id="cgmDupConfirm">Copiar SS</button></div></div>`;
  document.body.appendChild(modal);
  const $=id=>document.getElementById(id);
  const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let source=null,chosen=null,wait=null,busy=false,done=false;
  function close(){if(busy)return;modal.classList.remove('open');$('cgmDupResults').hidden=true}
  $('cgmDupX').onclick=close;$('cgmDupCancel').onclick=close;
  modal.addEventListener('click',e=>{if(e.target===modal)close()});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&modal.classList.contains('open'))close()});
  button.onclick=()=>{
    if(typeof currentScreen==='undefined'||currentScreen!=='baixar')return alert('Copiar SS esta disponivel somente em Notas para Baixar.');
    const picked=Object.values(typeof selected==='object'?selected:{});
    if(picked.length>1)return alert('Para gerar uma cÃ³pia, selecione somente uma SS por vez.');
    const x=picked[0]||(window.__detailSS?.tarefa?window.__detailSS:null);
    if(!x?.tarefa)return alert('Selecione a SS que deseja copiar.');
    source=x;chosen=null;done=false;busy=false;
    $('cgmDupSource').innerHTML='<b>SS '+safe(x.ss)+'</b> — tarefa uMov '+safe(x.tarefa)+'<div>'+safe([x.logradouro,x.numero,x.bairro].filter(Boolean).join(', '))+'</div>';
    $('cgmDupAgent').value='';$('cgmDupAgentSelected').textContent='Em branco: nova tarefa sem equipe, para a Recepção.';
    $('cgmDupResults').hidden=true;$('cgmDupResults').innerHTML='';$('cgmDupStatus').textContent='';

    $('cgmDupConfirm').disabled=false;$('cgmDupConfirm').textContent='Copiar SS';$('cgmDupCancel').textContent='Cancelar';
    modal.classList.add('open');$('cgmDupAgent').focus();
    fetch('/api/duplicar-ss/origem/'+encodeURIComponent(x.tarefa),{credentials:'same-origin'})
      .then(async r=>{const j=await r.json();if(!r.ok)throw Error(j.error||'Consulta indisponivel');return j})
      .then(j=>{if(source!==x||!modal.classList.contains('open'))return;if(j.agente){chosen={id:Number(j.agente),nome:j.nome||String(j.agente)};$('cgmDupAgent').value=chosen.id+' - '+chosen.nome;$('cgmDupAgentSelected').textContent='Bombeiro da nota original: '+chosen.nome;}})
      .catch(()=>{$('cgmDupAgentSelected').textContent='Nao foi possivel identificar o bombeiro original. Selecione um bombeiro ou deixe em branco para Recepcao.';});
  };
  $('cgmDupAgent').addEventListener('input',()=>{
    chosen=null;$('cgmDupAgentSelected').textContent=$('cgmDupAgent').value.trim()?'Selecione um bombeiro na lista abaixo.':'Em branco: nova tarefa sem equipe, para a Recepção.';
    clearTimeout(wait);const q=$('cgmDupAgent').value.trim();if(!q){$('cgmDupResults').hidden=true;return}
    wait=setTimeout(async()=>{
      try{const r=await fetch('/api/equipes?q='+encodeURIComponent(q));const j=await r.json();if(!r.ok)throw Error(j.error||'Falha na busca');
        if($('cgmDupAgent').value.trim()!==q)return;
        const rows=(j.rows||[]).slice(0,35);
        $('cgmDupResults').innerHTML=rows.map(x=>'<button type="button" class="cgm-dup-choice" data-id="'+safe(x.id)+'" data-name="'+safe(x.nome)+'"><b>'+safe(x.id)+'</b> — '+safe(x.nome)+'</button>').join('')||'<div style="padding:10px">Nenhum bombeiro encontrado.</div>';
        $('cgmDupResults').hidden=false;
        $('cgmDupResults').querySelectorAll('[data-id]').forEach(el=>el.onclick=()=>{chosen={id:Number(el.dataset.id),nome:el.dataset.name};$('cgmDupAgent').value=chosen.id+' - '+chosen.nome;$('cgmDupAgentSelected').textContent='Destino: '+chosen.nome;$('cgmDupResults').hidden=true});
      }catch(e){$('cgmDupResults').hidden=false;$('cgmDupResults').textContent='Falha ao consultar bombeiros: '+e.message}
    },220);
  });
  $('cgmDupConfirm').onclick=async()=>{
    if(busy||done||!source)return;
    if($('cgmDupAgent').value.trim()&&!chosen)return alert('Selecione o bombeiro na lista ou deixe o campo completamente em branco.');
    const destino=chosen?chosen.nome:'Recepcao (sem bombeiro)';
    if(!confirm('Criar nova tarefa uMov para SS '+source.ss+'?\nDestino: '+destino+'\nA tarefa original nao sera alterada.'))return;
    busy=true;$('cgmDupConfirm').disabled=true;$('cgmDupConfirm').textContent='Criando...';$('cgmDupStatus').textContent='Enviando criacao ao uMov. Nao repita a operacao.';
    try{
      const r=await fetch('/api/duplicar-ss',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tarefa:Number(source.tarefa),agente:chosen?.id??null})});
      const j=await r.json();if(!r.ok&&!j.criada)throw Error(j.error||'Falha ao criar copia');
      done=true;
      $('cgmDupStatus').textContent='Copia criada no uMov!\nSS: '+(j.ss||source.ss)+'\nNova tarefa: '+(j.novaTarefa||'ID nao retornado')+'\nDestino: '+destino+'\nSituacao: '+(j.situacao||'Aguardando confirmacao')+'\n'+(j.confirmada?'Destino confirmado no uMov.':'Destino ainda nao confirmado no uMov.')+(j.avisos?.length?'\n'+j.avisos.join('\n'):'')+(j.alerta?'\n'+j.alerta:'');
      $('cgmDupConfirm').textContent='Cópia criada';$('cgmDupCancel').textContent='Fechar';
      if(typeof window.notify==='function')window.notify('Copia criada: '+(j.novaTarefa||'conferir uMov'),j.confirmada?'success':'warning');
    }catch(e){$('cgmDupStatus').textContent='Nao foi possivel confirmar a criacao: '+e.message+'\nSe houve falha de rede, confira o uMov antes de tentar novamente.';$('cgmDupConfirm').textContent='Verificar antes de repetir';}
    finally{busy=false;$('cgmDupCancel').disabled=false;}
  };
})();

/* CGM_ACOES_SS_PADRAO_V4: padronizacao restrita aos dois botoes */
(function(){
  if(document.getElementById('cgm-acoes-ss-padrao-v4'))return;
  const s=document.createElement('style');s.id='cgm-acoes-ss-padrao-v4';
  s.textContent=`#duplicateBtn,#cgmRotaAcao{box-sizing:border-box!important;position:static!important;float:none!important;transform:none!important;inset:auto!important;margin:0!important;min-width:0!important;max-width:100%!important;width:100%!important;min-height:34px!important;height:auto!important;padding:6px 8px!important;display:flex!important;align-items:center!important;justify-content:center!important;gap:5px!important;text-align:center!important;white-space:normal!important;line-height:1.2!important;font:inherit!important;font-size:11px!important;font-weight:600!important;border-radius:6px!important;vertical-align:middle!important}#duplicateBtn b,#cgmRotaAcao b{display:inline-block!important;position:static!important;flex:none!important;font-size:13px!important;line-height:1!important;margin:0!important}#duplicateBtn[hidden],#cgmRotaAcao[hidden]{display:none!important}`;
  document.head.appendChild(s);
})();