/* CGM_FOTOS_FIXO_V7 - paineis independentes; baixa SISCOM intacta */
(function () {
  'use strict';
  const api = location.pathname.startsWith('/lote1') ? '/lote1/api' : '/api';
  const el = id => document.getElementById(id);
  async function obterJson(caminho, opcoes) {
    const resposta = await fetch(caminho, {credentials: 'same-origin', cache: 'no-store', ...opcoes});
    const dado = await resposta.json().catch(() => null);
    if (!resposta.ok || !dado?.ok) {
      const motivo = dado?.error || 'Resposta inválida da consulta';
      throw new Error(motivo + ' (HTTP ' + resposta.status + ')');
    }
    return dado;
  }

  function fonteValida(fonte) {
    if (typeof fonte !== 'string' || !fonte) return false;
    if (/^data:image\/(?:jpe?g|png|gif|webp|avif|bmp);base64,/i.test(fonte)) return true;
    try {
      const url = new URL(fonte, location.href);
      return !url.username && !url.password &&
        (url.protocol === 'https:' || (url.origin === location.origin && url.protocol === 'http:'));
    } catch (_) {
      return false;
    }
  }

  function montarFotos(grade, dados, {signal, aoAtualizar, aoAmpliar}) {
    const direta = dados.origem === 'direta';
    const fontes = Array.isArray(dados.fotos) ? dados.fotos.filter(fonteValida) : [];
    const cards = fontes.map((src, i) => {
      const figura = document.createElement('figure');
      const img = document.createElement('img');
      const legenda = document.createElement('figcaption');
      img.alt = 'Foto ' + (i + 1);
      img.title = 'Clique para ampliar';
      img.loading = i < 2 ? 'eager' : 'lazy';
      if (i === 0) img.fetchPriority = 'high';
      img.decoding = 'async';
      img.referrerPolicy = 'no-referrer';
      legenda.textContent = img.alt;
      figura.append(img, legenda);
      return {src, img, figura, estado: 'pendente'};
    });
    let pendentes = cards.length;
    let prontas = 0;
    let falhas = 0;

    function ampliar(card) {
      if (card?.estado !== 'pronta') return;
      const disponiveis = cards.filter(item => item.estado === 'pronta' || item.estado === 'pendente');
      aoAmpliar(disponiveis.map(item => item.src), disponiveis.indexOf(card));
    }
    const ampliarPrimeira = () => ampliar(cards.find(item => item.estado === 'pronta'));

    return new Promise(resolve => {
      const atualizar = () => {
        aoAtualizar({prontas, pendentes, falhas, truncado: dados.truncado, ampliarPrimeira});
        if (prontas || !pendentes) resolve(prontas > 0);
      };
      const cancelar = () => {
        for (const {img} of cards) img.removeAttribute('src');
        grade.replaceChildren();
        resolve(false);
      };
      signal.addEventListener('abort', cancelar, {once: true});

      let iniciadas = Math.min(2, cards.length);
      function concluir(card, estado) {
        if (signal.aborted || card.estado !== 'pendente') return;
        card.estado = estado;
        pendentes--;
        if (estado === 'pronta') prontas++;
        else {
          if (estado === 'falha') falhas++;
          card.figura.remove();
          // Native lazy loading may never reach the remaining candidates after
          // early images fail. Advance until a photo succeeds or all fail.
          if (!prontas && cards[iniciadas]) cards[iniciadas++].img.loading = 'eager';
        }
        if (!pendentes) signal.removeEventListener('abort', cancelar);
        atualizar();
      }

      for (const card of cards) {
        card.img.onload = () => concluir(card,
          direta && (card.img.naturalWidth < 180 || card.img.naturalHeight < 120) ? 'pequena' : 'pronta');
        card.img.onerror = () => concluir(card, 'falha');
        card.img.onclick = () => ampliar(card);
      }
      grade.replaceChildren(...cards.map(card => card.figura));
      for (const card of cards) card.img.src = card.src;
      atualizar();
    });
  }

  async function carregarGaleria({grade, ss, tarefa, signal, aoAtualizar, aoAmpliar, iniciarPorCaptura = false}) {
    const modos = iniciarPorCaptura ? ['captura'] : ['direto', 'captura'];
    for (const modo of modos) {
      const dados = await obterJson(api + '/relatorio-fotos', {
        method: 'POST', signal, headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ss, tarefa, modo})
      });
      if (signal.aborted) return;
      const exibida = await montarFotos(grade, dados, {
        signal, aoAmpliar,
        aoAtualizar: estado => {
          const recuperando = modo === 'direto' && dados.origem === 'direta' && !estado.prontas && !estado.pendentes;
          aoAtualizar({...estado, recuperando, direta: dados.origem === 'direta'});
        }
      });
      if (exibida || dados.origem !== 'direta' || signal.aborted) break;
    }
  }

  window.__ssCarregarGaleriaFotos = carregarGaleria;

  const modal = el('siscomBaixaModal');
  const shell = modal && modal.querySelector('.sbShell');
  if (!modal || !shell || el('cgmFotosAnteriorLateral')) return;

  // Os tres paineis sao irmaos. Nao mover ou modificar o formulario original.
  const esquerda = document.createElement('section');
  const direita = document.createElement('section');
  esquerda.id = 'cgmFotosAnteriorLateral';
  direita.id = 'cgmFotosAtualLateral';
  esquerda.className = direita.className = 'cgmFotosLateral';
  esquerda.setAttribute('aria-label', 'Fotos das sequencias anteriores');
  direita.setAttribute('aria-label', 'Fotos da SS atual');
  esquerda.innerHTML = `
    <h4>\u25a3 Fotos da SS \u2014 antes / apoio</h4>
    <div class="cgmFotosSeletores">
      <label for="cgmSeqAnterior">Sequ\u00eancia anterior</label>
      <select id="cgmSeqAnterior" aria-label="Selecionar sequencia anterior"></select>
      <label id="cgmRelLabel" for="cgmRelAnterior">Relat\u00f3rio uMov</label>
      <select id="cgmRelAnterior" aria-label="Selecionar relatorio uMov"></select>
    </div>
    <p class="cgmFotosStatus" id="cgmStatusAnterior" role="status"></p>
    <div class="cgmFotosMiniaturas" id="cgmGridAnterior"></div>
    <footer><span id="cgmCountAnterior">0 foto(s)</span><button type="button" id="cgmAmpliarAnterior">Ampliar \u2197</button></footer>`;
  direita.innerHTML = `
    <h4>\u25a3 Fotos da SS \u2014 execu\u00e7\u00e3o / detalhe</h4>
    <p class="cgmNumeroSS" id="cgmNumeroAtual"></p>
    <p class="cgmFotosStatus" id="cgmStatusAtual" role="status"></p>
    <div class="cgmFotosMiniaturas" id="cgmGridAtual"></div>
    <footer><span id="cgmCountAtual">0 foto(s)</span><button type="button" id="cgmAmpliarAtual">Ampliar \u2197</button></footer>`;
  modal.insertBefore(esquerda, shell);
  modal.insertBefore(direita, shell.nextSibling);

  // Zoom proprio, sem abrir a antiga galeria sobre o formulario.
  const zoom = document.createElement('div');
  zoom.id = 'cgmFotosZoomV7';
  zoom.hidden = true;
  zoom.setAttribute('role', 'dialog');
  zoom.setAttribute('aria-modal', 'true');
  zoom.setAttribute('aria-label', 'Fotografia ampliada');
  zoom.innerHTML = `<button type="button" data-photo-action="close" class="cgmZoomFechar" aria-label="Fechar amplia\u00e7\u00e3o">\u00d7</button>
   <button type="button" data-photo-action="prev" class="cgmZoomAnterior" aria-label="Foto anterior">\u2039</button>
   <figure><img alt="Fotografia ampliada"><figcaption></figcaption></figure>
   <button type="button" data-photo-action="next" class="cgmZoomProxima" aria-label="Pr\u00f3xima foto">\u203a</button>`;
  document.body.appendChild(zoom);

  let atualSS = '';
  let tarefaAtual = 0;
  let registros = [];
  let ampliarAtual, ampliarAnterior;
  let fotosZoom = [];
  let indiceZoom = 0;
  let estadoAtual = '', estadoAnterior = '', estadoSequencias = '';
  let carga, cargaAnterior, cargaSequencias;
  const seq = el('cgmSeqAnterior');
  const rel = el('cgmRelAnterior');

  const imagemZoom = zoom.querySelector('img');
  imagemZoom.referrerPolicy = 'no-referrer';
  imagemZoom.onerror = () => {
    if (zoom.hidden) return;
    zoom.querySelector('figcaption').textContent = 'Não foi possível ampliar a foto ' + (indiceZoom + 1) + '.';
  };

  function zoomDesenhar() {
    if (!fotosZoom.length) return;
    imagemZoom.src = fotosZoom[indiceZoom];
    zoom.querySelector('figcaption').textContent = 'Foto ' + (indiceZoom + 1) + ' de ' + fotosZoom.length;
  }
  function zoomAbrir(lista, indice) {
    if (!lista.length) return;
    fotosZoom = lista;
    indiceZoom = indice;
    zoom.hidden = false;
    zoomDesenhar();
  }
  function zoomFechar() {
    zoom.hidden = true;
    imagemZoom.removeAttribute('src');
    fotosZoom = [];
  }
  zoom.addEventListener('click', e => {
    const acao = e.target.closest('[data-photo-action]')?.dataset.photoAction;
    if (acao === 'close' || e.target === zoom) zoomFechar();
    if ((acao === 'prev' || acao === 'next') && fotosZoom.length) {
      const delta = acao === 'prev' ? -1 : 1;
      indiceZoom = (indiceZoom + delta + fotosZoom.length) % fotosZoom.length;
      zoomDesenhar();
    }
  });
  document.addEventListener('keydown', e => {
    if (zoom.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); zoomFechar(); }
    if (['ArrowLeft', 'ArrowRight'].includes(e.key) && fotosZoom.length) {
      e.preventDefault();
      indiceZoom = (indiceZoom + (e.key === 'ArrowLeft' ? -1 : 1) + fotosZoom.length) % fotosZoom.length;
      zoomDesenhar();
    }
  }, true);

  function painel(lado) {
    const nome = lado === 'anterior' ? 'Anterior' : 'Atual';
    return {grade: el('cgmGrid' + nome), contador: el('cgmCount' + nome), status: el('cgmStatus' + nome)};
  }

  function estadoGaleria(lado, estado) {
    if (lado === 'anterior') estadoAnterior = estado;
    else estadoAtual = estado;
  }

  function limparPainel(lado, texto = '') {
    const {grade, contador, status} = painel(lado);
    if (lado === 'anterior') ampliarAnterior = null;
    else ampliarAtual = null;
    grade.replaceChildren();
    contador.textContent = '0 foto(s)';
    status.textContent = texto;
    el(lado === 'anterior' ? 'cgmAmpliarAnterior' : 'cgmAmpliarAtual').disabled = true;
  }

  async function exibirFotos(lado, ss, tarefa, signal, iniciarPorCaptura) {
    const {grade, contador, status} = painel(lado);
    estadoGaleria(lado, 'carregando');
    limparPainel(lado, 'Consultando fotos...');
    try {
      await carregarGaleria({grade, ss, tarefa, signal, iniciarPorCaptura, aoAmpliar: zoomAbrir,
        aoAtualizar({prontas, pendentes, falhas, recuperando, direta, truncado, ampliarPrimeira}) {
          if (lado === 'anterior') ampliarAnterior = prontas ? ampliarPrimeira : null;
          else ampliarAtual = prontas ? ampliarPrimeira : null;
          el(lado === 'anterior' ? 'cgmAmpliarAnterior' : 'cgmAmpliarAtual').disabled = !prontas;
          contador.textContent = prontas + ' foto(s)' + (truncado ? ' · limite de 40' : '');
          if (!prontas && (pendentes || recuperando)) estadoGaleria(lado, 'carregando');
          else if (falhas) estadoGaleria(lado, direta ? 'falha-direta' : 'falha');
          else estadoGaleria(lado, 'pronto');
          if (recuperando) status.textContent = 'Buscando fotos pelo relatório uMov...';
          else if (falhas && (prontas || !pendentes)) {
            status.textContent = (prontas ? 'Algumas fotos não carregaram.' : 'As fotos não carregaram.') +
              ' Use Recarregar consultas para tentar de novo.';
          } else if (prontas) status.textContent = '';
          else status.textContent = pendentes ? 'Carregando imagens...' : 'Nenhuma fotografia encontrada.';
        }
      });
    } catch (err) {
      if (signal.aborted) return;
      estadoGaleria(lado, 'falha');
      status.textContent = 'Falha ao consultar: ' + err.message + '. Use Recarregar consultas para tentar de novo.';
    }
  }

  function carregarAtual(iniciarPorCaptura = false) {
    carga?.abort();
    carga = new AbortController();
    void exibirFotos('atual', atualSS, tarefaAtual, carga.signal, iniciarPorCaptura);
  }

  function carregarAnterior(iniciarPorCaptura = false) {
    cargaAnterior?.abort();
    const registro = registros.find(r => r.numero_ss === seq.value && String(r.tarefa) === rel.value);
    if (!registro) {
      limparPainel('anterior');
      return;
    }
    cargaAnterior = new AbortController();
    void exibirFotos('anterior', registro.numero_ss, registro.tarefa, cargaAnterior.signal, iniciarPorCaptura);
  }

  function preencherRelatorios() {
    rel.replaceChildren();
    const lista = registros.filter(r => r.numero_ss === seq.value);
    lista.forEach((item, i) => {
      const option = document.createElement('option');
      option.value = String(item.tarefa);
      const data = item.data_execucao ? new Date(item.data_execucao).toLocaleString('pt-BR') : 'Sem data';
      option.textContent = 'Relat\u00f3rio ' + (i + 1) + ' \u2014 ' + data;
      rel.append(option);
    });
    el('cgmRelLabel').hidden = lista.length <= 1;
    rel.hidden = lista.length <= 1;
    void carregarAnterior();
  }
  seq.addEventListener('change', preencherRelatorios);
  rel.addEventListener('change', () => { void carregarAnterior(); });
  el('cgmAmpliarAnterior').onclick = () => ampliarAnterior?.();
  el('cgmAmpliarAtual').onclick = () => ampliarAtual?.();

  async function carregarSequencias() {
    cargaSequencias?.abort();
    cargaSequencias = new AbortController();
    const {signal} = cargaSequencias;
    estadoSequencias = 'carregando';
    const {status} = painel('anterior');
    status.textContent = 'Consultando sequências anteriores...';
    try {
      const dado = await obterJson(api + '/umov/sequencias-fotos?ss=' + encodeURIComponent(atualSS), {signal});
      if (signal.aborted) return;
      estadoSequencias = 'pronto';
      registros = Array.isArray(dado.sequencias) ? dado.sequencias : [];
      const opcoes = [...new Set(registros.map(r => r.numero_ss))].filter(Boolean);
      esquerda.hidden = !opcoes.length;
      if (!opcoes.length) return;
      seq.replaceChildren(...opcoes.map(numero => new Option(numero, numero)));
      preencherRelatorios();
    } catch (err) {
      if (signal.aborted) return;
      estadoSequencias = 'falha';
      esquerda.hidden = false;
      status.textContent = 'Consulta indisponível: ' + err.message + '. Use Recarregar consultas para tentar de novo.';
    }
  }

  function redefinirGalerias() {
    carga?.abort();
    cargaAnterior?.abort();
    cargaSequencias?.abort();
    registros = [];
    estadoAtual = estadoAnterior = estadoSequencias = '';
    seq.replaceChildren();
    rel.replaceChildren();
    limparPainel('atual');
    limparPainel('anterior');
    zoomFechar();
  }

  function tentarCarregar() {
    if (!modal.classList.contains('open')) {
      if (atualSS) redefinirGalerias();
      atualSS = '';
      tarefaAtual = 0;
      return;
    }
    const ss = window.__siscomBaixaSelecionada;
    if (!ss?.ss || !ss?.tarefa || (ss.ss === atualSS && Number(ss.tarefa) === tarefaAtual)) return;
    redefinirGalerias();
    atualSS = ss.ss;
    tarefaAtual = Number(ss.tarefa);
    esquerda.hidden = false;
    direita.hidden = false;
    el('cgmNumeroAtual').textContent = atualSS;
    carregarAtual();
    if (atualSS.endsWith('-00')) {
      esquerda.hidden = true;
      estadoSequencias = 'pronto';
    } else void carregarSequencias();
  }

  const observer = new MutationObserver(tentarCarregar);
  observer.observe(modal, {attributes: true, attributeFilter: ['class']});
  tentarCarregar();

  // Preserve the SISCOM refresh, with an independent retry for each failed gallery.
  el('sbRecarregar')?.addEventListener('click', () => {
    if (!modal.classList.contains('open') || !atualSS) return;
    if (estadoAtual.startsWith('falha')) carregarAtual(estadoAtual === 'falha-direta');
    if (estadoSequencias === 'falha') void carregarSequencias();
    else if (estadoAnterior.startsWith('falha')) carregarAnterior(estadoAnterior === 'falha-direta');
  });

  // The existing photo action opens the side gallery zoom in the baixa modal.
  document.addEventListener('click', e => {
    const botao = e.target.closest?.('#viewPhotosBtn, #sbVerFotos');
    if (!botao || !modal.classList.contains('open')) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    tentarCarregar();
    if (ampliarAtual) ampliarAtual();
    else if (atualSS && estadoAtual.startsWith('falha')) carregarAtual(estadoAtual === 'falha-direta');
  }, true);
})();
