/* CGM_FOTOS_LATERAIS_V2 */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const baixa=$('siscomBaixaModal'), cols=baixa?.querySelector('.sbColumns');
if(!baixa||!cols||!$('viewPhotosBtn'))return;
const anterior=document.createElement('section'),atual=document.createElement('section');
anterior.id='cgmFotosAnteriorLateral';atual.id='cgmFotosAtualLateral';
anterior.className=atual.className='cgmFotosLateral';
anterior.innerHTML='<h4>▧ Fotos da SS — antes / apoio</h4><label>Sequência anterior<select id="cgmSeqAnterior"></select></label><label id="cgmRelLabel">Relatório uMov<select id="cgmRelAnterior"></select></label><p id="cgmStatusAnterior" role="status"></p><div id="cgmGridAnterior" class="cgmFotosMiniaturas"></div><footer><span id="cgmCountAnterior"></span><button type="button" id="cgmAmpliarAnterior">Ampliar</button></footer>';
atual.innerHTML='<h4>▧ Fotos da SS — execução / detalhe</h4><p id="cgmNumeroAtual"></p><p id="cgmStatusAtual" role="status"></p><div id="cgmGridAtual" class="cgmFotosMiniaturas"></div><footer><span id="cgmCountAtual"></span><button type="button" id="cgmAmpliarAtual">Ampliar</button></footer>';
cols.insertBefore(anterior,cols.firstChild);cols.appendChild(atual);
let gen=0, genAnterior=0,registros=[], atualSS='',fotosAnterior=[],fotosAtual=[];
const zoom=$('umovFotosZoom'),zoomImg=$('umovFotosZoomImg');
function ampliar(lista,i=0){if(!lista.length)return;zoomImg.src=lista[i];zoom.classList.add('open');$('umovFotosModal').classList.add('open');$('umovFotosModal').classList.add('cgmZoomSomente');}
function fecharZoom(){zoom.classList.remove('open');$('umovFotosModal').classList.remove('open','cgmZoomSomente');zoomImg.removeAttribute('src');}
$('cgmAmpliarAnterior').onclick=()=>ampliar(fotosAnterior);
$('cgmAmpliarAtual').onclick=()=>ampliar(fotosAtual);
$('umovFotosZoomClose')?.addEventListener('click',fecharZoom);
function render(tipo,fotos){const grid=$(tipo==='Atual'?'cgmGridAtual':'cgmGridAnterior');grid.replaceChildren();$(tipo==='Atual'?'cgmCountAtual':'cgmCountAnterior').textContent=fotos.length+' foto(s)';fotos.forEach((src,i)=>{const fig=document.createElement('figure'),img=document.createElement('img'),cap=document.createElement('figcaption');img.src=src;img.loading=i<2?'eager':'lazy';img.alt='Foto '+(i+1);img.onclick=()=>ampliar(fotos,i);cap.textContent='Foto '+(i+1);fig.append(img,cap);grid.append(fig);});}
async function fotos(ss,tarefa){const r=await fetch('/api/relatorio-fotos',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({ss,tarefa})});const j=await r.json();if(!r.ok||!j.ok)throw Error(j.error||'Falha ao carregar fotos');return Array.isArray(j.fotos)?j.fotos:[];}
const seq=$('cgmSeqAnterior'),rel=$('cgmRelAnterior');
async function carregarAnterior(){const n=++genAnterior,registro=registros.find(x=>x.numero_ss===seq.value&&String(x.tarefa)===rel.value);fotosAnterior=[];render('Anterior',[]);if(!registro)return;$('cgmStatusAnterior').textContent='Consultando fotos anteriores...';try{const f=await fotos(registro.numero_ss,registro.tarefa);if(n!==genAnterior)return;fotosAnterior=f;render('Anterior',f);$('cgmStatusAnterior').textContent=f.length?'':'Sem fotos neste relatório.';}catch(e){if(n===genAnterior)$('cgmStatusAnterior').textContent=e.message;}}
function atualizarRel(){rel.replaceChildren();const items=registros.filter(x=>x.numero_ss===seq.value);items.forEach((x,i)=>{const o=document.createElement('option');o.value=String(x.tarefa);o.textContent='Relatório '+(i+1)+' — '+(x.data_execucao?new Date(x.data_execucao).toLocaleString('pt-BR'):'Sem data');rel.append(o);});$('cgmRelLabel').hidden=items.length<=1;void carregarAnterior();}
seq.onchange=atualizarRel;rel.onchange=carregarAnterior;
async function carregar(x){const n=++gen;++genAnterior;atualSS=String(x.ss);$('cgmNumeroAtual').textContent=atualSS;fotosAtual=[];fotosAnterior=[];render('Atual',[]);render('Anterior',[]);anterior.hidden=true;$('cgmStatusAtual').textContent='Consultando fotos da SS atual...';$('cgmStatusAnterior').textContent='';void fotos(atualSS,x.tarefa).then(f=>{if(n!==gen)return;fotosAtual=f;render('Atual',f);$('cgmStatusAtual').textContent=f.length?'':'Nenhuma foto encontrada.';}).catch(e=>{if(n===gen)$('cgmStatusAtual').textContent=e.message;});try{const r=await fetch('/api/umov/sequencias-fotos?ss='+encodeURIComponent(atualSS),{credentials:'same-origin',cache:'no-store'}),j=await r.json();if(n!==gen)return;if(!r.ok||!j.ok)throw Error(j.error||'Falha na consulta');registros=Array.isArray(j.sequencias)?j.sequencias:[];seq.replaceChildren();[...new Set(registros.map(x=>x.numero_ss))].forEach(ss=>{const o=document.createElement('option');o.value=ss;o.textContent=ss;seq.append(o);});anterior.hidden=!registros.length;if(registros.length)atualizarRel();}catch(e){if(n!==gen)return;anterior.hidden=false;$('cgmStatusAnterior').textContent='Consulta indisponível: '+e.message;}}
function selecionada(){return window.__siscomBaixaSelecionada;}
function abrirBaixa(){const x=selecionada();if(!x?.ss||!x?.tarefa)return;if(atualSS===String(x.ss)&&atualSS&&atual.querySelectorAll('img').length)return;void carregar(x);}
const obs=new MutationObserver(()=>{if(baixa.classList.contains('open'))setTimeout(abrirBaixa,120);else{gen++;genAnterior++;atualSS='';fecharZoom();}});obs.observe(baixa,{attributes:true,attributeFilter:['class']});
// Impede a antiga janela automatica; fotos permanecem nas laterais.
document.addEventListener('click',e=>{if(baixa.classList.contains('open')&&e.target.closest?.('#viewPhotosBtn,#sbVerFotos')){e.preventDefault();e.stopImmediatePropagation();abrirBaixa();}},true);
if(baixa.classList.contains('open'))abrirBaixa();
})();
