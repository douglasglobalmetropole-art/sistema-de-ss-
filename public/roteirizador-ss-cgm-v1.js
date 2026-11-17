(()=>{'use strict';
if(window.__CGM_ROTEIRO_V3)return;window.__CGM_ROTEIRO_V3=true;
const BASE={ss:'BASE O-DVV / O-DCV',lat:-20.345323098656547,lon:-40.354502305689984,rua:'Rua Lacedópolis, 153',bairro:'Cobilândia'};
const $=id=>document.getElementById(id), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const css=document.createElement('style');css.textContent=`#cgmRotaAcao{display:flex!important;visibility:visible!important;background:#e9f4ff!important;color:#07599a!important;border:1px solid #7aa9d3!important}#cgmRotaModal{position:fixed;inset:2%;z-index:999999;background:white;border:1px solid #b7cee2;border-radius:10px;display:flex;flex-direction:column;box-shadow:0 12px 50px #0005;color:#14395e;font:13px Arial;overflow:hidden}#cgmRotaModal .head{background:#07599a;color:white;padding:11px 14px;display:flex;justify-content:space-between;align-items:center}#cgmRotaModal button,#cgmRotaModal select{padding:7px;cursor:pointer;border:1px solid #b7cee2;border-radius:5px;background:white;color:#07599a}#cgmRotaModal .controls,#cgmRotaModal footer{display:flex;gap:9px;align-items:center;flex-wrap:wrap;padding:8px 12px;background:#eff6fd}#cgmRotaModal .body{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr) 360px}#cgmRotaMapa{min-height:200px}#cgmRotaPlano{overflow:auto;padding:10px;background:#f9fbff;border-left:1px solid #dce8f2}#cgmRotaPlano table{width:100%;border-collapse:collapse}#cgmRotaPlano td,#cgmRotaPlano th{border-bottom:1px solid #dce8f2;padding:6px;text-align:left}#cgmRotaPlano select{max-width:110px}#cgmRotaPlano .move{padding:3px 6px}#cgmRotaPlano .note{font-size:11px;color:#61778e;margin:8px 0}.cgm-rota-pin span{display:grid;place-items:center;background:#07599a;color:white;border:2px solid white;border-radius:50%;height:28px;width:28px;box-shadow:0 1px 5px #0007;font-weight:bold}.cgm-rota-pin.base span{background:#159447}#cgmRotaModal .pdf-title{display:none}@media(max-width:850px){#cgmRotaModal .body{grid-template-columns:1fr;grid-template-rows:50% 50%}}@media print{@page{size:A4 landscape;margin:10mm}body>*:not(#cgmRotaModal){display:none!important}#cgmRotaModal{position:static!important;inset:auto!important;height:auto!important;overflow:visible!important;border:0!important;box-shadow:none!important}#cgmRotaModal .pdf-title{display:block!important;font-size:18px;font-weight:bold;margin:12px}#cgmRotaModal .body{display:block!important}#cgmRotaMapa{height:380px!important}#cgmRotaPlano{overflow:visible!important;border:0!important}#cgmRotaModal .controls,#cgmRotaModal footer,#cgmRotaModal .close,#cgmRotaModal .move,#cgmRotaModal select{display:none!important}}`;document.head.appendChild(css);
const cgmV8Style=document.createElement("style");cgmV8Style.textContent="\n/* CGM_EDITOR_DEFINITIVO_V8 */\n#cgmRotaModal {\n  inset:3% 4%!important;\n  width:auto!important;\n  max-width:none!important;\n  box-sizing:border-box!important;\n}\n#cgmRotaModal .body {\n  display:grid!important;\n  grid-template-columns:minmax(0,60%) minmax(0,40%)!important;\n  grid-template-rows:minmax(0,1fr)!important;\n  min-height:0!important;\n  overflow:hidden!important;\n}\n#cgmRotaMapa {\n  min-width:0!important;\n  width:100%!important;\n  min-height:0!important;\n}\n#cgmRotaPlano {\n  width:100%!important;\n  min-width:0!important;\n  max-width:100%!important;\n  box-sizing:border-box!important;\n  overflow-x:hidden!important;\n  overflow-y:auto!important;\n  padding:12px!important;\n  background:#f4f7fb!important;\n}\n#cgmRotaPlano .cgm-v8-head {\n  display:flex;\n  flex-direction:column;\n  gap:5px;\n  background:white;\n  padding:12px;\n  border:1px solid #dce6f0;\n  border-radius:8px;\n  margin-bottom:10px;\n}\n#cgmRotaPlano .cgm-v8-head strong {\n  font-size:14px;\n  color:#07599a;\n}\n#cgmRotaPlano .cgm-v8-head span {\n  font-size:12px;\n  font-weight:600;\n}\n#cgmRotaPlano .cgm-v8-head small {\n  color:#63778a;\n  line-height:1.4;\n}\n#cgmRotaPlano .cgm-v8-list {\n  display:flex;\n  flex-direction:column;\n  gap:8px;\n}\n#cgmRotaPlano .cgm-v8-card {\n  display:grid;\n  grid-template-columns:32px minmax(0,1fr) 112px;\n  gap:9px;\n  align-items:center;\n  min-width:0;\n  padding:10px;\n  background:white;\n  border:1px solid #dbe6f0;\n  border-radius:8px;\n  box-shadow:0 1px 3px #14395e0c;\n}\n#cgmRotaPlano .cgm-v8-num {\n  display:grid;\n  place-items:center;\n  width:30px;\n  height:30px;\n  background:#07599a;\n  color:white;\n  font-weight:bold;\n  border-radius:50%;\n}\n#cgmRotaPlano .cgm-v8-info {\n  display:flex;\n  flex-direction:column;\n  gap:4px;\n  min-width:0;\n  overflow-wrap:anywhere;\n}\n#cgmRotaPlano .cgm-v8-info strong {\n  font-size:12px;\n  color:#123f6a;\n}\n#cgmRotaPlano .cgm-v8-info span {\n  font-size:11px;\n  line-height:1.35;\n}\n#cgmRotaPlano .cgm-v8-info small {\n  color:#657b91;\n  font-size:11px;\n}\n#cgmRotaPlano .cgm-v8-tools {\n  display:flex;\n  flex-direction:column;\n  gap:6px;\n  min-width:0;\n}\n#cgmRotaPlano .cgm-v8-tools select {\n  width:100%!important;\n  min-width:0!important;\n  max-width:100%!important;\n  padding:7px 4px!important;\n  font-size:11px!important;\n}\n#cgmRotaPlano .cgm-v8-arrows {\n  display:flex;\n  justify-content:center;\n  gap:6px;\n}\n#cgmRotaPlano .cgm-v8-arrows button {\n  width:42px;\n  height:30px;\n  padding:0!important;\n  font-size:16px;\n}\n#cgmRotaPlano .cgm-v8-arrows button:disabled {\n  opacity:.35;\n  cursor:not-allowed;\n}\n#cgmRotaModal .controls {\n  gap:8px!important;\n  padding:8px 12px!important;\n}\n@media(max-width:950px) {\n  #cgmRotaModal .body {\n    grid-template-columns:minmax(0,1fr)!important;\n    grid-template-rows:minmax(250px,50%) minmax(250px,50%)!important;\n  }\n}\n@media print {\n  #cgmRotaModal .body {\n    display:block!important;\n    overflow:visible!important;\n  }\n  #cgmRotaPlano {\n    overflow:visible!important;\n  }\n  #cgmRotaPlano .cgm-v8-card {\n    break-inside:avoid;\n  }\n  #cgmRotaPlano .cgm-v8-tools {\n    display:none!important;\n  }\n}\n";document.head.appendChild(cgmV8Style);
const cgmEditorV4 = document.createElement('style');
cgmEditorV4.textContent = `/* CGM_ROTA_EDITOR_LAYOUT_V4 */
#cgmRotaModal .body {
  grid-template-columns: minmax(0, 55fr) minmax(420px, 45fr) !important;
  gap: 0 !important;
}

#cgmRotaPlano {
  min-width: 0 !important;
  overflow-x: hidden !important;
  overflow-y: auto !important;
  padding: 16px !important;
  box-sizing: border-box !important;
  background: #f7faff !important;
}

#cgmRotaPlano table {
  width: 100% !important;
  table-layout: fixed !important;
  border-collapse: collapse !important;
  font-size: 12px !important;
}

#cgmRotaPlano th,
#cgmRotaPlano td {
  white-space: normal !important;
  overflow-wrap: anywhere !important;
  vertical-align: middle !important;
  padding: 10px 7px !important;
}

#cgmRotaPlano th:nth-child(1),
#cgmRotaPlano td:nth-child(1) {
  width: 32px !important;
}

#cgmRotaPlano th:nth-child(2),
#cgmRotaPlano td:nth-child(2) {
  width: auto !important;
}

#cgmRotaPlano th:nth-child(3),
#cgmRotaPlano td:nth-child(3) {
  width: 110px !important;
}

#cgmRotaPlano th:nth-child(4),
#cgmRotaPlano td:nth-child(4) {
  width: 80px !important;
}

#cgmRotaPlano select {
  width: 100% !important;
  min-width: 0 !important;
  max-width: none !important;
  padding: 6px 3px !important;
}

#cgmRotaPlano .move {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 30px !important;
  height: 30px !important;
  padding: 0 !important;
  margin: 1px !important;
  font-size: 15px !important;
}

#cgmRotaPlano .note {
  line-height: 1.5 !important;
  margin: 12px 0 !important;
}

#cgmRotaPlano tr:hover td {
  background: #edf5ff !important;
}

@media (max-width: 1050px) {
  #cgmRotaModal .body {
    grid-template-columns: minmax(0, 1fr) !important;
    grid-template-rows: minmax(280px, 55%) minmax(260px, 45%) !important;
  }
}

@media print {
  #cgmRotaModal .body {
    display: block !important;
  }
}`;
document.head.appendChild(cgmEditorV4);
function selectedRows(){return [...document.querySelectorAll('#rows tr')].filter(tr=>tr.querySelector('input.pick:checked')).map(tr=>{const c=[...tr.querySelectorAll('td')];return {ss:(tr.querySelector('td.ss')?.textContent||c[1]?.textContent||'').trim(),rua:(c[2]?.textContent||'').trim(),bairro:(c[3]?.textContent||'').trim(),equipe:(c[8]?.textContent||'').trim()}}).filter(x=>x.ss)}
function detailRow(){const x=window.__detailSS;if(!x)return null;const ss=String(x.ss||x.numero||$('dss')?.textContent||'').trim();return ss?{ss,rua:x.logradouro||x.rua||'',bairro:x.bairro||'',equipe:x.equipe||x.equipe_executou||'Equipe da SS'}:null}
async function leaflet(){if(window.L)return;const link=document.createElement('link');link.rel='stylesheet';link.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';document.head.appendChild(link);await new Promise((ok,no)=>{const s=document.createElement('script');s.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';s.onload=ok;s.onerror=()=>no(Error('Falha ao carregar mapa'));document.head.appendChild(s)})}
function init(){const a=$('sendTeamBtn');if(!a)return;let b=$('cgmRotaAcao');if(!b){b=document.createElement('button');b.id='cgmRotaAcao';b.type='button';b.className='action';b.innerHTML='<b>⌁</b>Roteirizar SS';a.insertAdjacentElement('afterend',b)}b.hidden=false;b.removeAttribute('hidden');b.style.setProperty('display','flex','important');b.onclick=abrir}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();setInterval(init,1000);
async function abrir(){const regs=selectedRows();if(!regs.length){const d=detailRow();if(d)regs.push(d)}if(!regs.length)return alert('Selecione SS em Notas em Campo ou abra uma SS.');if(regs.length>25)return alert('Limite de 25 SS por planejamento.');
const grupos={};regs.forEach(x=>(grupos[x.equipe||'Equipe não identificada']??=[]).push({...x,prioridade:'normal'}));
$('cgmRotaModal')?.remove();const el=document.createElement('section');el.id='cgmRotaModal';el.innerHTML='<div class="head"><strong>Roteirizador de SS — Planejamento por prioridade</strong><button class="close">Fechar ✕</button></div><div class="pdf-title">CONSÓRCIO GLOBAL METRÓPOLE — ROTA DE ATENDIMENTO</div><div id="cgmRotaStatus" style="padding:8px 12px">Preparando...</div><div class="controls"><label>Equipe <select id="cgmRotaEquipe"></select></label><label>Modo <select id="cgmRotaModo"><option value="auto">Automático</option><option value="prioridade">Por prioridade</option><option value="manual">Ordem manual</option></select></label><label><input type="checkbox" id="cgmRotaVoltar"> Retornar à base</label><button id="cgmRotaCalcular">Aplicar e recalcular</button><span>Base: Rua Lacedópolis, 153 — Cobilândia</span></div><div class="body"><div id="cgmRotaMapa"></div><div id="cgmRotaPlano"></div></div><footer><button id="cgmRotaGoogle" disabled>Abrir Google Maps</button><button id="cgmRotaLink" disabled>Copiar link</button><button id="cgmRotaPDF" disabled>Imprimir / Salvar PDF</button></footer>';document.body.appendChild(el);el.querySelector('.close').onclick=()=>el.remove();
const equipe=$('cgmRotaEquipe'),modo=$('cgmRotaModo'),status=$('cgmRotaStatus'),plano=$('cgmRotaPlano');Object.keys(grupos).forEach(k=>{const o=document.createElement('option');o.value=k;o.textContent=k+' ('+grupos[k].length+' SS)';equipe.appendChild(o)});
let map,poly,markers=[],url='',pontos=[],pendentes=[],lastRoute=[];try{await leaflet();if(!el.isConnected)return;map=L.map('cgmRotaMapa');L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:19}).addTo(map);map.setView([BASE.lat,BASE.lon],12);setTimeout(()=>map.invalidateSize(),200)}catch(e){status.textContent=e.message;return}
const orderPriority={urgente:0,alta:1,normal:2};

