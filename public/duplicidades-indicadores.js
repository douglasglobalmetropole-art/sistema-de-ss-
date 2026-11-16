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
      <main id="dgmContent">
        <p>Carregando correspondências...</p>
      </main>
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
      width:min(900px,96vw);max-height:88vh;overflow:auto;
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
    #dupGlobalModal main {padding:20px}
    #dupGlobalModal .dgm-summary {
      padding:13px;background:#edf5fc;border:1px solid #d4e4f2;
      border-radius:8px;margin-bottom:15px;
    }
    #dupGlobalModal .dgm-section {
      margin:19px 0 9px;font-weight:bold;color:#07599a;
    }
    #dupGlobalModal .dgm-table {
      width:100%;border-collapse:collapse;min-width:620px;
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

  function mostrar(d) {
    const alvo = d.alvo || {};
    const resultados = Array.isArray(d.resultados) ? d.resultados : [];
    const duplicatas = Array.isArray(d.duplicatas) ? d.duplicatas : [];
    const matriz = d.matriz || null;

    const matrizSS = ssVal(matriz);
    const duplicataSet = new Set(duplicatas.map(ssVal));

    const relacionados = [...resultados];
    const vistos = new Set(resultados.map(ssVal).filter(Boolean));

    duplicatas.forEach(r => {
      if (!r || typeof r !== 'object') return;
      const numero = ssVal(r);
      if (numero && !vistos.has(numero)) {
        relacionados.push(r);
        vistos.add(numero);
      }
    });

    const lista = relacionados.map(r => {
      const isDuplicata = duplicataSet.has(ssVal(r));
      const categoria = r.categoria || 'proximidade';
      const classe = isDuplicata ? 'dgm-red' :
        categoria === 'provavel' ? 'dgm-orange' : 'dgm-blue';

      return `
        <tr>
          <td><strong>${safe(r.ss)}</strong></td>
<td class="dgm-rua">${safe(
  [
    r.logradouro || r.rua || r.endereco,
    r.numero
  ].filter(v => v !== null && v !== undefined && String(v).trim() !== '').join(', ') || 'Não informado'
)}</td>
          <td><span class="dgm-tag ${classe}">
            ${isDuplicata ? 'DUPLICATA' : categoria.toUpperCase()}
          </span></td>
          <td>${safe(r.matricula || '—')}</td>
          <td>${safe(r.hidrometro || '—')}</td>
          <td>${safe(r.pontos ?? '—')}</td>
          <td>${safe((r.motivos || []).join(' · ') || 'Conferir dados')}</td>
        </tr>`;
    }).join('');

    content.innerHTML = `
      <div class="dgm-summary">
        <strong>SS CONSULTADA:</strong> ${safe(alvo.ss || '—')}<br>
        <strong>Matrícula:</strong> ${safe(alvo.matricula || '—')}
        &nbsp; | &nbsp;
        <strong>Hidrômetro:</strong> ${safe(alvo.hidrometro || '—')}<br>
        <strong>Endereço:</strong>
        ${safe([alvo.logradouro,alvo.numero,alvo.bairro,alvo.cidade].filter(Boolean).join(', ') || 'Não informado')}
      </div>

      <div class="dgm-section">
        SS MATRIZ: ${safe(matrizSS || 'Não definida')}
      </div>

      <div class="dgm-section">
        POSSÍVEIS DUPLICATAS E CORRESPONDÊNCIAS
        (${relacionados.length})
      </div>

      ${relacionados.length ? `
        <div class="dgm-scroll">
          <table class="dgm-table">
            <thead>
              <tr>
                <th>SS relacionada</th>
                <th>RUA</th>
                <th>Classificação</th>
                <th>Matrícula</th>
                <th>Hidrômetro</th>
                <th>Pontos</th>
                <th>Critérios encontrados</th>
              </tr>
            </thead>
            <tbody>${lista}</tbody>
          </table>
        </div>
      ` : `
        <div class="dgm-empty">
          Nenhuma SS correspondente encontrada no índice global.
        </div>
      `}

      ${d.aviso ? `<div class="dgm-note">${safe(d.aviso)}</div>` : ''}
      ${d.motivo_bloqueio && !d.pode_selecionar
        ? `<div class="dgm-note">${safe(d.motivo_bloqueio)}</div>` : ''}

      <div class="dgm-note">
        <strong>Importante:</strong> correspondências são indícios para conferência.
        Nenhuma SS foi alterada ou recebeu TAG nesta consulta.
      </div>
    `;
  }

  async function abrir(ss) {
    modal.classList.add('open');
    content.innerHTML = '<p>Consultando índice global de duplicidades...</p>';

    const dado = cache.get(ss);
    if (dado && Date.now() - dado.tempo < CACHE_MS) {
      mostrar(dado.resposta);
      return;
    }

    try {
      const r = await fetch(
        '/api/duplicidades/consulta?ss=' + encodeURIComponent(ss),
        {credentials:'same-origin',cache:'no-store'}
      );
      const j = await r.json();

      if (!r.ok || !j.ok) {
        throw new Error(j.erro || 'Falha na consulta');
      }

      cache.set(ss,{resposta:j,tempo:Date.now()});
      mostrar(j);
    } catch (e) {
      content.innerHTML = `
        <div class="dgm-empty">
          Não foi possível consultar esta SS.<br>
          ${safe(e.message)}
        </div>`;
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
          cache.set(ss,{resposta:j,tempo:Date.now()});
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
    const ativo = typeof currentScreen !== 'undefined' &&
      ['recepcao','campo','baixar','encerradas','tramitacao']
        .includes(currentScreen);

    let header = document.getElementById('dupIndicatorHeader');
    let filtro = document.getElementById('dupIndicatorFilter');

    const equipeHeader = document.getElementById('receptionTeamHeader');
    const equipeFiltro = document.getElementById('receptionTeamFilterCell');





    if (header) header.hidden = !ativo;
    if (filtro) filtro.hidden = !ativo;
    if (!ativo) return;

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
        const n = Math.max((j.duplicatas || []).length, (j.resultados || []).length);
        if (n) {
          classe += ' found';
          simbolo = '●';
          rotulo = 'Possível duplicata';
          titulo = n + ' correspondência(s). Clique para ver as SS.';
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