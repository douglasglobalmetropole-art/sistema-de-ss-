/* CGM_FOTOS_SEQUENCIAS_V1 */
(function () {
  'use strict';

  const el = id => document.getElementById(id);
  const modal = el('umovFotosModal');
  const botao = el('viewPhotosBtn');
  const corpo = modal?.querySelector('.ufBody');

  if (!modal || !botao || !corpo) return;

  const area = document.createElement('div');
  area.id = 'cgmFotosComparacao';
  area.innerHTML = `
    <section class="cgmFotoPainel" id="cgmFotosAnterior">
      <header><strong>Fotos das sequências anteriores</strong></header>
      <label for="cgmFotosSequencia">Selecionar sequência</label>
      <select id="cgmFotosSequencia"></select>
      <label for="cgmFotosRelatorio">Relatório uMov</label>
      <select id="cgmFotosRelatorio"></select>
      <div class="cgmFotoStatus" id="cgmFotosStatusAnterior"></div>
      <div class="cgmFotoImagem" id="cgmFotosImagemAnterior"></div>
      <nav>
        <button type="button" id="cgmFotosAnteriorVoltar">Anterior</button>
        <span id="cgmFotosAnteriorContador"></span>
        <button type="button" id="cgmFotosAnteriorAvancar">Próxima</button>
      </nav>
    </section>
    <section class="cgmFotoPainel" id="cgmFotosAtual">
      <header><strong>Fotos da SS atual</strong></header>
      <div class="cgmFotoIdentificacao" id="cgmFotosNumeroAtual"></div>
      <div class="cgmFotoStatus" id="cgmFotosStatusAtual"></div>
      <div class="cgmFotoImagem" id="cgmFotosImagemAtual"></div>
      <nav>
        <button type="button" id="cgmFotosAtualVoltar">Anterior</button>
        <span id="cgmFotosAtualContador"></span>
        <button type="button" id="cgmFotosAtualAvancar">Próxima</button>
      </nav>
    </section>
  `;

  corpo.appendChild(area);
  modal.classList.add('cgmFotosV1');

  const estado = {
    atual: { fotos: [], indice: 0 },
    anterior: { fotos: [], indice: 0 }
  };

  let abertura = 0;
  let trocaAnterior = 0;
  let registros = [];
  let ssAberta = '';

  const selecao = el('cgmFotosSequencia');
  const relatorio = el('cgmFotosRelatorio');

  function identificacao() {
    const baixa = el('siscomBaixaModal');
    if (baixa?.classList.contains('open') &&
        window.__siscomBaixaSelecionada) {
      return window.__siscomBaixaSelecionada;
    }
    const selecionadas = Object.values(window.selected || {});
    return selecionadas.length === 1
      ? selecionadas[0]
      : (window.__detailSS || null);
  }

  function api(caminho) {
    // O bootstrap das divisões adapta automaticamente /api/.
    return '/api/' + caminho;
  }

  async function fotosDaTarefa(ss, tarefa) {
    const resposta = await fetch(api('relatorio-fotos'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
      body: JSON.stringify({ ss, tarefa })
    });

    const dados = await resposta.json();
    if (!resposta.ok || !dados.ok) {
      throw new Error(dados.error || 'Falha ao consultar fotografias.');
    }
    return Array.isArray(dados.fotos) ? dados.fotos : [];
  }

  function status(tipo, mensagem) {
    el(tipo === 'atual'
      ? 'cgmFotosStatusAtual'
      : 'cgmFotosStatusAnterior').textContent = mensagem;
  }

  function desenhar(tipo) {
    const atual = tipo === 'atual';
    const item = estado[tipo];
    const imagem = el(atual
      ? 'cgmFotosImagemAtual'
      : 'cgmFotosImagemAnterior');
    const contador = el(atual
      ? 'cgmFotosAtualContador'
      : 'cgmFotosAnteriorContador');

    imagem.replaceChildren();

    if (!item.fotos.length) {
      contador.textContent = '0 fotos';
      return;
    }

    item.indice = Math.max(
      0, Math.min(item.indice, item.fotos.length - 1)
    );

    const foto = document.createElement('img');
    foto.src = item.fotos[item.indice];
    foto.alt = 'Fotografia ' + (item.indice + 1);
    foto.loading = 'eager';
    foto.title = 'Clique para ampliar';

    foto.addEventListener('click', () => {
      el('umovFotosZoomImg').src = foto.src;
      el('umovFotosZoom').classList.add('open');
    });

    imagem.appendChild(foto);
    contador.textContent =
      (item.indice + 1) + ' de ' + item.fotos.length;
  }

  function navegar(tipo, delta) {
    const item = estado[tipo];
    if (!item.fotos.length) return;
    item.indice = (
      item.indice + delta + item.fotos.length
    ) % item.fotos.length;
    desenhar(tipo);
  }

  el('cgmFotosAtualVoltar').onclick =
    () => navegar('atual', -1);
  el('cgmFotosAtualAvancar').onclick =
    () => navegar('atual', 1);
  el('cgmFotosAnteriorVoltar').onclick =
    () => navegar('anterior', -1);
  el('cgmFotosAnteriorAvancar').onclick =
    () => navegar('anterior', 1);

  async function carregarAnterior() {
    const geracao = ++trocaAnterior;
    const tarefa = Number(relatorio.value);
    const registro = registros.find(
      r => String(r.tarefa) === String(tarefa) &&
           r.numero_ss === selecao.value
    );

    estado.anterior = { fotos: [], indice: 0 };
    desenhar('anterior');

    if (!registro) return;

    status('anterior', 'Consultando fotos do relatório uMov...');

    try {
      const fotos = await fotosDaTarefa(
        registro.numero_ss, registro.tarefa
      );

      if (geracao !== trocaAnterior) return;

      estado.anterior = { fotos, indice: 0 };
      status('anterior', fotos.length
        ? ''
        : 'Nenhuma fotografia neste relatório.');
      desenhar('anterior');
    } catch (erro) {
      if (geracao !== trocaAnterior) return;
      status('anterior', 'Erro: ' + erro.message);
    }
  }

  function atualizarRelatorios() {
    relatorio.replaceChildren();

    const daSequencia = registros.filter(
      r => r.numero_ss === selecao.value
    );

    daSequencia.forEach((r, indice) => {
      const opcao = document.createElement('option');
      opcao.value = String(r.tarefa);

      const data = r.data_execucao
        ? new Date(r.data_execucao).toLocaleString('pt-BR')
        : 'Data não informada';

      opcao.textContent =
        'Relatório ' + (indice + 1) + ' — ' + data;

      relatorio.appendChild(opcao);
    });

    carregarAnterior();
  }

  selecao.addEventListener('change', atualizarRelatorios);
  relatorio.addEventListener('change', carregarAnterior);

  async function abrir() {
    const x = identificacao();

    if (!x?.ss || !x?.tarefa) {
      window.notify?.(
        'Selecione uma SS com tarefa uMov para visualizar as fotos.',
        'error'
      );
      return;
    }

    const geracao = ++abertura;
    ++trocaAnterior;
    ssAberta = String(x.ss);

    modal.classList.add('open');
    el('umovFotosTitle').textContent =
      'Fotos uMov — ' + ssAberta;

    el('cgmFotosNumeroAtual').textContent = ssAberta;
    el('cgmFotosAnterior').hidden = true;
    el('cgmFotosComparacao')?.classList.remove('comAnterior');

    estado.atual = { fotos: [], indice: 0 };
    estado.anterior = { fotos: [], indice: 0 };
    desenhar('atual');
    desenhar('anterior');

    status('atual', 'Consultando fotos da SS atual...');
    status('anterior', '');
    registros = [];

    const atual = fotosDaTarefa(ssAberta, x.tarefa)
      .then(fotos => {
        if (geracao !== abertura) return;
        estado.atual = { fotos, indice: 0 };
        status('atual', fotos.length
          ? ''
          : 'Nenhuma fotografia encontrada.');
        desenhar('atual');
      })
      .catch(erro => {
        if (geracao === abertura) {
          status('atual', 'Erro: ' + erro.message);
        }
      });

    const anteriores = fetch(
      api('umov/sequencias-fotos') +
        '?ss=' + encodeURIComponent(ssAberta),
      { credentials: 'same-origin', cache: 'no-store' }
    )
      .then(async resposta => {
        const dados = await resposta.json();
        if (!resposta.ok || !dados.ok) {
          throw new Error(
            dados.error || 'Falha ao consultar sequências.'
          );
        }
        return Array.isArray(dados.sequencias)
          ? dados.sequencias : [];
      })
      .then(lista => {
        if (geracao !== abertura) return;

        registros = lista;
        selecao.replaceChildren();

        const numeros = [
          ...new Set(lista.map(r => r.numero_ss))
        ];

        if (!numeros.length) {
          el('cgmFotosAnterior').hidden = true;
          return;
        }

        numeros.forEach(numero => {
          const opcao = document.createElement('option');
          opcao.value = numero;
          opcao.textContent = numero;
          selecao.appendChild(opcao);
        });

        el('cgmFotosAnterior').hidden = false;
        area.classList.add('comAnterior');
        atualizarRelatorios();
      })
      .catch(erro => {
        if (geracao !== abertura) return;
        // Mantém o painel atual mesmo se a consulta falhar.
        el('cgmFotosAnterior').hidden = false;
        area.classList.add('comAnterior');
        selecao.replaceChildren();
        relatorio.replaceChildren();
        status('anterior', 'Erro na consulta: ' + erro.message);
      });

    await Promise.allSettled([atual, anteriores]);
  }

  // Intercepta apenas a abertura da galeria.
  // Não altera o botão de baixa nem a sincronização SISCOM.
  document.addEventListener('click', evento => {
    if (evento.target === botao ||
        evento.target.closest?.('#viewPhotosBtn')) {
      evento.preventDefault();
      evento.stopImmediatePropagation();
      void abrir();
    }
  }, true);

  // Invalida respostas pendentes ao fechar a galeria.
  const observador = new MutationObserver(() => {
    if (!modal.classList.contains('open')) {
      ++abertura;
      ++trocaAnterior;
    }
  });

  observador.observe(modal, {
    attributes: true,
    attributeFilter: ['class']
  });
})();