function renderEditor(){
  const manual = modo.value === 'manual';

  plano.innerHTML =
    '<div class="cgm-v8-head">' +
      '<strong>Planejamento e prioridades</strong>' +
      '<span>' + esc(equipe.value) + '</span>' +
      '<small>Urgente → Alta → Normal. No modo manual, utilize as setas.</small>' +
    '</div>' +
    '<div class="cgm-v8-list">' +
    pontos.map((p,i) =>
      '<div class="cgm-v8-card">' +
        '<div class="cgm-v8-num">' + (i+1) + '</div>' +
        '<div class="cgm-v8-info">' +
          '<strong>' + esc(p.ss) + '</strong>' +
          '<span>' + esc(p.rua || 'Endereço não informado') + '</span>' +
          '<small>' + esc(p.bairro || 'Bairro não informado') + '</small>' +
        '</div>' +
        '<div class="cgm-v8-tools">' +
          '<select data-prio="' + i + '" aria-label="Prioridade">' +
            '<option value="normal"' + (p.prioridade==='normal'?' selected':'') + '>Normal</option>' +
            '<option value="alta"' + (p.prioridade==='alta'?' selected':'') + '>Alta</option>' +
            '<option value="urgente"' + (p.prioridade==='urgente'?' selected':'') + '>Urgente</option>' +
          '</select>' +
          '<div class="cgm-v8-arrows">' +
            '<button class="move" data-up="' + i + '"' +
              (!manual || i===0 ? ' disabled' : '') + ' title="Subir">↑</button>' +
            '<button class="move" data-down="' + i + '"' +
              (!manual || i===pontos.length-1 ? ' disabled' : '') +
              ' title="Descer">↓</button>' +
          '</div>' +
        '</div>' +
      '</div>'
    ).join('') +
    '</div>' +
    (pendentes.length
      ? '<p class="note">Sem coordenadas GIS: ' + esc(pendentes.join('; ')) + '</p>'
      : '');

  plano.querySelectorAll('[data-prio]').forEach(s => {
    s.onchange = () => {
      pontos[Number(s.dataset.prio)].prioridade = s.value;
    };
  });

  plano.querySelectorAll('[data-up],[data-down]').forEach(b => {
    b.onclick = () => {
      const i = Number(b.dataset.up ?? b.dataset.down);
      const j = i + (b.hasAttribute('data-up') ? -1 : 1);
      if (j < 0 || j >= pontos.length) return;
      [pontos[i],pontos[j]] = [pontos[j],pontos[i]];
      renderEditor();
    };
  });
}

