/* Global SS | Recepcao: Matriz e selecao de SS duplicatas.
   As TAGs sao aplicadas somente por acao expressa e validada no servidor. */
(()=>{
'use strict';
const $=id=>document.getElementById(id);
const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const classe=s=>/REJEIT/i.test(s)?'rejected':/RETORN|ENCERR|EXECUT|BAIXAD/i.test(s)?'done':/CAMPO/i.test(s)?'field':'scheduled';
const categoria={provavel:'Possivel duplicata',revisar:'Revisar',relacionado:'Servico relacionado',proximidade:'Proximidade'};
const cor={provavel:'high',revisar:'medium',relacionado:'low',proximidade:'neutral'};
const data=v=>{if(!v)return 'Nao informada';const d=new Date(v);return Number.isFinite(d.getTime())?d.toLocaleString('pt-BR'):'Nao informada';};
let consultaAtual=null,busy=false;
function estilos(){if($('dupMatrizCSS'))return;const el=document.createElement('style');el.id='dupMatrizCSS';el.textContent=`
 #dupBox .dm-summary{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:10px 0 14px}
 #dupBox .dm-matriz{border:1px solid #86c5ed;border-left:5px solid #0879c1;background:#eff8ff;border-radius:8px;padding:13px}
 #dupBox .dm-matriz strong{font-size:16px;color:#07599a}
 #dupBox .dm-label{font-weight:800;font-size:12px;color:#165f9e;text-transform:uppercase;letter-spacing:.2px}
 #dupBox .dm-meta{color:#57738e;font-size:11px;margin-top:5px;line-height:1.5}
 #dupBox .dm-warning{padding:12px;border-left:4px solid #db9828;background:#fff8e9;border-radius:6px;margin:10px 0;color:#765212;font-size:11px;line-height:1.5}
 #dupBox .dm-select{display:flex;align-items:center;gap:8px;padding:6px 2px;color:#255274;font-weight:700}
 #dupBox .dm-select input{width:16px;height:16px;accent-color:#0767ae;cursor:pointer}
 #dupBox .dm-select input:disabled{cursor:not-allowed}
 #dupBox .dm-action{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;padding:12px;background:#eef6fe;border:1px solid #cfdfed;border-radius:7px;margin:12px 0}
 #dupBox .dm-action .dupAction:disabled{background:#adc3d5;border-color:#adc3d5;cursor:not-allowed}
 #dupBox .dm-feedback{font-size:12px;color:#1a5c89;line-height:1.5}
 #dupBox .dm-secondary{margin-top:12px}
 #dupBox .dm-secondary summary{font-weight:700;color:#07599a;cursor:pointer;margin-bottom:9px}
 #dupBox .dm-tiny{font-size:10px;color:#607a91}
 @media(max-width:650px){#dupBox .dm-summary{grid-template-columns:1fr}}
 `;document.head.appendChild(el);}
function abrir(html){const modal=$('dupModal');if(!modal)return alert('Janela de duplicidades nao encontrada.');$('dupContent').innerHTML=html;modal.classList.add('open');$('dupClose')?.focus();}
function fechar(){$('dupModal')?.classList.remove('open');}
function cabecalho(ss){return `<div class="dupSummary"><div class="dupSumCard"><div class="dupIcon">▣</div><div><div class="dupMeta">SS consultada</div><div class="dupMainVal">${safe(ss)}</div></div></div><div class="dupSumCard"><div class="dupIcon">⌕</div><div><div class="dupMeta">Fonte</div><div class="dupMainVal">Indice Global SS</div></div></div></div>`;}
function linha(d,{matriz=false,selecionavel=false,habilitado=false}={}){
 const titulo=matriz?'Matriz':selecionavel?'Possivel duplicata':categoria[d.categoria]||'Revisar';
 const select=selecionavel?`<label class="dm-select"><input type="checkbox" data-dup-tarefa="${Number(d.tsk_id)}" aria-label="Selecionar ${safe(d.ss)}" ${habilitado?'':'disabled'}> <span class="dm-tiny">Marcar</span></label>`:matriz?'<span class="dupBadge field">Matriz</span>':'—';
 return `<tr><td>${select}</td><td class="dupSS">${safe(d.ss)}</td><td>${safe(data(d.registro_em))}</td>
  <td><span class="dupBadge ${classe(d.situacao||'')}">${safe(d.situacao||'Nao informado')}</span></td>
  <td>${safe(d.matricula||'—')}</td><td>${safe(d.hidrometro||'—')}</td>
  <td>${safe(d.servico||'—')}</td>
  <td><span class="dupBadge ${matriz?'field':cor[d.categoria]||'neutral'}">${safe(titulo)}</span>
  ${Number.isFinite(Number(d.pontos))&&d.pontos!==undefined?`<div class="dm-tiny">${Number(d.pontos)} pts</div>`:''}</td></tr>`;
}
function quadro(j){
 const alvo=j.alvo||{},matriz=j.matriz,duplicates=j.duplicatas||[],todos=j.resultados||[];
 const chaves=new Set([...(matriz?[matriz.ss]:[]),...duplicates.map(r=>r.ss)]);
 const extras=todos.filter(r=>!chaves.has(r.ss));
 const lista=matriz?[matriz,...duplicates]:[];
 const head='<thead><tr><th>Selecionar</th><th>SS</th><th>Abertura</th><th>Situacao</th><th>Matricula</th><th>Hidrometro</th><th>Servico</th><th>Classificacao</th></tr></thead>';
 const linhas=lista.map((r,i)=>linha(r,{matriz:i===0,selecionavel:i>0,habilitado:!!j.pode_selecionar})).join('');
 const cobertura=j.cobertura||{};
 const bloqueio=j.motivo_bloqueio?`<div class="dm-warning"><strong>Marcacao indisponivel:</strong> ${safe(j.motivo_bloqueio)}</div>`:'';
 const matrizBox=matriz?`<div class="dm-matriz"><div class="dm-label">▣ Matriz</div><strong>${safe(matriz.ss)}</strong>
 <div class="dm-meta">Data de abertura: ${safe(data(matriz.registro_em))} · Matricula: ${safe(matriz.matricula||'—')} · Hidrometro: ${safe(matriz.hidrometro||'—')}</div>
 <div class="dm-meta">Esta SS e a referencia do grupo. A TAG nao sera aplicada nela.</div></div>`:
 `<div class="dm-warning">Nao foi possivel definir uma Matriz para as correspondencias encontradas. Nenhuma TAG sera gravada.</div>`;
 return `${cabecalho(alvo.ss||'—')}${matrizBox}
 <div class="dupSectionHead" style="margin-top:15px"><h3>Grupo de duplicidades <span class="dupCount">${duplicates.length}</span></h3>
 <span class="dm-tiny">Somente correspondencias fortes do mesmo tipo de servico</span></div>
 <div class="dupTableArea">${lista.length?`<table class="dupTable">${head}<tbody>${linhas}</tbody></table>`:
 '<div class="dupEmpty">Nenhuma duplicata elegivel localizada no indice.</div>'}</div>
 ${bloqueio}
 <div class="dm-action"><div><div class="dm-label">TAG nas SS selecionadas</div><div class="dm-meta">${matriz?safe('DUPLICATA DA SS '+matriz.ss):'Selecione uma Matriz valida'}</div>
 <div class="dm-tiny" id="dmContador">0 SS selecionadas</div></div>
 <button id="dupAplicarTag" class="dupAction" type="button" ${j.pode_selecionar&&duplicates.length?'disabled':'disabled'}>Aplicar TAG nas selecionadas</button></div>
 <div id="dmFeedback" class="dm-feedback" role="status" aria-live="polite"></div>
 <details class="dm-secondary" ${extras.length?'':'style="display:none"'}><summary>Outras correspondencias: ${extras.length} (somente consulta)</summary>
 <div class="dupTableArea"><table class="dupTable">${head}<tbody>${extras.map(r=>linha(r)).join('')}</tbody></table></div>
 <div class="dm-tiny">Mesmo endereco com servico diferente, ou mesma rua, nao gera TAG automaticamente.</div></details>
 <div class="dupCriteria"><h3>ⓘ Criterios de comparacao</h3><div class="dupCriteriaGrid">
 <div class="dupCriterion"><span>Mesma matricula valida</span><span class="dupPoints">40 pts</span></div>
 <div class="dupCriterion"><span>Mesmo hidrometro valido</span><span class="dupPoints">30 pts</span></div>
 <div class="dupCriterion"><span>Mesmo endereco completo</span><span class="dupPoints">20 pts</span></div>
 <div class="dupCriterion"><span>Mesmo servico</span><span class="dupPoints">10 pts</span></div>
 <div class="dupCriterion"><span>Mesma rua sem numero</span><span class="dupPoints">5 pts</span></div>
 <div class="dupCriterion"><span>Mesma rua, numero diferente</span><span class="dupPoints">3 pts</span></div></div>
 <div class="dupInfo"><b>Cobertura: ${cobertura.completa?'varredura inicial concluida':'INDICE PARCIAL'}</b> — ${safe(cobertura.lidos??0)} tarefas percorridas.
 ${cobertura.atualizado_em?'Ultima sincronizacao: '+safe(data(cobertura.atualizado_em))+'.':''}
 A definicao da Matriz usa data/hora de abertura. A aplicacao de TAG depende de autorizacao, revisao e confirmacao. Nao ha baixa ou rejeicao automatica.</div></div>
 <div class="dupFooter"><div class="dupFootText">Fonte da SS: ${safe(j.origem_alvo==='indice'?'indice privado':'consulta pontual uMov')}. Dados precisam estar sincronizados.</div>
 <button class="dupAction" id="dupOk" type="button">Concluir</button></div>`;
}
function ativar(j){
 const marcar=[...document.querySelectorAll('#dupContent input[data-dup-tarefa]')];
 const btn=$('dupAplicarTag'),count=$('dmContador'),feedback=$('dmFeedback');
 const atualizar=()=>{
   const n=marcar.filter(x=>x.checked).length;
   if(count)count.textContent=n+' SS selecionada'+(n===1?'':'s');
   if(btn)btn.disabled=busy||!j.pode_selecionar||!n;
 };
 marcar.forEach(x=>x.addEventListener('change',atualizar));atualizar();
 $('dupOk')?.addEventListener('click',fechar);
 if(!btn)return;
 btn.addEventListener('click',async()=>{
   if(busy||!j.pode_selecionar||!j.matriz)return;
   const ids=marcar.filter(x=>x.checked).map(x=>Number(x.dataset.dupTarefa));
   if(!ids.length)return;
   const respectivas=(j.duplicatas||[]).filter(r=>ids.includes(Number(r.tsk_id)));
   const descricao=respectivas.map(r=>r.ss).join(', ');
   const texto='Aplicar a TAG "DUPLICATA DA SS '+j.matriz.ss+'" em '+ids.length+' SS?\n\n'+descricao+
    '\n\nA Matriz NAO sera alterada. TAGs existentes serao preservadas quando houver espaco. Esta acao altera o uMov.';
   if(!window.confirm(texto))return;
   busy=true;atualizar();feedback.textContent='Gravando TAG nas SS selecionadas...';
   try{
     const r=await fetch('/api/duplicidades/aplicar-tag',{method:'POST',credentials:'same-origin',cache:'no-store',
       headers:{'Content-Type':'application/json'},
       body:JSON.stringify({ss_consultada:j.alvo.ss,matriz_ss:j.matriz.ss,tarefas:ids}),
       signal:AbortSignal.timeout(60000)});
     const p=await r.json();
     if(!r.ok&&r.status!==207)throw Error(p.erro||'Falha na gravacao das TAGs.');
     const sucesso=(p.resultados||[]).filter(r=>r.ok),falhas=(p.resultados||[]).filter(r=>!r.ok);
     feedback.textContent=sucesso.length+' SS com TAG confirmada(s). '+(falhas.length?falhas.length+' falha(s): '+falhas.map(r=>r.ss).join(', '):'Nenhuma falha reportada.');
     for(const item of sucesso){const input=marcar.find(x=>Number(x.dataset.dupTarefa)===Number(item.tarefa));if(input){input.checked=false;input.disabled=true;}}
   }catch(e){feedback.textContent='Nao foi possivel concluir a marcacao: '+e.message;}
   finally{busy=false;atualizar();}
 });
}
async function executar(){
 if(typeof currentScreen==='undefined'||currentScreen!=='recepcao')return alert('Disponivel somente na Recepcao.');
 const selecionados=typeof selected==='undefined'?[]:Object.values(selected||{});
 if(selecionados.length!==1)return alert('Selecione exatamente uma SS na Recepcao.');
 const ss=String(selecionados[0]?.ss||'').trim();
 estilos();abrir(cabecalho(ss)+'<div class="dupEmpty">Consultando o indice de duplicidades…</div>');
 try{
   const r=await fetch('/api/duplicidades/consulta?ss='+encodeURIComponent(ss),{cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(18000)});
   const j=await r.json();if(!r.ok||!j.ok)throw Error(j.erro||'Pesquisa indisponivel');
   consultaAtual=j;$('dupContent').innerHTML=quadro(j);ativar(j);
 }catch(e){$('dupContent').innerHTML=cabecalho(ss)+`<div class="dupInfo" role="alert">${safe(e.message)}</div>
 <div class="dupFooter"><button class="dupAction" id="dupOk" type="button">Fechar</button></div>`;
 $('dupOk')?.addEventListener('click',fechar);}
}
function instalar(){const btn=$('dupCheckBtn');if(!btn)return;btn.onclick=executar;
 btn.title='Definir Matriz e revisar duplicatas no indice Global SS';}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',instalar);else instalar();
})();
