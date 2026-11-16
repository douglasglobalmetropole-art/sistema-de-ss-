(function () {
  'use strict';

  if (window.__globalDupIndicatorInstalled) return;
  window.__globalDupIndicatorInstalled = true;

  const cache = new Map();
  const pendentes = [];
  const emConsulta = new Set();
  let executando = 0;
  const MAX_SIMULTANEAS = 3;
  const CACHE_MS = 10 * 60 * 1000;

  const css = document.createElement('style');
  css.textContent = `
    .dup-indicator-cell {
      text-align:center!important;
      width:90px;
      padding:5px!important;
    }
    .dup-indicator {
      display:inline-flex;
      align-items:center;
      justify-content:center;
      min-width:25px;
      height:23px;
      border:0;
      border-radius:12px;
      font-weight:800;
      font-size:13px;
      cursor:default;
      background:transparent;
    }
    .dup-indicator.found {color:#c43b36;background:#fff0ee}
    .dup-indicator.clear {color:#168354;background:#eaf7ef}
    .dup-indicator.error {color:#a56b10;background:#fff5df}
    #dupCheckBtn {display:none!important}
  `;
  document.head.appendChild(css);

  function prepararColuna() {
    const equipe = document.getElementById('receptionTeamHeader');
    const filtro = document.getElementById('receptionTeamFilterCell');

    if (equipe && !document.getElementById('dupIndicatorHeader')) {
      const th = document.createElement('th');
      th.id = 'dupIndicatorHeader';
      th.textContent = 'INDICADOR';
      equipe.after(th);
    }

    if (filtro && !document.getElementById('dupIndicatorFilter')) {
      const td = document.createElement('td');
      td.id = 'dupIndicatorFilter';
      td.innerHTML = '&nbsp;';
      filtro.after(td);
    }
  }

  function atualizar() {
    prepararColuna();

    const header = document.getElementById('dupIndicatorHeader');
    const filtro = document.getElementById('dupIndicatorFilter');

    const ativo =
      typeof currentScreen !== 'undefined' &&
      currentScreen === 'recepcao';

    if (header) header.hidden = !ativo;
    if (filtro) filtro.hidden = !ativo;

    if (!ativo) return;

    const linhas = document.querySelectorAll('#rows tr');
    const registros = typeof view !== 'undefined'
      ? view.slice(0, Number(page) || 25)
      : [];

    linhas.forEach((tr, i) => {
      const x = registros[i];
      if (!x) return;

      let td = tr.querySelector('.dup-indicator-cell');

      if (!td) {
        td = document.createElement('td');
        td.className = 'dup-indicator-cell';

        const equipe = tr.children[2];
        if (equipe) equipe.after(td);
        else tr.appendChild(td);
      }

      const ss = String(x.ss || '').trim();
      const dado = cache.get(ss);

      if (dado && Date.now() - dado.tempo < CACHE_MS) {
        desenhar(td, dado);
      } else {
        td.innerHTML = '<span class="dup-indicator" title="Verificando...">◌</span>';
        consultar(ss);
      }
    });
  }

  function desenhar(td, dado) {
    if (dado.estado === 'encontrada') {
      td.innerHTML =
        '<span class="dup-indicator found" title="' +
        'Possíveis correspondências: ' + dado.quantidade +
        '. Não representa confirmação de duplicidade.">●</span>';
    } else if (dado.estado === 'limpa') {
      td.innerHTML =
        '<span class="dup-indicator clear" title="' +
        'Nenhuma correspondência encontrada no índice.">●</span>';
    } else {
      td.innerHTML =
        '<span class="dup-indicator error" title="' +
        'Não foi possível consultar. Verifique o login SISCOM.">?</span>';
    }
  }

  function consultar(ss) {
    if (!ss || emConsulta.has(ss)) return;

    const antigo = cache.get(ss);
    if (antigo && Date.now() - antigo.tempo < CACHE_MS) return;

    emConsulta.add(ss);
    pendentes.push(ss);
    processarFila();
  }

  async function processarFila() {
    while (executando < MAX_SIMULTANEAS && pendentes.length) {
      const ss = pendentes.shift();
      executando++;

      (async () => {
        let dado;

        try {
          const r = await fetch(
            '/api/duplicidades/consulta?ss=' + encodeURIComponent(ss),
            {
              credentials: 'same-origin',
              cache: 'no-store',
              signal: AbortSignal.timeout(15000)
            }
          );

          const j = await r.json();

          if (!r.ok || !j.ok) {
            throw new Error(j.erro || 'Consulta indisponível');
          }

          const resultados = Array.isArray(j.resultados)
            ? j.resultados
            : [];

          dado = {
            estado: resultados.length ? 'encontrada' : 'limpa',
            quantidade: resultados.length,
            tempo: Date.now()
          };

        } catch (e) {
          dado = {
            estado: 'erro',
            quantidade: 0,
            tempo: Date.now()
          };
        }

        cache.set(ss, dado);
        emConsulta.delete(ss);
        executando--;

        atualizar();
        processarFila();
      })();
    }
  }

  const tbody = document.getElementById('rows');

  if (tbody) {
    new MutationObserver(() => {
      clearTimeout(window.__dupIndicatorTimer);
      window.__dupIndicatorTimer = setTimeout(atualizar, 100);
    }).observe(tbody, { childList: true });
  }

  document.querySelectorAll('.tab[data-screen]').forEach(btn => {
    btn.addEventListener('click', () => {
      setTimeout(atualizar, 150);
    });
  });

  window.__atualizarIndicadoresDuplicidade = atualizar;

  setTimeout(atualizar, 300);

  console.log('[Duplicidades] Indicadores automáticos instalados.');
})();