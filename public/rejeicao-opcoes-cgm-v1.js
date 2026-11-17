/* CGM_REJEICAO_UMOV_LOTE_V1: integra uMov separado da rejeicao oficial SISCOM. */
(() => {
  'use strict';
  if (window.__cgmRejOpcoesV1) return;
  window.__cgmRejOpcoesV1 = true;

  const $ = id => document.getElementById(id);
  const formato = /^\d{2}\/\d{2}-\d{6}-\d{2}$/;
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const lerItens = () => {
    try { return Object.values(selected || {}).filter(x => x && x.ss); }
    catch { return []; }
  };
  const telaValida = () => {
    try { return ['recepcao', 'baixar'].includes(currentScreen); }
    catch { return false; }
  };
  const erroOficial = x => {
    if (typeof x === 'string') return x;
    if (!x || typeof x !== 'object') return 'Resposta sem mensagem do SISCOM';
    const s = [x.error_message, x.mensagem, x.message, x.error, x.detail, x.detalhe]
      .filter(v => typeof v === 'string' && v.trim());
    if (Array.isArray(x.errors)) s.push(...x.errors.filter(v => typeof v === 'string'));
    return [...new Set(s)].join(' | ').slice(0, 1500) || 'Resposta sem mensagem do SISCOM';
  };

  const css = document.createElement('style');
  css.id = 'cgmRejeicaoOpcoesStyle';
  css.textContent = `
    #rejeitarUmovBtn.action { background:#fff8f8; border-color:#e3b7b7; color:#a72525 }
    #rejeitarUmovBtn.action b { color:#b42323 }
    #cgmRejLoteModal { position:fixed;inset:3%;z-index:1000002;background:#f6f9fd;
      border:1px solid #b9ccdf;box-shadow:0 15px 50px #0006;border-radius:9px;
      display:flex;flex-direction:column;font:12px Arial;color:#173c61;overflow:hidden }
    #cgmRejLoteModal header { background:#07599a;color:white;padding:12px 16px;
      display:flex;justify-content:space-between;align-items:center;gap:12px }
    #cgmRejLoteModal .cgm-body { padding:14px;overflow:auto;flex:1;min-height:0 }
    #cgmRejLoteModal .cgm-banner { background:#fff9e7;border:1px solid #e7d79c;
      border-radius:6px;padding:10px;margin-bottom:12px;line-height:1.5 }
    #cgmRejLoteModal .cgm-table { width:100%;border-collapse:collapse;background:white;table-layout:fixed }
    #cgmRejLoteModal th,#cgmRejLoteModal td { border-bottom:1px solid #dce6f0;padding:9px;
      text-align:left;overflow-wrap:anywhere;vertical-align:middle }
    #cgmRejLoteModal th { background:#e8f2fc;color:#07599a }
    #cgmRejLoteModal input { width:100%;box-sizing:border-box;padding:7px;border:1px solid #c5d6e9;border-radius:5px }
    #cgmRejLoteModal button { padding:8px 12px;border-radius:5px;border:1px solid #bdd1e5;
      background:white;color:#07599a;cursor:pointer }
    #cgmRejLoteModal footer { display:flex;gap:8px;flex-wrap:wrap;padding:12px 14px;
      background:#eef5fb;border-top:1px solid #d5e3f1 }
    #cgmRejLoteModal button:disabled { opacity:.5;cursor:not-allowed }
    #cgmRejLoteModal .cgm-msg { min-width:210px;white-space:pre-wrap }
  `;
  document.head.appendChild(css);

  function adicionarBotao() {
    const original = $('rejectBtn');
    const botao = $('rejeitarUmovBtn');
    if (!original || !botao) return;
    botao.onclick = marcarRejeitadaNoUmov;
    botao.hidden = !telaValida();
  }

  async function marcarRejeitadaNoUmov() {
    if (!telaValida()) return alert('Disponivel somente em Recepcao e Notas para Baixar.');
    const itens = lerItens();
    if (!itens.length) return alert('Marque uma ou mais SS para atualizar no uMov.');
    if (itens.length > 25) return alert('Limite de 25 tarefas por operacao.');
    const tarefas = [...new Set(itens.map(x => Number(x.tarefa)))];
    if (tarefas.some(n => !Number.isSafeInteger(n) || n <= 0))
      return alert('Selecao possui tarefa uMov invalida. Nenhuma mudanca efetuada.');
    const confirmou = prompt('ATENCAO: essa operacao altera APENAS a situacao de integracao no uMov, nao rejeita oficialmente no SISCOM.\n\n'+
      'Serao alteradas '+tarefas.length+' tarefas. Digite REJEITAR UMOV para confirmar:');
    if (confirmou !== 'REJEITAR UMOV') return;
    const btn = $('rejeitarUmovBtn');
    btn.disabled = true;
    try {
      const r = await fetch('/api/status-umov-rejeitar', {
        method:'POST', credentials:'same-origin', cache:'no-store',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({tarefas,confirmacao:'REJEITAR UMOV'})
      });
      const d = await r.json().catch(() => ({}));
      const ok = (d.resultados || []).filter(x => x.ok);
      const fail = (d.resultados || []).filter(x => !x.ok);
      const texto = ok.length + ' tarefa(s) atualizada(s) no uMov.\n' +
        (fail.length ? 'Falhas:\n'+fail.map(x=>'Tarefa '+x.tarefa+': '+erroOficial(x)).join('\n') : '') +
        (!r.ok ? '\n'+erroOficial(d) : '') +
        '\n\nIsso nao representa rejeicao SISCOM. Atualize a lista para conferir o status.';
      alert(texto);
      if (ok.length) {
        try { apply(); } catch { /* apenas atualizar manualmente */ }
      }
    } catch (e) { alert('Nao foi possivel confirmar o status do uMov: '+e.message+'\nVerifique antes de reenviar.'); }
    finally { btn.disabled = false; }
  }

  async function pedidoJson(url, options) {
    const resposta = await fetch(url, {credentials:'same-origin',cache:'no-store',...options});
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok) throw Error(erroOficial(dados) + ' [HTTP ' + resposta.status + ']');
    return dados;
  }
  async function acompanhar(id) {
    if (!id) throw Error('SISCOM nao retornou identificacao da consulta.');
    for (let i=0; i<65; i++) {
      await delay(1100);
      const dados = await pedidoJson('/api/siscom-gateway/jobs/'+encodeURIComponent(id));
      if (['erro','falha'].includes(dados.status)) throw Error(erroOficial(dados));
      if (['concluido','sucesso','finalizado'].includes(dados.status)) return dados.result || {};
    }
    throw Error('Consulta expirou. Confira o historico SISCOM; nao reenvie operacoes de escrita.');
  }
  async function validarNumero(numero) {
    const req = await pedidoJson('/api/siscom-gateway/rejeicao-validar', {
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({numero_ss:numero})
    });
    const j = await acompanhar(req.id);
    if (!j.validada || j.numero_ss !== numero) throw Error(erroOficial(j));
    return j;
  }

  let trabalhando = false;
  function abrirLote(itens) {
    if (!telaValida()) return;
    const todos = [...new Map(itens.map(x => [String(x.ss).trim(),x])).values()];
    if (todos.length > 25) return alert('Selecione no maximo 25 SS por conferencia.');
    const originais = [...todos];
    $('cgmRejLoteModal')?.remove();
    const modal = document.createElement('section');
    modal.id = 'cgmRejLoteModal';
    modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');
    modal.innerHTML = '<header><strong>Rejeicao SISCOM — Conferencia de duplicatas ('+todos.length+' SS)</strong>'+ 
      '<button id="cgmRejLoteFechar">Fechar</button></header>'+
      '<div class="cgm-body"><div class="cgm-banner">A selecao de varias SS foi habilitada para CONFERENCIA. '+
      'A API atual aceita consulta individual, mas o envio oficial de DUPLICIDADE ainda nao tem payload validado. '+
      '<strong>Nenhuma SS sera rejeitada no SISCOM por esta tela.</strong></div>'+
      '<table class="cgm-table"><thead><tr><th style="width:17%">SS selecionada</th>'+ 
      '<th style="width:24%">Rua / bairro</th><th style="width:21%">SS original que permanece</th>'+ 
      '<th>Validacao / resposta SISCOM</th></tr></thead><tbody>'+todos.map((x,i)=>
       '<tr><td><strong>'+esc(x.ss)+'</strong></td><td>'+esc(x.logradouro||x.rua||'')+'<br>'+esc(x.bairro||'')+'</td>'+ 
       '<td><input data-original="'+i+'" placeholder="00/00-000000-00" autocomplete="off" maxlength="15"></td>'+ 
       '<td class="cgm-msg" data-msg="'+i+'">Aguardando validacao</td></tr>').join('')+
      '</tbody></table></div><footer><button id="cgmRejLoteValidar">Validar SS no SISCOM</button>'+ 
      '<button id="cgmRejLoteCopiar">Copiar resultado</button>'+ 
      '<button disabled title="Envio bloqueado ate confirmar payload oficial de duplicidade">Rejeitar lote no SISCOM (aguardando integracao)</button>'+ 
      '<span id="cgmRejLoteStatus">'+todos.length+' SS selecionadas</span></footer>';
    document.body.appendChild(modal);
    const msg = i => modal.querySelector('[data-msg="'+i+'"]');
    const setStatus = txt => { const el=$('cgmRejLoteStatus'); if(el) el.textContent=txt; };
    const fechar = () => {if(trabalhando)return alert('Validacao em andamento.'); modal.remove();};
    $('cgmRejLoteFechar').onclick=fechar;
    $('cgmRejLoteValidar').onclick=async()=>{
      if(trabalhando)return;
      const originaisSS=todos.map((_,i)=>modal.querySelector('[data-original="'+i+'"]')?.value.trim()||'');
      const invalidas=originaisSS.map((original,i)=>({original,i})).filter(x=>x.original&&(!formato.test(x.original)||x.original===todos[x.i].ss));
      if(invalidas.length)return alert('Revise as SS originais. Devem ter formato valido e ser diferentes das selecionadas.');
      trabalhando=true; $('cgmRejLoteValidar').disabled=true;
      for(let i=0;i<todos.length;i++){
        if(!modal.isConnected)break;
        const numero=todos[i].ss,original=originaisSS[i];
        setStatus('Validando '+(i+1)+' de '+todos.length+' no SISCOM: '+numero);
        try {
          if(!formato.test(numero))throw Error('Numero da SS invalido.');
          const r=await validarNumero(numero);
          let mensagem='SS elegivel para conferencia: '+(r.unidade||r.executor||'unidade nao informada');
          if(original){
            try {await validarNumero(original); mensagem+=' | SS original localizada: '+original;}
            catch(e){mensagem+=' | Erro na SS original: '+e.message;}
          }
          msg(i).textContent=mensagem+' | Relacao de duplicidade nao validada';
        } catch(e) {msg(i).textContent='SISCOM: '+e.message;}
      }
      trabalhando=false; $('cgmRejLoteValidar').disabled=false;
      setStatus('Conferencia concluida. Envio oficial bloqueado ate validar a API de duplicidade.');
    };
    $('cgmRejLoteCopiar').onclick=()=>{
      const texto=todos.map((x,i)=>x.ss+' | '+(modal.querySelector('[data-original="'+i+'"]')?.value.trim()||'Sem original')+' | '+msg(i).textContent).join('\n');
      if(navigator.clipboard?.writeText)navigator.clipboard.writeText(texto).then(()=>alert('Resultado copiado')).catch(()=>prompt('Copie o resultado:',texto));
      else prompt('Copie o resultado:',texto);
    };
  }

  function interceptar(evento) {
    if (!telaValida()) return;
    const registros = lerItens();
    if (registros.length <= 1) return; // Rejeicao SISCOM individual preservada.
    evento.preventDefault();evento.stopImmediatePropagation();
    abrirLote(registros);
  }
  function iniciar() {
    adicionarBotao();
    if ($('rejectBtn') && !$('rejectBtn').dataset.cgmLoteAttached) {
      $('rejectBtn').addEventListener('click', interceptar, true);
      $('rejectBtn').dataset.cgmLoteAttached = '1';
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
  setInterval(iniciar, 1400);
})();