async function carregar(){status.textContent='Consultando coordenadas GIS...';pontos=[];pendentes=[];const items=grupos[equipe.value];for(let i=0;i<items.length;i++){if(!el.isConnected)return;const x=items[i];status.textContent='GIS '+(i+1)+'/'+items.length+': '+x.ss;try{const r=await fetch('/api/gis/localizar-ss?ss='+encodeURIComponent(x.ss),{credentials:'same-origin'});const j=await r.json(),lat=Number(j.lat),lon=Number(j.lon);if(!r.ok||!j.ok||!j.found||!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)throw Error(j.error||'Não localizada');pontos.push({...x,lat,lon})}catch(e){pendentes.push(x.ss+': '+e.message)}}if(!el.isConnected)return;renderEditor();await calcular()}
const coord=p=>p.lon+','+p.lat;
async function getTrip(start,items){if(!items.length)return [];if(items.length===1)return items;const arr=[start,...items],r=await fetch('https://router.project-osrm.org/trip/v1/driving/'+arr.map(coord).join(';')+'?roundtrip=false&source=first&destination=any&overview=false');if(!r.ok)throw Error('OSRM trip HTTP '+r.status);const j=await r.json();if(j.code!=='Ok'||!j.waypoints||j.waypoints.length!==arr.length)throw Error(j.message||'Falha ao otimizar grupo');return items.map((p,i)=>({...p,ord:j.waypoints[i+1].waypoint_index})).sort((a,b)=>a.ord-b.ord).map(({ord,...p})=>p)}
async function calcular(){if(!el.isConnected)return;url='';['cgmRotaGoogle','cgmRotaLink','cgmRotaPDF'].forEach(id=>$(id).disabled=true);if(!pontos.length){status.textContent='Nenhuma SS localizada no GIS';return}status.textContent='Calculando percurso OSRM...';try{let ordem=[];if(modo.value==='manual')ordem=[...pontos];else if(modo.value==='auto')ordem=await getTrip(BASE,pontos);else{let origem=BASE;for(const nivel of ['urgente','alta','normal']){const grupo=pontos.filter(p=>p.prioridade===nivel);const trecho=await getTrip(origem,grupo);ordem.push(...trecho);if(trecho.length)origem=trecho[trecho.length-1]}}if(!el.isConnected)return;const volta=$('cgmRotaVoltar')?.checked;const path=[BASE,...ordem,...(volta?[BASE]:[])];const r=await fetch('https://router.project-osrm.org/route/v1/driving/'+path.map(coord).join(';')+'?overview=full&geometries=geojson&steps=false');if(!r.ok)throw Error('OSRM route HTTP '+r.status);const j=await r.json();if(j.code!=='Ok'||!j.routes?.length)throw Error(j.message||'Percurso não encontrado');if(!el.isConnected)return;const route=j.routes[0];lastRoute=ordem;if(poly)map.removeLayer(poly);markers.forEach(m=>map.removeLayer(m));markers=[];poly=L.polyline(route.geometry.coordinates.map(c=>[c[1],c[0]]),{color:'#0879f7',weight:5}).addTo(map);[BASE,...ordem].forEach((p,i)=>{const icon=L.divIcon({className:'cgm-rota-pin'+(i===0?' base':''),html:'<span>'+(i||'⌂')+'</span>',iconSize:[30,34],iconAnchor:[15,33]});markers.push(L.marker([p.lat,p.lon],{icon}).addTo(map).bindPopup(esc(i?p.ss:'BASE OPERACIONAL')))});map.fitBounds(poly.getBounds().pad(.12));const km=(route.distance/1000).toLocaleString('pt-BR',{maximumFractionDigits:2});status.textContent=equipe.value+' | '+ordem.length+' SS | '+km+' km | '+Math.round(route.duration/60)+' min | '+(modo.value==='manual'?'Ordem manual':modo.value==='prioridade'?'Prioridades respeitadas':'Rota automática')+(pendentes.length?' | '+pendentes.length+' pendente(s)':'');const cp=p=>p.lat+','+p.lon;const params=new URLSearchParams({api:'1',origin:cp(BASE),destination:cp(volta?BASE:ordem[ordem.length-1]),travelmode:'driving'});const via=volta?ordem:ordem.slice(0,-1);if(via.length)params.set('waypoints',via.map(cp).join('|'));url='https://www.google.com/maps/dir/?'+params.toString();['cgmRotaGoogle','cgmRotaLink','cgmRotaPDF'].forEach(id=>$(id).disabled=false)}catch(e){status.textContent='Erro no cálculo: '+e.message;console.error(e)}}
$('cgmRotaCalcular').onclick=()=>{renderEditor();calcular()};equipe.onchange=carregar;modo.onchange=renderEditor;$('cgmRotaVoltar').onchange=calcular;$('cgmRotaGoogle').onclick=()=>url&&window.open(url,'_blank','noopener');$('cgmRotaLink').onclick=()=>url&&prompt('Copie o link:',url);$('cgmRotaPDF').onclick=()=>{if(url){map.invalidateSize();window.print()}};await carregar()}
})();
