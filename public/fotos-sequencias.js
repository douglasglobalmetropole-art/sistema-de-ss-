/* CGM_FOTOS_FIXO_V7 - paineis independentes; baixa SISCOM intacta */
(function () {
  'use strict';
  const api = location.pathname.startsWith('/lote1') ? '/lote1/api' : '/api';
  const el = id => document.getElementById(id);
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
  let versao = 0;
  let versaoAnterior = 0;
  let registros = [];
  let fotosAtuais = [];
  let fotosAnteriores = [];
  let fotosZoom = [];
  let indiceZoom = 0;
  let abertaAntes = false;
  let jaCarregando = false;
  let carga, cargaAnterior;
  const seq = el('cgmSeqAnterior');
  const rel = el('cgmRelAnterior');

  function zoomDesenhar() {
    if (!fotosZoom.length) return;
    zoom.querySelector('img').src = fotosZoom[indiceZoom];
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
    zoom.querySelector('img').removeAttribute('src');
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

  function renderizar(lado, fotos) {
    const esquerdaLado = lado === 'anterior';
    const grade = el(esquerdaLado ? 'cgmGridAnterior' : 'cgmGridAtual');
    const contador = el(esquerdaLado ? 'cgmCountAnterior' : 'cgmCountAtual');
    grade.replaceChildren();
    const fragmento = document.createDocumentFragment();
    fotos.forEach((src, indice) => {
      if (typeof src !== 'string' || !src) return;
      const figura = document.createElement('figure');
      const img = document.createElement('img');
      const legenda = document.createElement('figcaption');
      img.loading = indice < 2 ? 'eager' : 'lazy';
      img.decoding = 'async';
      img.src = src;
      img.alt = 'Foto ' + (indice + 1);
      img.title = 'Clique para ampliar';
      img.onclick = () => zoomAbrir(fotos, indice);
      legenda.textContent = 'Foto ' + (indice + 1);
      figura.append(img, legenda);
      fragmento.append(figura);
    });
    grade.append(fragmento);
    contador.textContent = fotos.length + ' foto(s)';
  }
  function mensagem(lado, texto) {
    el(lado === 'anterior' ? 'cgmStatusAnterior' : 'cgmStatusAtual').textContent = texto || '';
  }
  async function obterJson(caminho, opcoes) {
    const resposta = await fetch(caminho, {credentials: 'same-origin', cache: 'no-store', ...opcoes});
    let dado;
    try { dado = await resposta.json(); } catch (_) { throw new Error('Resposta invalida da API (HTTP ' + resposta.status + ')'); }
    if (!resposta.ok || !dado.ok) {
      throw new Error((dado.code ? '[' + dado.code + '] ' : '') + (dado.error || 'Falha na consulta') + ' (HTTP ' + resposta.status + ')');
    }
    return dado;
  }
  async function buscarFotos(ss, tarefa, signal) {
    const dado = await obterJson(api + '/relatorio-fotos', {
      method: 'POST', signal, headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ss, tarefa})
    });
    return Array.isArray(dado.fotos) ? dado.fotos : [];
  }
  async function carregarAnterior() {
    cargaAnterior?.abort();
    cargaAnterior = new AbortController();
    const token = ++versaoAnterior;
    const registro = registros.find(r => r.numero_ss === seq.value && String(r.tarefa) === rel.value);
    fotosAnteriores = [];
    renderizar('anterior', []);
    if (!registro) return;
    mensagem('anterior', 'Consultando fotos anteriores...');
    try {
      const fotos = await buscarFotos(registro.numero_ss, registro.tarefa, cargaAnterior.signal);
      if (token !== versaoAnterior || !modal.classList.contains('open')) return;
      fotosAnteriores = fotos;
      renderizar('anterior', fotos);
      mensagem('anterior', fotos.length ? '' : 'Nenhuma foto neste relat\u00f3rio.');
    } catch (err) {
      if (token === versaoAnterior) mensagem('anterior', 'Falha ao carregar: ' + err.message);
    }
  }
  function preencherRelatorios() {
    ++versaoAnterior;
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
  el('cgmAmpliarAnterior').onclick = () => zoomAbrir(fotosAnteriores, 0);
  el('cgmAmpliarAtual').onclick = () => zoomAbrir(fotosAtuais, 0);

  async function carregarDados(ss, tarefa) {
    carga?.abort();
    cargaAnterior?.abort();
    carga = new AbortController();
    const {signal} = carga;
    const token = ++versao;
    ++versaoAnterior;
    atualSS = String(ss);
    tarefaAtual = Number(tarefa);
    jaCarregando = true;
    esquerda.hidden = false;
    direita.hidden = false;
    registros = [];
    seq.replaceChildren();
    rel.replaceChildren();
    fotosAtuais = [];
    fotosAnteriores = [];
    renderizar('atual', []);
    renderizar('anterior', []);
    el('cgmNumeroAtual').textContent = atualSS;
    mensagem('atual', 'Consultando fotos atuais...');
    mensagem('anterior', 'Consultando sequ\u00eancias anteriores...');

    const atualPromise = buscarFotos(atualSS, tarefaAtual, signal).then(fotos => {
      if (token !== versao || !modal.classList.contains('open')) return;
      fotosAtuais = fotos;
      renderizar('atual', fotos);
      mensagem('atual', fotos.length ? '' : 'Nenhuma fotografia encontrada.');
    }).catch(err => {
      if (token === versao) mensagem('atual', 'Falha ao consultar: ' + err.message);
    });

    const anteriorPromise = obterJson(api + '/umov/sequencias-fotos?ss=' + encodeURIComponent(atualSS), {signal}).then(dado => {
      if (token !== versao || !modal.classList.contains('open')) return;
      registros = Array.isArray(dado.sequencias) ? dado.sequencias : [];
      const opcoes = [...new Set(registros.map(r => r.numero_ss))].filter(Boolean);
      if (!opcoes.length) {
        esquerda.hidden = true; // Somente quando a consulta confirmou ausencia de sequencias.
        return;
      }
      esquerda.hidden = false;
      opcoes.forEach(numero => {
        const opt = document.createElement('option');
        opt.value = numero;
        opt.textContent = numero;
        seq.append(opt);
      });
      mensagem('anterior', '');
      preencherRelatorios();
    }).catch(err => {
      if (token !== versao) return;
      esquerda.hidden = false; // Erros nao sao confundidos com ausencia de sequencias.
      mensagem('anterior', 'Consulta indispon\u00edvel: ' + err.message);
    });
    await Promise.allSettled([atualPromise, anteriorPromise]);
    if (token === versao) jaCarregando = false;
  }
  function obterSelecionada() {
    const selecionada = window.__siscomBaixaSelecionada;
    return selecionada?.ss && selecionada?.tarefa ? selecionada : null;
  }
  function tentarCarregar(tentativas = 0) {
    if (!modal.classList.contains('open')) return;
    const ss = obterSelecionada();
    if (!ss) {
      if (tentativas < 30) setTimeout(() => tentarCarregar(tentativas + 1), 120);
      return;
    }
    if (String(ss.ss) === atualSS && Number(ss.tarefa) === tarefaAtual && jaCarregando) return;
    if (String(ss.ss) === atualSS && Number(ss.tarefa) === tarefaAtual && direita.querySelector('img')) return;
    void carregarDados(ss.ss, ss.tarefa);
  }
  const observer = new MutationObserver(() => {
    const aberta = modal.classList.contains('open');
    if (aberta && !abertaAntes) {
      abertaAntes = true;
      setTimeout(() => tentarCarregar(), 90);
    } else if (!aberta && abertaAntes) {
      abertaAntes = false;
      carga?.abort();
      cargaAnterior?.abort();
      ++versao;
      ++versaoAnterior;
      atualSS = '';
      jaCarregando = false;
      zoomFechar();
    }
  });
  observer.observe(modal, {attributes:true, attributeFilter:['class']});
  if (modal.classList.contains('open')) { abertaAntes = true; tentarCarregar(); }

  // Evita abrir o modal antigo ao clicar em Ver fotos; abre zoom no painel atual.
  document.addEventListener('click', e => {
    const botao = e.target.closest?.('#viewPhotosBtn, #sbVerFotos');
    if (!botao || !modal.classList.contains('open')) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (botao.id === 'sbVerFotos' && fotosAtuais.length) zoomAbrir(fotosAtuais, 0);
    else tentarCarregar();
  }, true);
})();