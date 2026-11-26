(function () {
  'use strict';

  if (window.__globalDupIndicatorInstalled) {
    window.__globalDupIndicatorInstalled = false;
  }
  if (document.getElementById('dupGlobalModal')) {
    document.getElementById('dupGlobalModal').remove();
  }

  const cache = new Map();
  const fila = [];
  const consultando = new Set();
  let ativos = 0;
  const MAX = 3;
  const CACHE_MS = 5 * 60 * 1000;

  const safe = v => String(v ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  })[c]);

  const ssVal = x => String(x?.ss || '').trim();
  const data = v => {
    if (!v) return 'Não informada';
    const d = new Date(v);
    return isNaN(d) ? String(v) : d.toLocaleString('pt-BR');
  };

  const modal = document.createElement('div');
  modal.id = 'dupGlobalModal';
  modal.innerHTML = `
    <div class="dgm-box">
      <header>
        <div>
          <strong>ANÁLISE DE DUPLICIDADES</strong>
          <small>Consulta ao índice global de SS</small>
        </div>
        <button type="button" id="dgmClose">×</button>
      </header>
      <div id="dgmContent">
        <p>Carregando correspondências...</p>
      </div>
    </div>`;

  const css = document.createElement('style');
  css.textContent = `
    #dupGlobalModal {
      position:fixed;inset:0;z-index:1000000;
      background:rgba(5,22,42,.72);
      display:none;align-items:center;justify-content:center;
      padding:16px;font:13px Arial,sans-serif;
    }
    #dupGlobalModal.open {display:flex}
    #dupGlobalModal .dgm-box {
      width:94vw;max-width:1800px;max-height:90vh;overflow:auto;
      background:#fff;border-radius:12px;
      box-shadow:0 15px 55px #0005;color:#163c61;
    }
    #dupGlobalModal header {
      background:#08477f;color:white;padding:17px 20px;
      display:flex;align-items:center;justify-content:space-between;
      position:sticky;top:0;z-index:2;
    }
    #dupGlobalModal header strong {font-size:15px}
    #dupGlobalModal header small {display:block;margin-top:5px;color:#d8eafa}
    #dupGlobalModal header button {
      color:white;background:transparent;border:0;
      font-size:27px;cursor:pointer;
    }
    #dupGlobalModal #dgmContent {padding:20px}
    #dupGlobalModal .dgm-summary {
      padding:13px;background:#edf5fc;border:1px solid #d4e4f2;
      border-radius:8px;margin-bottom:15px;
    }
    #dupGlobalModal .dgm-section {
      margin:19px 0 9px;font-weight:bold;color:#07599a;
    }
    #dupGlobalModal .dgm-table {
      width:100%;border-collapse:collapse;min-width:1350px;
    }
    #dupGlobalModal .dgm-table th {
      background:#eaf2fa;color:#174a78;text-align:left;
      padding:11px 9px;
    }
    #dupGlobalModal .dgm-table td {
      padding:11px 9px;border-bottom:1px solid #e2eaf1;
      vertical-align:top;
    }
    #dupGlobalModal .dgm-table tr:hover {background:#f3f8fd}
    #dupGlobalModal .dgm-scroll {overflow-x:auto;border:1px solid #dce6ef;border-radius:7px}
    #dupGlobalModal .dgm-tag {
      display:inline-block;padding:4px 8px;border-radius:5px;
      font-weight:bold;font-size:10px;
    }
    #dupGlobalModal .dgm-red {background:#ffe5e5;color:#bd2929}
    #dupGlobalModal .dgm-orange {background:#fff0d9;color:#98600b}
    #dupGlobalModal .dgm-blue {background:#e5f1ff;color:#1764a4}
    #dupGlobalModal .dgm-green {background:#e3f6eb;color:#137b4b}
    #dupGlobalModal .dgm-note {
      margin-top:14px;padding:11px;background:#f1f6fb;
      border-left:3px solid #2581c4;line-height:1.5;
    }
    #dupGlobalModal .dgm-empty {
      text-align:center;padding:25px;color:#59748e;
      background:#f5f8fb;border-radius:8px;
    }
    .dup-indicator {
      display:inline-flex!important;align-items:center;justify-content:center;
      width:27px;height:27px;border:0;border-radius:50%;
      cursor:pointer;font-size:14px;font-weight:bold;
      background:#e8f5ed;color:#16804d;
    }
    .dup-indicator.found {background:#fff0ed;color:#c83232}
    .dup-indicator.error {background:#fff3dc;color:#a66a0b}
    .dup-indicator:hover {outline:2px solid #8ab7df}
  `;
  css.textContent += `
    /* CGM_HISTORICO_DUP_V1 */
    #dupGlobalModal .dgm-box{width:97vw;max-width:1800px;max-height:94vh}
    #dupGlobalModal #dgmContent{padding:14px!important}
    #dupGlobalModal .dgm-historico{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}
    #dupGlobalModal .dgm-historico-table{table-layout:fixed!important;min-width:1100px!important;width:100%!important;font-size:12px!important;line-height:1.45!important}
    #dupGlobalModal .dgm-historico-table th,#dupGlobalModal .dgm-historico-table td{white-space:normal!important;overflow:visible!important;text-overflow:clip!important;overflow-wrap:anywhere!important;word-break:normal!important;max-width:none!important;min-width:0!important;vertical-align:top!important;text-align:left!important;padding:10px 9px!important;height:auto!important;font-size:12px!important;line-height:1.45!important}
    #dupGlobalModal .dgm-historico-table th{background:#e6eff8!important;position:static!important}
    #dupGlobalModal .dgm-historico-table td>*{white-space:normal!important;overflow:visible!important;text-overflow:clip!important;max-width:none!important}
    #dupGlobalModal .dgm-scroll{overflow-x:auto!important;max-width:100%}
    #dupGlobalModal .dgm-historico-table .dgm-tag{white-space:normal!important;line-height:1.3!important;font-size:10px!important;max-width:100%!important}
    #dupGlobalModal .dgm-historico-table .dgm-alvo td{background:#e8f3fc!important;border-top:2px solid #237fc1;border-bottom:2px solid #237fc1}
    #dupGlobalModal .dgm-muted{font-size:11px;color:#536c84;margin:3px 0}
    #dupGlobalModal .dgm-data{font-weight:700;color:#07599a;margin-bottom:5px}
    #dupGlobalModal .dgm-evidencias{display:block!important;list-style:disc outside!important;margin:5px 0!important;padding-left:15px!important;white-space:normal!important}
    #dupGlobalModal .dgm-evidencias li{display:list-item!important;margin:3px 0!important;white-space:normal!important;overflow:visible!important;text-overflow:clip!important;line-height:1.45!important}
    #dupGlobalModal .dgm-alertas{color:#94580b}
    #dupGlobalModal .dgm-indicios{color:#17613e}
    #dupGlobalModal .dgm-acao{margin-top:6px;font-size:12px;line-height:1.5}
    #dupGlobalModal .dgm-spacer{margin-top:9px}
    #dupGlobalModal .dgm-matriz-alerta{background:#fff4e4;border-color:#d99028;color:#854c10}
    @media(max-width:700px){#dupGlobalModal{padding:5px}#dupGlobalModal .dgm-box{width:99vw;max-height:96vh}#dupGlobalModal #dgmContent{padding:8px!important}}
  `;
  document.head.append(css);

  css.textContent += `
    .dup-indicator-cell {
      min-width: 145px;
      width: 145px;
      text-align: center;
      white-space: nowrap;
      padding: 4px 6px !important;
    }
    .dup-indicator {
      width: auto !important;
      min-width: 0 !important;
      height: 25px !important;
      padding: 4px 9px !important;
      border-radius: 5px !important;
      font-size: 10px !important;
      font-weight: 700 !important;
      white-space: nowrap;
      gap: 5px;
    }
    .dup-indicator.found {
      background: #fff0ed !important;
      color: #bd2929 !important;
    }
    .dup-indicator:not(.found):not(.error) {
      background: #e8f5ed !important;
      color: #147b49 !important;
    }
    .dup-indicator.error {
      background: #fff2dc !important;
      color: #98600b !important;
    }
  `;

  css.textContent += `

/* CGM_DUPLICIDADES_RESPONSIVO_V3 */

#dupGlobalModal{
 padding:7px!important;
}

#dupGlobalModal .dgm-box{
 display:flex!important;
 flex-direction:column!important;
 width:calc(100vw - 14px)!important;
 max-width:none!important;
 height:calc(100dvh - 14px)!important;
 max-height:calc(100dvh - 14px)!important;
 min-height:0!important;
 overflow:hidden!important;
 border-radius:9px!important;
}

#dupGlobalModal header{
 flex:0 0 auto!important;
 position:relative!important;
 padding:10px 15px!important;
}

#dupGlobalModal header strong{
 font-size:15px!important;
}

#dupGlobalModal header small{
 font-size:11px!important;
 margin-top:3px!important;
}

#dupGlobalModal #dgmContent{
 display:flex!important;
 flex-direction:column!important;
 flex:1 1 0!important;
 width:100%!important;
 max-width:none!important;
 height:auto!important;
 min-height:0!important;
 margin:0!important;
 padding:10px 12px!important;
 gap:7px!important;
 overflow:hidden!important;
}

#dupGlobalModal .dgm-summary{
 flex:0 0 auto;
 width:100%!important;
 padding:9px 12px!important;
 margin:0!important;
 font-size:12px!important;
 line-height:1.4!important;
}

#dupGlobalModal .dgm-section{
 flex:0 0 auto;
 margin:0!important;
 padding:3px 0!important;
 font-size:12px!important;
}

#dupGlobalModal .dgm-note{
 flex:0 0 auto;
 margin:0!important;
 padding:7px 10px!important;
 font-size:11px!important;
 line-height:1.35!important;
}

#dupGlobalModal .dgm-scroll{
 flex:1 1 0!important;
 min-height:0!important;
 width:100%!important;
 max-width:none!important;
 max-height:none!important;
 height:auto!important;
 overflow:hidden!important;
}

#dupGlobalModal .dgm-scroll.dgm-overflow{
 overflow:auto!important;
}

#dupGlobalModal .dgm-historico-table{
 width:100%!important;
 min-width:0!important;
 max-width:none!important;
 table-layout:fixed!important;
 border-collapse:collapse!important;
}

#dupGlobalModal .dgm-historico-table th{
 position:sticky!important;
 top:0!important;
 z-index:1;
 padding:9px!important;
 font-size:12px!important;
}

#dupGlobalModal .dgm-historico-table td{
 padding:9px!important;
 font-size:12px!important;
 line-height:1.4!important;
 white-space:normal!important;
 overflow-wrap:anywhere!important;
}

#dupGlobalModal .dgm-evidencias{
 margin:3px 0!important;
 padding-left:15px!important;
}

#dupGlobalModal .dgm-evidencias li{
 margin:2px 0!important;
 line-height:1.35!important;
}

#dupGlobalModal .dgm-acao{
 font-size:12px!important;
 line-height:1.4!important;
}

#dupGlobalModal tr.dgm-page-hidden{
 display:none!important;
}

#dupGlobalModal .dgm-pagebar{
 display:flex;
 flex-wrap:wrap;
 flex:0 0 auto;
 justify-content:space-between;
 align-items:center;
 gap:6px;
 padding:5px 0;
}

#dupGlobalModal .dgm-pagebar div{
 display:flex;
 align-items:center;
 flex-wrap:wrap;
 gap:6px;
}

#dupGlobalModal .dgm-pagebar button{
 padding:6px 10px;
 border:1px solid #bad1e5;
 border-radius:5px;
 background:#f4f8fc;
 color:#07599a;
 font-weight:700;
 cursor:pointer;
}

#dupGlobalModal .dgm-pagebar button:disabled{
 opacity:.4;
 cursor:default;
}

#dupGlobalModal .dgm-pageinfo{
 font-weight:700;
 color:#315d82;
 font-size:12px;
}

@media(max-width:900px){

 #dupGlobalModal .dgm-historico-table,
 #dupGlobalModal .dgm-historico-table tbody{
  display:block!important;
 }

 #dupGlobalModal .dgm-historico-table thead,
 #dupGlobalModal .dgm-historico-table colgroup{
  display:none!important;
 }

 #dupGlobalModal .dgm-historico-table tr:not(.dgm-page-hidden){
  display:grid!important;
  grid-template-columns:repeat(2,minmax(0,1fr));
  margin:5px;
  border:1px solid #d7e5ef;
  border-radius:6px;
 }

 #dupGlobalModal .dgm-historico-table td{
  display:block!important;
  border-bottom:1px solid #e3edf5;
 }

 #dupGlobalModal .dgm-historico-table td:before{
  content:attr(data-label);
  display:block;
  color:#07599a;
  font-weight:700;
  font-size:11px;
  margin-bottom:5px;
 }

 #dupGlobalModal .dgm-historico-table td:nth-child(4),
 #dupGlobalModal .dgm-historico-table td:nth-child(6){
  grid-column:1/-1;
 }
}

@media(max-height:500px){
 #dupGlobalModal #dgmContent{
  overflow:auto!important;
 }
 #dupGlobalModal .dgm-scroll{
  min-height:160px!important;
 }
}

`;

  css.textContent += "\n\n/* CGM_DUPLICIDADES_COMPACTO_V4 */\n\n#dupGlobalModal #dgmContent{\n padding:8px 10px!important;\n gap:5px!important;\n overflow:hidden!important;\n}\n\n#dupGlobalModal header{\n padding:8px 12px!important;\n}\n\n#dupGlobalModal .dgm-summary{\n padding:6px 9px!important;\n font-size:12px!important;\n line-height:1.3!important;\n}\n\n#dupGlobalModal .dgm-note{\n padding:5px 8px!important;\n font-size:11px!important;\n line-height:1.3!important;\n}\n\n#dupGlobalModal .dgm-historico{\n align-items:center!important;\n margin:0!important;\n gap:6px!important;\n}\n\n#dupGlobalModal .dgm-scroll{\n flex:1 1 0!important;\n min-height:0!important;\n height:auto!important;\n max-height:none!important;\n overflow-y:auto!important;\n overflow-x:auto!important;\n overscroll-behavior:contain;\n scrollbar-width:thin;\n scrollbar-color:#91aec6 #eef4fa;\n}\n\n#dupGlobalModal .dgm-historico-table{\n width:100%!important;\n min-width:0!important;\n table-layout:fixed!important;\n border-collapse:separate!important;\n border-spacing:0!important;\n font-size:11px!important;\n}\n\n#dupGlobalModal .dgm-historico-table th{\n position:sticky!important;\n top:0!important;\n z-index:3!important;\n padding:6px 7px!important;\n font-size:11px!important;\n background:#e3edf7!important;\n}\n\n#dupGlobalModal .dgm-historico-table td{\n padding:5px 7px!important;\n font-size:11px!important;\n line-height:1.25!important;\n vertical-align:top!important;\n white-space:normal!important;\n overflow-wrap:anywhere!important;\n}\n\n#dupGlobalModal .dgm-historico-table tbody tr:nth-child(even){\n background:#f4f8fc;\n}\n\n#dupGlobalModal .dgm-muted{\n margin:2px 0!important;\n font-size:10px!important;\n line-height:1.25!important;\n}\n\n#dupGlobalModal .dgm-data{\n margin-bottom:2px!important;\n}\n\n#dupGlobalModal .dgm-spacer{\n margin-top:4px!important;\n}\n\n#dupGlobalModal .dgm-tag{\n padding:3px 6px!important;\n font-size:10px!important;\n}\n\n#dupGlobalModal .dgm-evidencias{\n margin:2px 0!important;\n padding-left:13px!important;\n}\n\n#dupGlobalModal .dgm-evidencias li{\n margin:1px 0!important;\n line-height:1.25!important;\n}\n\n#dupGlobalModal .dgm-acao{\n margin-top:3px!important;\n font-size:11px!important;\n line-height:1.3!important;\n}\n\n#dupGlobalModal .dgm-alvo td{\n background:#dbeeff!important;\n border-top:2px solid #237fc1!important;\n border-bottom:2px solid #237fc1!important;\n}\n\n#dupGlobalModal .dgm-ir-alvo{\n padding:5px 9px;\n border:1px solid #bad1e5;\n border-radius:5px;\n background:#f0f6fc;\n color:#07599a;\n font-weight:700;\n font-size:11px;\n cursor:pointer;\n}\n\n#dupGlobalModal .dgm-pagebar{\n display:none!important;\n}\n\n@media(max-height:500px){\n #dupGlobalModal #dgmContent{\n  overflow:auto!important;\n }\n #dupGlobalModal .dgm-scroll{\n  flex:0 0 auto!important;\n  min-height:0!important;\n  overflow:visible!important;\n }\n}\n\n";
  document.body.append(modal);

  const content = document.getElementById('dgmContent');

  function fechar() {
    modal.classList.remove('open');
  }

  document.getElementById('dgmClose').onclick = fechar;
  modal.addEventListener('click', e => {
    if (e.target === modal) fechar();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') fechar();
  });




  function organizarHistorico(){

    const wrap=content.querySelector('.dgm-scroll');
    const table=wrap?.querySelector('table');

    if(!table)return;

    const labels=Array.from(
      table.querySelectorAll('thead th')
    ).map(x=>x.textContent);

    const rows=Array.from(table.tBodies[0].rows);

    rows.forEach(tr=>{

      tr.classList.remove('dgm-page-hidden');

      Array.from(tr.cells).forEach((td,i)=>{
        td.dataset.label=labels[i]||'';
      });

    });

    wrap.scrollTop=0;

    const alvo=table.querySelector('.dgm-alvo');
    const section=content.querySelector('.dgm-historico');

    if(alvo&&section){

      const button=document.createElement('button');

      button.type='button';
      button.className='dgm-ir-alvo';
      button.textContent='Ir para SS consultada';

      button.onclick=()=>{

        const head=table.tHead?.offsetHeight||0;

        wrap.scrollTop+=
          alvo.getBoundingClientRect().top-
          wrap.getBoundingClientRect().top-
          head-6;

      };

      section.append(button);
    }
  }

  function mostrar(d) {
    const alvo = d.alvo || {};
    const resultados = Array.isArray(d.resultados) ? d.resultados : [];
    const duplicatas = Array.isArray(d.duplicatas) ? d.duplicatas : [];
    const matriz = d.matriz || null;
    const chave = r => String(r?.origem || '') + '|' + ssVal(r);
    const normal = v => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
    const status = v => v == null || !String(v).trim() ? 'Não informado' : String(v);
    const integracao = r => status(r.status_integracao ?? r.statusIntegracao ?? r.status_dashboard ?? r.statusDashboard ?? r.status_siscom ?? r.statusSiscom);
    const campo = r => status(r.situacao_campo ?? r.situacaoCampo ?? r.status_campo ?? r.statusCampo);
    const dataMs = r => { const n = r?.registro_em ? Date.parse(r.registro_em) : NaN; return Number.isFinite(n) ? n : Infinity; };
    const dados = new Map();
    for (const r of [...duplicatas,...resultados,matriz,alvo]) {
      if (!r || !ssVal(r)) continue;
      const k = chave(r);
      dados.set(k,{...dados.get(k),...r});
    }
    const matrizAtual = matriz ? (dados.get(chave(matriz)) || matriz) : null;
    const dupSet = new Set(duplicatas.map(chave));
    const linhaAlvo = r => chave(r) === chave(alvo);
    const fortes = r => !linhaAlvo(r) && (dupSet.has(chave(r)) || r.categoria === 'provavel');
    const cancelada = r => /cancelad/.test(normal(campo(r))) || /cancelad/.test(normal(integracao(r))) || /cancelad/.test(normal(r.situacao));
    const encerrada = r => /baixad|rejeitad|encerrad|finalizad|concluid/.test(normal(integracao(r)));
    const matrizRestrita = matrizAtual && (cancelada(matrizAtual) || encerrada(matrizAtual));
    const parcial = !d.cobertura?.completa || d.truncado || d.origem_alvo !== 'indice';
    const completa = !parcial && d.pode_selecionar === true && !matrizRestrita;
    const lista = [...dados.values()].sort((a,b) => {
      const x=dataMs(a),y=dataMs(b);
      return (x===y?0:x<y?-1:1) || (Number(a.tsk_id)||0)-(Number(b.tsk_id)||0) || ssVal(a).localeCompare(ssVal(b));
    });
    const relacionadas = lista.filter(r=>!linhaAlvo(r));
    const semData = lista.filter(r=>!Number.isFinite(dataMs(r))).length;
    const anterior = r => Number.isFinite(dataMs(r)) && Number.isFinite(dataMs(alvo)) && dataMs(r)<dataMs(alvo);
    const posterior = r => Number.isFinite(dataMs(r)) && Number.isFinite(dataMs(alvo)) && dataMs(r)>dataMs(alvo);
    const listaHtml = (items,cls='') => items.length ? '<ul class="dgm-evidencias '+cls+'">'+items.map(t=>'<li>'+safe(t)+'</li>').join('')+'</ul>' : '';
    const arr = x=>Array.isArray(x)?x:[];
    function acao(r) {
      if(linhaAlvo(r))return ['SS em análise','Compare o histórico abaixo antes de decidir sobre programação, TAG ou baixa.','dgm-blue'];
      const x=r.analise_complementar||{};
      const numeroDiferente = !!(alvo.chave_rua && alvo.chave_rua===r.chave_rua && alvo.numero && r.numero && String(alvo.numero)!==String(r.numero));
      const divergencia = !!((alvo.matricula && r.matricula && String(alvo.matricula)!==String(r.matricula)) || (alvo.hidrometro && r.hidrometro && String(alvo.hidrometro)!==String(r.hidrometro)));
      if(cancelada(r))return ['Conferir cancelamento','Consultar o motivo do cancelamento. Não usar esta SS automaticamente como matriz nem rejeitar a atual com base nela.','dgm-orange'];
      if(encerrada(r))return ['Avaliar histórico encerrado','Conferir execução, baixa ou motivo da rejeição. Pode ser reincidência ou nova ocorrência; não rejeitar automaticamente.','dgm-blue'];
      if(numeroDiferente || divergencia)return ['Conferir identificação','Há diferença de número, matrícula ou hidrômetro. Validar o imóvel e o serviço; não confirmar duplicidade só pela proximidade.','dgm-orange'];
      if(Number(x.dias_entre_registros)>180)return ['Avaliar reincidência','O intervalo é superior a 180 dias. Conferir se o problema voltou a ocorrer.','dgm-orange'];
      if(x.relacao_macro==='diferente' || x.relacao_macro==='relacionado' || r.categoria==='relacionado')return ['Conferir serviço relacionado','As macros ou serviços podem representar etapas distintas. Verificar a necessidade de cada SS.','dgm-blue'];
      if(r.categoria==='referencia' || x.referencia_direta)return ['Conferir referência','Ler a SS citada e verificar o vínculo com a ocorrência atual. Citação não confirma duplicidade.','dgm-blue'];
      if(fortes(r)){
        if(/nao informado|indisponivel/.test(normal(campo(r))))return ['Consultar situação atual','O status de campo não está confirmado. Conferir no uMov antes de decidir.','dgm-orange'];
        if(!/pendente de envio para campo/.test(normal(campo(r))))return ['Conferir andamento','Verificar se a equipe já executou ou está atendendo a ocorrência antes de agrupar.','dgm-orange'];
        if(!anterior(r)&&!posterior(r))return ['Conferir datas','Validar a data de abertura e a identidade da ocorrência antes de definir a matriz.','dgm-orange'];
        return ['Avaliar agrupamento',completa?'Há critérios fortes. Conferir a mesma ocorrência e a situação das duas SS antes de qualquer marcação.':'Há critérios fortes, mas a matriz não está validada. Conferir a ocorrência e aguardar ou revisar a cobertura.','dgm-orange'];
      }
      return ['Revisão manual','Conferir endereço, matrícula, hidrômetro e serviço. Correspondência não significa duplicidade.','dgm-blue'];
    }
    const linhas = lista.map((r,i)=>{
      const self=linhaAlvo(r), x=r.analise_complementar||{}, cand=fortes(r);
      const isMatriz=matrizAtual && chave(r)===chave(matrizAtual);
      const rotulo=self?'SS CONSULTADA':cand?'POSSÍVEL DUPLICATA':r.categoria==='referencia'?'SS CITADA':r.categoria==='relacionado'?'SERVIÇO RELACIONADO':'REVISAR';
      const recomendacao=acao(r);
      const momentos = self ? 'Referência da análise' : anterior(r)?'Anterior à consultada':posterior(r)?'Posterior à consultada':Number.isFinite(dataMs(r))?'Mesma data/hora ou data da consultada indisponível':'Data não informada';
      return `<tr class="${self?'dgm-alvo':''}">
        <td><div class="dgm-data">${safe(data(r.registro_em))}</div><strong>${safe(r.ss)}</strong><div class="dgm-muted">${safe(momentos)}</div>${isMatriz?'<div class="dgm-muted"><strong>'+safe(matrizRestrita?'Matriz histórica — revisar':'Matriz indicada pelo índice')+'</strong></div>':''}<div class="dgm-muted">${safe(r.origem==='umov_lote1'?'Lote 1':r.origem==='umov'?'Lote 2':'Origem não informada')}</div></td>
        <td><strong>${safe([r.logradouro||r.rua||r.endereco,r.numero].filter(v=>v!=null&&String(v).trim()).join(', ')||'Não informado')}</strong><div class="dgm-muted">${safe([r.bairro,r.cidade].filter(Boolean).join(' · '))}</div><div>Mat.: ${safe(r.matricula||'—')}</div><div>Hidr.: ${safe(r.hidrometro||'—')}</div><div class="dgm-muted">${safe(r.servico||'Serviço não informado')}</div></td>
        <td><span class="dgm-tag ${self?'dgm-blue':cand?'dgm-red':'dgm-orange'}">${rotulo}</span><div class="dgm-muted">Pontos: ${safe(self?'—':r.pontos??'—')}</div>${listaHtml(self?[]:arr(r.motivos))}</td>
        <td>${self?'<span class="dgm-muted">SS de referência da comparação.</span>':(listaHtml(arr(x.indicios),'dgm-indicios')+listaHtml(arr(x.alertas).map(m=>'ATENÇÃO: '+m),'dgm-alertas')+listaHtml(arr(x.contexto))||'<span class="dgm-muted">Sem dados adicionais disponíveis.</span>')}</td>
        <td><div class="dgm-muted">Integração</div><strong>${safe(integracao(r))}</strong><div class="dgm-muted dgm-spacer">Campo</div><strong>${safe(campo(r))}</strong></td>
        <td><span class="dgm-tag ${recomendacao[2]}">${safe(recomendacao[0])}</span><div class="dgm-acao">${safe(recomendacao[1])}</div></td>
      </tr>`;
    }).join('');
    content.innerHTML = `
      <div class="dgm-summary"><div><strong>SS CONSULTADA: ${safe(alvo.ss||'—')}</strong> · Abertura: ${safe(data(alvo.registro_em))}</div><div>${safe([alvo.logradouro,alvo.numero,alvo.bairro,alvo.cidade].filter(Boolean).join(', ')||'Endereço não informado')}</div><div>Matrícula: ${safe(alvo.matricula||'—')} · Hidrômetro: ${safe(alvo.hidrometro||'—')}</div></div>
      <div class="dgm-note ${matrizRestrita?'dgm-matriz-alerta':''}"><strong>${completa?'Matriz indicada pelo índice':'Matriz histórica / sugerida (não validada operacionalmente)'}:</strong> ${safe(ssVal(matrizAtual)||'Não definida')}${matrizRestrita?' — A SS indicada está cancelada ou encerrada. Revise a ocorrência antes de usar como matriz.': ' — A data mais antiga não comprova duplicidade.'}</div>
      <div class="dgm-section dgm-historico"><span>HISTÓRICO CRONOLÓGICO · MAIS ANTIGA → MAIS RECENTE</span><span>${relacionadas.length} correspondência(s) · ${relacionadas.filter(fortes).length} forte(s)${semData?' · '+semData+' sem data':''}</span></div>
      <div class="dgm-scroll"><table class="dgm-table dgm-historico-table"><colgroup><col style="width:15%"><col style="width:17%"><col style="width:15%"><col style="width:22%"><col style="width:13%"><col style="width:18%"></colgroup><thead><tr><th>Abertura / SS</th><th>Endereço / imóvel</th><th>Classificação e critérios</th><th>Análise complementar</th><th>Situação atual</th><th>Ação recomendada</th></tr></thead><tbody>${linhas}</tbody></table></div>
      ${!relacionadas.length?'<div class="dgm-note">Nenhuma correspondência encontrada entre os registros retornados.</div>':''}
      ${d.truncado?'<div class="dgm-note">Busca limitada: podem existir mais correspondências não exibidas.</div>':''}
      ${arr(d.resultados).length>=80?'<div class="dgm-note">A consulta detalhada retorna até 80 resultados principais, além das duplicatas indicadas. O histórico exibido pode não incluir todas as correspondências.</div>':''}
      ${d.aviso?`<div class="dgm-note">${safe(d.aviso)}</div>`:''}
      ${d.motivo_bloqueio&&!d.pode_selecionar?`<div class="dgm-note">${safe(d.motivo_bloqueio)}</div>`:''}
      <div class="dgm-note"><strong>Importante:</strong> as ações são orientações de conferência. Nenhuma SS foi alterada, rejeitada ou recebeu TAG. A classificação e as regras de autorização existentes permanecem inalteradas.</div>`;
    organizarHistorico();
  }

  async function abrir(ss) {
    modal.classList.add('open');
    content.innerHTML = '<p>Consultando índice global de duplicidades...</p>';

    const dado = cache.get(ss);
    if (dado && dado.detalhes === true && Date.now() - dado.tempo < CACHE_MS) {
      mostrar(dado.resposta);
      return;
    }
    if (dado?.resposta && Date.now() - dado.tempo < CACHE_MS) {
      mostrar(dado.resposta);
      content.insertAdjacentHTML('beforeend',
        '<div class="dgm-note">Atualizando Status da Integração e Situação de Campo...</div>');
    }

    try {
      const r = await fetch(
        '/api/duplicidades/consulta?detalhes=1&ss=' + encodeURIComponent(ss),
        {credentials:'same-origin',cache:'no-store'}
      );
      const j = await r.json();

      if (!r.ok || !j.ok) {
        throw new Error(j.erro || 'Falha na consulta');
      }

      cache.set(ss,{resposta:j,detalhes:true,tempo:Date.now()});
      mostrar(j);
    } catch (e) {
      if (dado?.resposta) {
        mostrar(dado.resposta);
        content.insertAdjacentHTML(
          'beforeend',
          '<div class="dgm-note">Status detalhados indisponíveis nesta consulta.</div>'
        );
      } else {
        content.innerHTML = `
          <div class="dgm-empty">
            Não foi possível consultar esta SS.
            ${safe(e.message)}
          </div>`;
      }
    }
  }

  function consultar(ss) {
    if (!ss || cache.has(ss) || consultando.has(ss)) return;
    consultando.add(ss);
    fila.push(ss);
    processar();
  }

  async function processar() {
    while (ativos < MAX && fila.length) {
      const ss = fila.shift();
      ativos++;

      try {
        const r = await fetch(
          '/api/duplicidades/consulta?ss=' + encodeURIComponent(ss),
          {credentials:'same-origin',cache:'no-store'}
        );
        const j = await r.json();
        if (r.ok && j.ok) {
          if (!cache.get(ss)?.detalhes) cache.set(ss,{resposta:j,detalhes:false,tempo:Date.now()});
        } else {
          cache.set(ss,{resposta:null,erro:true,tempo:Date.now()});
        }
      } catch (_) {
        cache.set(ss,{resposta:null,erro:true,tempo:Date.now()});
      }

      consultando.delete(ss);
      ativos--;
      atualizar();
    }
  }

  function atualizar() {
    const ativo = typeof currentScreen !== 'undefined' && currentScreen === 'recepcao';

    let header = document.getElementById('dupIndicatorHeader');
    let filtro = document.getElementById('dupIndicatorFilter');

    const equipeHeader = document.getElementById('receptionTeamHeader');
    const equipeFiltro = document.getElementById('receptionTeamFilterCell');





    if (header) header.hidden = !ativo;
    if (filtro) filtro.hidden = !ativo;
    if (!ativo) {
      document.querySelectorAll('#rows td.dup-indicator-cell').forEach(td => td.remove());
      return;
    }

    const linhas = document.querySelectorAll('#rows tr');
    const registros = typeof view !== 'undefined' && Array.isArray(view)
      ? view.slice(0, Number(page) || 25) : [];

    linhas.forEach((tr,i) => {
      const x = registros[i];
      if (!x) return;

      let td = tr.querySelector('.dup-indicator-cell');
      if (!td) {
        td = document.createElement('td');
        td.className = 'dup-indicator-cell';
        const celulaSS = tr.children[1];
        if (celulaSS) celulaSS.after(td);
        else tr.appendChild(td);
      }

      const ss = ssVal(x);
      const dado = cache.get(ss);
      let classe = 'dup-indicator';
      let titulo = 'Consultar possíveis duplicidades';
      let simbolo = '◌';
      let rotulo = 'Verificando';

      if (dado && dado.erro) {
        classe += ' error';
        simbolo = '●';
        rotulo = 'Consulta indisponível';
        titulo = 'Falha na consulta. Clique para tentar novamente.';
      } else if (dado?.resposta) {
        const j = dado.resposta;
        const resultados = Array.isArray(j.resultados) ? j.resultados : [];
        const duplicatas = Array.isArray(j.duplicatas) ? j.duplicatas : [];
        const n = Math.max(duplicatas.length, resultados.length);
        // So classifica como possivel duplicata se as regras legadas forem fortes.
        // Mesma rua, numero diferente, servico relacionado ou SS citada = REVISAR.
        const fortes = duplicatas.length || resultados.filter(r => r && r.categoria === 'provavel').length;
        if (n) {
          classe += fortes ? ' found' : ' error';
          simbolo = '●';
          rotulo = fortes ? 'Possível duplicata' : 'Revisar';
          titulo = fortes
            ? fortes + ' candidata(s) com criterios fortes; confira as SS relacionadas.'
            : n + ' correspondencia(s) fraca(s) ou referencia(s); nao confirma duplicidade.';
        } else {
          simbolo = '●';
          if (j.cobertura && j.cobertura.completa === true &&
              j.origem_alvo === 'indice' && !j.truncado) {
            rotulo = 'Única';
            titulo = 'Sem correspondências no índice completo.';
          } else {
            classe += ' error';
            rotulo = 'Revisar';
            titulo = 'Índice parcial ou SS ainda não indexada.';
          }
        }
      }

      td.innerHTML = '';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = classe;
      if (!dado) btn.dataset.cgmChecking = '1';
      btn.textContent = '● ' + rotulo;
      btn.title = titulo;
      btn.setAttribute('aria-label',titulo);

      // Impede que o clique alcance a linha e abra o painel lateral.
      ['pointerdown','mousedown','click','dblclick'].forEach(ev => {
        btn.addEventListener(ev,e => {
          e.preventDefault();
          e.stopPropagation();
          if (ev === 'click') {
            if (dado?.erro) cache.delete(ss);
            abrir(ss);
          }
        },true);
      });

      td.appendChild(btn);
      if (!dado) consultar(ss);
    });
  }

  const estiloTextoIndicadores = document.createElement('style');
  estiloTextoIndicadores.textContent = `
    #rows .dup-indicator-cell {
      min-width: 155px !important;
      width: 155px !important;
      text-align: center !important;
      padding: 4px 6px !important;
    }

    #rows .dup-indicator {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      width: auto !important;
      min-width: 125px !important;
      max-width: none !important;
      height: 27px !important;
      padding: 4px 10px !important;
      border-radius: 5px !important;
      font-size: 11px !important;
      font-weight: 700 !important;
      line-height: 1.2 !important;
      white-space: nowrap !important;
      overflow: visible !important;
      text-indent: 0 !important;
      letter-spacing: normal !important;
    }
  `;
  document.head.appendChild(estiloTextoIndicadores);
  const estiloRuaDuplicidades = document.createElement('style');
  estiloRuaDuplicidades.textContent = `
    .dgm-table .dgm-rua {
      min-width: 220px;
      max-width: 340px;
      white-space: normal;
      overflow-wrap: anywhere;
      text-align: left;
      line-height: 1.4;
      font-size: 11px;
    }
    .dgm-scroll {
      overflow-x: auto;
    }
  `;
  document.head.appendChild(estiloRuaDuplicidades);
  window.__globalDupIndicatorInstalled = true;
  window.__atualizarIndicadoresDuplicidade = atualizar;

  const tbody = document.getElementById('rows');
  if (tbody) {
    new MutationObserver(() => setTimeout(atualizar,100))
      .observe(tbody,{childList:true});
  }

  document.querySelectorAll('[data-screen]').forEach(btn => {
    btn.addEventListener('click',() => setTimeout(atualizar,200));
  });

  setTimeout(atualizar,400);
  console.log('[Duplicidades] Clique e detalhes globais instalados.');
})();