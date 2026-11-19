/* CGM_FOTOS_SEPARADAS_V3 */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const baixa=$('siscomBaixaModal'), cols=baixa?.querySelector('.sbColumns');
if(!baixa||!cols||!$('viewPhotosBtn'))return;
const esquerdo=document.createElement('section'),direito=document.createElement('section');
esquerdo.id='cgmFotosAnteriorLateral';direito.id='cgmFotosAtualLateral';
esquerdo.className=direito.className='cgmFotosLateral';
esquerdo.innerHTML='<h4>â–§ Fotos da SS â€” antes / apoio</h4><label>SequÃªncia anterior<select id="cgmSeqAnterior"></select></label><label id="cgmRelLabel">RelatÃ³rio uMov<select id="cgmRelAnterior"></select></label><p id="cgmStatusAnterior" role="status"></p><div id="cgmGridAnterior" class="cgmFotosMiniaturas"></div><footer><span id="cgmCountAnterior">0 fotos</span><button type="button" id="cgmAmpliarAnterior">Ampliar â†—</button></footer>';
direito.innerHTML='<h4>â–§ Fotos da SS â€” execuÃ§Ã£o / detalhe</h4><p id="cgmNumeroAtual"></p><p id="cgmStatusAtual" role="status"></p><div id="cgmGridAtual" class="cgmFotosMiniaturas"></div><footer><span id="cgmCountAtual">0 fotos</span><button type="button" id="cgmAmpliarAtual">Ampliar â†—</button></footer>';
// PainÃ©is IRMAOS da janela de baixa, nunca filhos das colunas centrais.
const palco=document.createElement('div');palco.id='cgmFotosPalco';
const shell=baixa.querySelector('.sbShell'),pai=shell?.parentElement;
if(!pai)return;
pai.insertBefore(palco,shell);
palco.append(esquerdo,shell,direito);
let gen=0,genAnterior=0,registros=[],ssAtual='',fotosAnterior=[],fotosAtual=[],zoomFotos=[],zoomIndice=0;
const zoom=$('umovFotosZoom'),zoomImg=$('umovFotosZoomImg'),galeria=$('umovFotosModal');
function ampliar(lista,i=0){if(!lista.length)return;zoomFotos=lista;zoomIndice=i;zoomImg.src=lista[i];galeria.classList.add('cgmZoomSomente','open');zoom.classList.add('open');}
function fecharZoom(){zoom.classList.remove('open');galeria.classList.remove('open','cgmZoomSomente');zoomImg.removeAttribute('src');}
function navegar(d){if(!zoomFotos.length)return;zoomIndice=(zoomIndice+d+zoomFotos.length)%zoomFotos.length;zoomImg.src=zoomFotos[zoomIndice];}
$('cgmAmpliarAnterior').onclick=()=>ampliar(fotosAnterior);
$('cgmAmpliarAtual').onclick=()=>ampliar(fotosAtual);
$('umovFotosZoomClose')?.addEventListener('click',fecharZoom);
zoom.addEventListener('click',e=>{if(e.target===zoom)fecharZoom();});
document.addEventListener('keydown',e=>{if(!zoom.classList.contains('open'))return;if(e.key==='Escape'){e.preventDefault();fecharZoom();}if(e.key==='ArrowLeft')navegar(-1);if(e.key==='ArrowRight')navegar(1);},true);
function render(tipo,lista){const grid=$(tipo==='Atual'?'cgmGridAtual':'cgmGridAnterior');grid.replaceChildren();$(tipo==='Atual'?'cgmCountAtual':'cgmCountAnterior').textContent=lista.length+' foto(s)';const fragmento=document.createDocumentFragment();lista.forEach((src,i)=>{const fig=document.createElement('figure'),img=document.createElement('img'),cap=document.createElement('figcaption');img.src=src;img.loading=i<2?'eager':'lazy';img.alt='Foto '+(i+1);img.onclick=()=>ampliar(lista,i);cap.textContent='Foto '+(i+1);fig.append(img,cap);fragmento.append(fig);});grid.append(fragmento);}
async function fotos(ss,tarefa){const r=await fetch('/api/relatorio-fotos',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({ss,tarefa})});const j=await r.json();if(!r.ok||!j.ok)throw Error(j.error||'Falha ao carregar fotos');return Array.isArray(j.fotos)?j.fotos:[];}
const seq=$('cgmSeqAnterior'),rel=$('cgmRelAnterior');
async function carregarAnterior(){const n=++genAnterior,registro=registros.find(x=>x.numero_ss===seq.value&&String(x.tarefa)===rel.value);fotosAnterior=[];render('Anterior',[]);if(!registro)return;$('cgmStatusAnterior').textContent='Consultando fotos anteriores...';try{const lista=await fotos(registro.numero_ss,registro.tarefa);if(n!==genAnterior)return;fotosAnterior=lista;render('Anterior',lista);$('cgmStatusAnterior').textContent=lista.length?'':'Sem fotos neste relatÃ³rio.';}catch(e){if(n===genAnterior)$('cgmStatusAnterior').textContent=e.message;}}
function atualizarRel(){rel.replaceChildren();const itens=registros.filter(x=>x.numero_ss===seq.value);itens.forEach((x,i)=>{const o=document.createElement('option');o.value=String(x.tarefa);o.textContent='RelatÃ³rio '+(i+1)+' â€” '+(x.data_execucao?new Date(x.data_execucao).toLocaleString('pt-BR'):'Sem data');rel.append(o);});$('cgmRelLabel').hidden=itens.length<=1;void carregarAnterior();}
seq.onchange=atualizarRel;rel.onchange=carregarAnterior;
async function carregar(x){const n=++gen;++genAnterior;ssAtual=String(x.ss);$('cgmNumeroAtual').textContent=ssAtual;fotosAtual=[];fotosAnterior=[];render('Atual',[]);render('Anterior',[]);esquerdo.hidden=true;$('cgmStatusAtual').textContent='Consultando fotos atuais...';$('cgmStatusAnterior').textContent='';void fotos(ssAtual,x.tarefa).then(lista=>{if(n!==gen)return;fotosAtual=lista;render('Atual',lista);$('cgmStatusAtual').textContent=lista.length?'':'Nenhuma foto encontrada.';}).catch(e=>{if(n===gen)$('cgmStatusAtual').textContent=e.message;});try{const r=await fetch('/api/umov/sequencias-fotos?ss='+encodeURIComponent(ssAtual),{credentials:'same-origin',cache:'no-store'}),j=await r.json();if(n!==gen)return;if(!r.ok||!j.ok)throw Error(j.error||'Falha na consulta');registros=Array.isArray(j.sequencias)?j.sequencias:[];seq.replaceChildren();[...new Set(registros.map(x=>x.numero_ss))].forEach(ss=>{const o=document.createElement('option');o.value=ss;o.textContent=ss;seq.append(o);});esquerdo.hidden=!registros.length;if(registros.length)atualizarRel();}catch(e){if(n!==gen)return;esquerdo.hidden=false;$('cgmStatusAnterior').textContent='Consulta indisponÃ­vel: '+e.message;}}
function abrirBaixa(){const x=window.__siscomBaixaSelecionada;if(!x?.ss||!x?.tarefa)return;if(ssAtual===String(x.ss)&&direito.querySelector('img'))return;void carregar(x);}
const obs=new MutationObserver(()=>{if(baixa.classList.contains('open'))setTimeout(abrirBaixa,120);else{gen++;genAnterior++;ssAtual='';fecharZoom();}});obs.observe(baixa,{attributes:true,attributeFilter:['class']});
document.addEventListener('click',e=>{if(baixa.classList.contains('open')&&e.target.closest?.('#viewPhotosBtn,#sbVerFotos')){e.preventDefault();e.stopImmediatePropagation();abrirBaixa();}},true);
if(baixa.classList.contains('open'))abrirBaixa();
})();