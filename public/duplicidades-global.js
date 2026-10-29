/* Global SS - Pesquisa GLOBAL de duplicidades, sem substituir o layout da Recepção.
   A API exige sessão autenticada e consulta exclusivamente o índice privado Supabase. */
(() => {
'use strict';
const $=id=>document.getElementById(id);
const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const statusClasse=s=>/REJEIT/i.test(s)?'rejected':/RETORN|ENCERR|EXECUT|BAIXAD/i.test(s)?'done':/CAMPO/i.test(s)?'field':'scheduled';
const label={provavel:'Duplicidade provável',revisar:'Revisar',relacionado:'Serviço relacionado',proximidade:'Proximidade'};
const cor={provavel:'high',revisar:'medium',relacionado:'low',proximidade:'neutral'};
function abrir(html){
 const el=$('dupModal');if(!el)return alert('Módulo visual de duplicidades não instalado.');
 $('dupContent').innerHTML=html;el.classList.add('open');$('dupClose')?.focus();
}
function cabecalho(ss){return `<div class="dupSummary"><div class="dupSumCard"><div class="dupIcon">▣</div><div><div class="dupMeta">SS consultada</div><div class="dupMainVal">${safe(ss)}</div></div></div><div class="dupSumCard"><div class="dupIcon">⌕</div><div><div class="dupMeta">Fonte</div><div class="dupMainVal">Índice Global SS</div></div></div></div>`;}
function quadro(j){
 const itens=j.resultados||[];
 const n=itens.filter(x=>x.categoria==='provavel').length;
 const linhas=itens.map(x=>`<tr><td class="dupSS">${safe(x.ss)}</td>
  <td><span class="dupBadge ${statusClasse(x.situacao||'')}">${safe(x.situacao||'Não informado')}</span></td>
  <td>${safe(x.matricula||'—')}</td><td>${safe(x.hidrometro||'—')}</td>
  <td>${safe([x.logradouro,x.numero,x.bairro,x.cidade].filter(Boolean).join(' · '))}</td>
  <td>${safe(x.servico||'—')}</td>
  <td><span class="dupBadge ${cor[x.categoria]||'neutral'}">${x.pontos} pts</span><div style="font-size:10px;margin-top:4px">${safe(label[x.categoria]||'Revisar')}</div></td></tr>
  <tr><td colspan="7" style="background:#f5f9fd;color:#59758f;font-size:10px">${safe((x.motivos||[]).join(' · '))}</td></tr>`).join('');
 const cobertura=j.cobertura||{};
 return `${cabecalho(j.alvo.ss)}<div class="dupSectionHead"><h3>Correspondências na base <span class="dupCount">${itens.length}</span></h3>
 <span style="font-size:10px;color:#71869b">${n} prováveis · ${safe(j.tempo_ms||0)} ms</span></div>
 <div class="dupTableArea">${itens.length?`<table class="dupTable"><thead><tr><th>SS</th><th>Situação</th><th>Matrícula</th><th>Hidrômetro</th><th>Endereço</th><th>Serviço</th><th>Análise</th></tr></thead><tbody>${linhas}</tbody></table>`:'<div class="dupEmpty">Nenhuma correspondência no conjunto já sincronizado.</div>'}</div>
 <div class="dupCriteria"><h3>ⓘ Critérios de comparação</h3><div class="dupCriteriaGrid">
 <div class="dupCriterion"><span>Mesma matrícula válida</span><span class="dupPoints">40 pts</span></div>
 <div class="dupCriterion"><span>Mesmo hidrômetro válido</span><span class="dupPoints">30 pts</span></div>
 <div class="dupCriterion"><span>Mesmo endereço completo</span><span class="dupPoints">20 pts</span></div>
 <div class="dupCriterion"><span>Mesmo serviço</span><span class="dupPoints">10 pts</span></div>
 <div class="dupCriterion"><span>Mesma rua sem número</span><span class="dupPoints">5 pts</span></div>
 <div class="dupCriterion"><span>Mesma rua, número diferente</span><span class="dupPoints">3 pts</span></div>
 </div><div class="dupInfo"><b>Cobertura: ${cobertura.completa?'varredura inicial concluída':'ÍNDICE PARCIAL'}</b> — ${safe(cobertura.lidos??0)} tarefas percorridas.
 ${cobertura.atualizado_em?'Última sincronização registrada: '+safe(new Date(cobertura.atualizado_em).toLocaleString('pt-BR'))+'.':''}
 ${cobertura.completa?'A situação das SS ainda depende de atualizações periódicas.':'SS de períodos ainda não sincronizados podem estar ausentes.'}
 <br>Classificação heurística; sem encerramento, tramitação ou rejeição automática.</div></div>
 <div class="dupFooter"><div class="dupFootText">Fonte da SS consultada: ${safe(j.origem_alvo==='indice'?'índice':'consulta pontual ao uMov')}. A análise depende da atualização do espelho.</div><button class="dupAction" id="dupOk" type="button">Concluir</button></div>`;
}
async function executar(){
 if(typeof currentScreen==='undefined'||currentScreen!=='recepcao')return alert('Disponível somente na Recepção.');
 const selecionados=typeof selected==='undefined'?[]:Object.values(selected||{});
 if(selecionados.length!==1)return alert('Selecione exatamente uma SS na Recepção.');
 const ss=String(selecionados[0]?.ss||'').trim();
 abrir(cabecalho(ss)+'<div class="dupEmpty">Consultando o índice de duplicidades…</div>');
 try{
   const r=await fetch('/api/duplicidades/consulta?ss='+encodeURIComponent(ss),{cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(18000)});
   const j=await r.json();if(!r.ok||!j.ok)throw Error(j.erro||'Pesquisa global indisponível');
   $('dupContent').innerHTML=quadro(j);
 }catch(e){$('dupContent').innerHTML=cabecalho(ss)+`<div class="dupInfo" role="alert">${safe(e.message)}. Não apresentaremos resultado parcial como se fosse a base completa.</div><div class="dupFooter"><button class="dupAction" id="dupOk" type="button">Fechar</button></div>`;}
 $('dupOk')?.addEventListener('click',()=>$('dupModal')?.classList.remove('open'));
}
function instalar(){const btn=$('dupCheckBtn');if(!btn)return;btn.onclick=executar;btn.title='Pesquisa de duplicidades no índice privado do Global SS';}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',instalar);else instalar();
})();
