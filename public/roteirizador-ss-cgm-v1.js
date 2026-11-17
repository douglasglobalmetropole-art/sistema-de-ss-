(()=>{'use strict';
if(window.__CGM_ROTEIRO_V1)return;window.__CGM_ROTEIRO_V1=true;
const BASE={ss:'BASE O-DVV / O-DCV',lat:-20.345323098656547,lon:-40.354502305689984,rua:'Rua LacedÃ³polis, 153',bairro:'CobilÃ¢ndia'};
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const style=document.createElement('style');style.textContent=`#cgmRotaModal{position:fixed;inset:2%;z-index:999999;background:#fff;border:1px solid #b7cee2;border-radius:10px;display:flex;flex-direction:column;box-shadow:0 12px 50px #0005;color:#14395e;font:13px Arial;overflow:hidden}#cgmRotaModal .head{background:#07599a;color:#fff;padding:12px;display:flex;justify-content:space-between;align-items:center}#cgmRotaModal button{padding:8px;cursor:pointer;border:1px solid #b7cee2;border-radius:5px;background:white;color:#07599a}#cgmRotaModal .controls{display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding:9px;background:#eff6fd}#cgmRotaModal #cgmRotaMapa{flex:1;min-height:200px}#cgmRotaModal .lista{max-height:180px;overflow:auto;padding:10px}#cgmRotaModal table{width:100%;border-collapse:collapse}#cgmRotaModal td,#cgmRotaModal th{border-bottom:1px solid #dce8f2;padding:6px;text-align:left}#cgmRotaModal footer{display:flex;gap:8px;padding:10px;flex-wrap:wrap}@media print{body>*:not(#cgmRotaModal){display:none!important}#cgmRotaModal{position:static!important;inset:auto!important;height:auto!important;box-shadow:none!important;border:0!important}#cgmRotaModal #cgmRotaMapa{height:390px!important;flex:none!important}#cgmRotaModal .lista{max-height:none!important;overflow:visible!important}#cgmRotaModal footer,#cgmRotaModal .close,#cgmRotaModal #cgmRotaCalcular{display:none!important}}`;document.head.appendChild(style);
function selectedRows(){return [...document.querySelectorAll('#rows tr')].filter(tr=>tr.querySelector('input.pick:checked')).map(tr=>{const c=[...tr.querySelectorAll('td')];return {ss:(tr.querySelector('td.ss')?.textContent||c[1]?.textContent||'').trim(),rua:(c[2]?.textContent||'').trim(),bairro:(c[3]?.textContent||'').trim(),equipe:(c[8]?.textContent||'').trim()}}).filter(x=>x.ss)}
function detailRow(){const x=window.__detailSS;if(!x)return null;const ss=String(x.ss||x.numero||$('dss')?.textContent||'').trim();return ss?{ss,rua:x.logradouro||x.rua||'',bairro:x.bairro||'',equipe:x.equipe||x.equipe_executou||'Equipe da SS'}:null}
async function loadLeaflet(){if(window.L)return;const link=document.createElement('link');link.rel='stylesheet';link.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';document.head.appendChild(link);await new Promise((ok,no)=>{const s=document.createElement('script');s.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';s.onload=ok;s.onerror=()=>no(Error('Falha ao carregar Leaflet'));document.head.appendChild(s)})}
function init(){if($('cgmRotaAcao'))return;const anchor=$('sendTeamBtn');if(!anchor)return;const b=document.createElement('button');b.id='cgmRotaAcao';b.type='button';b.className='action';b.innerHTML='<b>âŒ</b>Roteirizar SS';b.style.cssText='background:#e9f4ff;color:#07599a;border:1px solid #7aa9d3';anchor.insertAdjacentElement('afterend',b);b.onclick=abrir}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
async function abrir(){const registros=selectedRows();if(!registros.length){const d=detailRow();if(d)registros.push(d)}if(!registros.length)return alert('Marque SS em Notas em Campo ou abra uma SS.');if(registros.length>25)return alert('Selecione atÃ© 25 SS por teste.');
const grupos={};registros.forEach(x=>{const k=x.equipe||'Equipe nÃ£o identificada';(grupos[k]??=[]).push(x)});
$('cgmRotaModal')?.remove();const el=document.createElement('section');el.id='cgmRotaModal';el.innerHTML='<div class="head"><strong>ðŸ“ Roteirizador de SS â€” O-DVV / O-DCV</strong><button class="close">âœ• Fechar</button></div><div id="cgmRotaStatus" style="padding:10px">Preparando mapa...</div><div class="controls"><label>Equipe: <select id="cgmRotaEquipe"></select></label><label><input type="checkbox" id="cgmRotaVoltar"> Retornar Ã  base</label><button id="cgmRotaCalcular">Otimizar rota</button><span>Origem: Rua LacedÃ³polis, 153 â€” CobilÃ¢ndia</span></div><div id="cgmRotaMapa"></div><div class="lista" id="cgmRotaLista"></div><footer><button id="cgmRotaGoogle" disabled>Abrir no Google Maps</button><button id="cgmRotaLink" disabled>Copiar link</button><button id="cgmRotaPDF" disabled>Imprimir / PDF</button></footer>';document.body.appendChild(el);el.querySelector('.close').onclick=()=>el.remove();
const select=$('cgmRotaEquipe');Object.keys(grupos).forEach(k=>{const o=document.createElement('option');o.value=k;o.textContent=k+' â€” '+grupos[k].length+' SS';select.appendChild(o)});let mapa,linha,markers=[],url='';const status=$('cgmRotaStatus'),lista=$('cgmRotaLista');try{await loadLeaflet();mapa=L.map('cgmRotaMapa');L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'Â© OpenStreetMap contributors',maxZoom:19}).addTo(mapa);mapa.setView([BASE.lat,BASE.lon],12);setTimeout(()=>mapa.invalidateSize(),150)}catch(e){status.textContent='Mapa indisponÃ­vel: '+e.message;return}
async function calcular(){url='';['cgmRotaGoogle','cgmRotaLink','cgmRotaPDF'].forEach(id=>$(id).disabled=true);if(linha)mapa.removeLayer(linha);markers.forEach(m=>mapa.removeLayer(m));markers=[];const itens=grupos[select.value],pontos=[],falhas=[];for(let i=0;i<itens.length;i++){const x=itens[i];status.textContent='Consultando GIS '+(i+1)+'/'+itens.length+' â€” '+x.ss;try{const r=await fetch('/api/gis/localizar-ss?ss='+encodeURIComponent(x.ss),{credentials:'same-origin'}),j=await r.json(),lat=Number(j.lat),lon=Number(j.lon);if(!r.ok||!j.ok||!j.found||!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)throw Error(j.error||'NÃ£o localizada');pontos.push({...x,lat,lon})}catch(e){falhas.push(x.ss+' â€” '+e.message)}}if(!pontos.length){status.textContent='Nenhuma SS localizada pelo GIS';lista.textContent=falhas.join(' | ');return}
const volta=$('cgmRotaVoltar').checked;
const all=[BASE,...pontos];
const coords=all.map(p=>p.lon+','+p.lat).join(';');
try {
 status.textContent='Otimizando percurso pelas ruas...';
 const q='?roundtrip='+volta+'&source=first&destination='+(volta?'last':'any')+'&overview=full&geometries=geojson';
 const r=await fetch('https://router.project-osrm.org/trip/v1/driving/'+coords+q);
 if(!r.ok)throw Error('HTTP '+r.status);
 const j=await r.json();
 if(j.code!=='Ok'||!j.trips?.length||j.waypoints?.length!==all.length)throw Error(j.message||'Rota indisponÃ­vel');
 const trip=j.trips[0];
 const ordem=all.map((p,i)=>({...p,ordem:j.waypoints[i].waypoint_index})).sort((a,b)=>a.ordem-b.ordem);
 if(ordem[0].ss!==BASE.ss)throw Error('A base nÃ£o ficou como origem');
 linha=L.polyline(trip.geometry.coordinates.map(c=>[c[1],c[0]]),{color:'#0879f7',weight:5}).addTo(mapa);
 ordem.forEach((p,i)=>{const m=L.marker([p.lat,p.lon]).addTo(mapa);m.bindPopup(esc(i?(i+'. '+p.ss):'BASE OPERACIONAL'));markers.push(m)});
 mapa.fitBounds(linha.getBounds().pad(.12));
 const km=(trip.distance/1000).toLocaleString('pt-BR',{maximumFractionDigits:2});
 const min=Math.round(trip.duration/60);
 status.textContent=select.value+' | '+pontos.length+' SS | '+km+' km | '+min+' min de deslocamento'+(falhas.length?' | '+falhas.length+' nÃ£o localizadas':'');
 lista.innerHTML='<table><thead><tr><th>Ordem</th><th>SS</th><th>Rua</th><th>Bairro</th></tr></thead><tbody>'+ordem.map((p,i)=>'<tr><td>'+(i||'BASE')+'</td><td>'+esc(p.ss)+'</td><td>'+esc(p.rua)+'</td><td>'+esc(p.bairro)+'</td></tr>').join('')+'</tbody></table>'+(falhas.length?'<p style="color:#b45309">Pendentes: '+esc(falhas.join('; '))+'</p>':'');
 const cp=p=>p.lat+','+p.lon;
 const params=new URLSearchParams({api:'1',origin:cp(BASE),destination:cp(volta?BASE:ordem[ordem.length-1]),travelmode:'driving'});
 const inter=volta?ordem.slice(1):ordem.slice(1,-1);
 if(inter.length)params.set('waypoints',inter.map(cp).join('|'));
 url='https://www.google.com/maps/dir/?'+params;
 ['cgmRotaGoogle','cgmRotaLink','cgmRotaPDF'].forEach(id=>{$(id).disabled=false});
}catch(e){status.textContent='Falha ao calcular rota: '+e.message;console.error(e)}}
$('cgmRotaCalcular').onclick=calcular;select.onchange=calcular;$('cgmRotaVoltar').onchange=calcular;$('cgmRotaGoogle').onclick=()=>url&&window.open(url,'_blank','noopener');$('cgmRotaLink').onclick=()=>url&&prompt('Copie o link da rota:',url);$('cgmRotaPDF').onclick=()=>url&&window.print();await calcular()}
})();
