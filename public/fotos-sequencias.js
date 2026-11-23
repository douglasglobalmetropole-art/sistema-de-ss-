/* CGM_FOTOS_FIXO_V7 - paineis independentes; baixa SISCOM intacta */
(function () {
  'use strict';
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
  const capturaCache = new Map();
  const fotosCacheV3 = new Map(), fotosPendentesV3 = new Map();
  const seqCacheV3 = new Map(), seqPendentesV3 = new Map();
  const prefetchV3 = new Set();
  function lerV3(m,k){const v=m.get(k);if(!v)return null;if(v.expira<Date.now()){m.delete(k);return null;}return v.dados;}
  function guardarV3(m,k,dados,ttl,limite){m.delete(k);m.set(k,{dados,expira:Date.now()+ttl});while(m.size>limite)m.delete(m.keys().next().value);}
  const capturaEmAndamento = new Set();
  const seq = el('cgmSeqAnterior');
  const btnRetryV3=document.createElement('button');
  btnRetryV3.type='button';btnRetryV3.textContent='Tentar novamente';btnRetryV3.hidden=true;
  btnRetryV3.style.cssText='margin:6px 10px;padding:7px;border:1px solid #96b6cc;border-radius:5px;color:#14527b;background:#f8fcff;cursor:pointer';
  el('cgmStatusAnterior').insertAdjacentElement('afterend',btnRetryV3);
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
      img.loading = indice < 3 ? 'eager' : 'lazy';
      img.decoding = 'async';
      if(indice===0)img.fetchPriority='high';
      if (/^https:\/\//i.test(src)) {
        img.addEventListener('error', () => { void recuperarCaptura(lado); }, {once:true});
      }
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
  async function recuperarCaptura(lado) {
    const anterior = lado === 'anterior';
    const reg = anterior ? registros.find(r => r.numero_ss === seq.value && String(r.tarefa) === rel.value) : null;
    const ss = anterior ? reg?.numero_ss : atualSS;
    const tarefa = anterior ? reg?.tarefa : tarefaAtual;
    if (!ss || !tarefa || !modal.classList.contains('open')) return;
    const chave = String(ss) + '|' + String(tarefa);
    if (capturaEmAndamento.has(chave)) return;
    capturaEmAndamento.add(chave);
    const tokenAtual = versao, tokenAnterior = versaoAnterior;
    mensagem(lado, 'Algumas imagens exigem autenticaÃ§Ã£o. Recuperando fotografias...');
    try {
      const fotos = await buscarFotos(ss, tarefa, 'captura');
      if (!modal.classList.contains('open') || tokenAtual !== versao ||
          (anterior && (tokenAnterior !== versaoAnterior || seq.value !== ss || rel.value !== String(tarefa)))) return;
      if (anterior) fotosAnteriores = fotos; else fotosAtuais = fotos;
      renderizar(lado, fotos);
      mensagem(lado, fotos.length ? '' : 'Fotografias indisponÃ­veis neste relatÃ³rio.');
    } catch (erro) {
      if (tokenAtual === versao && (!anterior || tokenAnterior === versaoAnterior))
        mensagem(lado, 'NÃ£o foi possÃ­vel recuperar as imagens: ' + erro.message);
    } finally { capturaEmAndamento.delete(chave); }
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
  async function buscarFotos(ss,tarefa,modo='direto') {
    const chave=String(ss)+'|'+String(tarefa);
    if(modo==='direto'){
      if(capturaCache.has(chave))return capturaCache.get(chave);
      const salvo=lerV3(fotosCacheV3,chave);
      if(salvo)return salvo;
      if(fotosPendentesV3.has(chave))return fotosPendentesV3.get(chave);
    }
    const p=(async()=>{
      const dado=await obterJson('/api/relatorio-fotos',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ss,tarefa,modo})
      });
      const fotos=Array.isArray(dado.fotos)?dado.fotos:[];
      if(modo==='captura'&&fotos.length){
        capturaCache.set(chave,fotos);
        while(capturaCache.size>8)capturaCache.delete(capturaCache.keys().next().value);
      }else if(modo==='direto'&&fotos.length){
        guardarV3(fotosCacheV3,chave,fotos,10*60*1000,12);
      }
      return fotos;
    })();
    if(modo!=='direto')return p;
    fotosPendentesV3.set(chave,p);
    try{return await p;}finally{if(fotosPendentesV3.get(chave)===p)fotosPendentesV3.delete(chave);}
  }
  function buscarSequenciasV3(ss){
    const chave=String(ss),salvo=lerV3(seqCacheV3,chave);
    if(salvo)return Promise.resolve(salvo);
    if(seqPendentesV3.has(chave))return seqPendentesV3.get(chave);
    const p=obterJson('/api/umov/sequencias-fotos?ss='+encodeURIComponent(chave))
      .then(dado=>{guardarV3(seqCacheV3,chave,dado,3*60*1000,20);return dado;})
      .finally(()=>seqPendentesV3.delete(chave));
    seqPendentesV3.set(chave,p);return p;
  }
  window.CGM_Fotos_precarregar=x=>{
    if(!x||!/^\d{2}\/\d{2}-\d{6}-\d{2}$/.test(String(x.ss))||
      !Number.isSafeInteger(Number(x.tarefa))||Number(x.tarefa)<=0)return;
    const k=String(x.ss)+'|'+String(x.tarefa);
    if(prefetchV3.has(k)||prefetchV3.size>=2)return;
    prefetchV3.add(k);
    Promise.allSettled([buscarFotos(x.ss,x.tarefa),buscarSequenciasV3(x.ss)])
      .finally(()=>prefetchV3.delete(k));
  };
  async function carregarAnterior() {
    const token = ++versaoAnterior;
    const registro = registros.find(r => r.numero_ss === seq.value && String(r.tarefa) === rel.value);
    fotosAnteriores = [];
    renderizar('anterior', []);
    if (!registro) return;
    mensagem('anterior', 'Consultando fotos anteriores...');
    try {
      const fotos = await buscarFotos(registro.numero_ss, registro.tarefa);
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
    const token = ++versao;
    ++versaoAnterior;
    atualSS = String(ss);
    tarefaAtual = Number(tarefa);
    jaCarregando = true;
    esquerda.hidden = false;
    direita.hidden = false;
    registros = [];
    btnRetryV3.hidden=true;
    seq.replaceChildren();
    rel.replaceChildren();
    fotosAtuais = [];
    fotosAnteriores = [];
    renderizar('atual', []);
    renderizar('anterior', []);
    el('cgmNumeroAtual').textContent = atualSS;
    mensagem('atual', 'Consultando fotos atuais...');
    mensagem('anterior', 'Consultando sequ\u00eancias anteriores...');

    const atualPromise = buscarFotos(atualSS, tarefaAtual).then(fotos => {
      if (token !== versao || !modal.classList.contains('open')) return;
      fotosAtuais = fotos;
      renderizar('atual', fotos);
      mensagem('atual', fotos.length ? '' : 'Nenhuma fotografia encontrada.');
    }).catch(err => {
      if (token === versao) mensagem('atual', 'Falha ao consultar: ' + err.message);
    });

    const anteriorPromise = buscarSequenciasV3(atualSS).then(dado => {
      if (token !== versao || !modal.classList.contains('open')) return;
      btnRetryV3.hidden=true;
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
      btnRetryV3.hidden=false;
    });
    await Promise.allSettled([atualPromise, anteriorPromise]);
    if (token === versao) jaCarregando = false;
  }
  btnRetryV3.onclick=()=>{
    if(!atualSS||!modal.classList.contains('open'))return;
    const ss=atualSS,tarefa=tarefaAtual;
    seqCacheV3.delete(ss);
    btnRetryV3.hidden=true;
    // Consultar apenas os dados anteriores; as fotos atuais permanecem na tela.
    const token=versao;
    mensagem('anterior','Tentando consultar sequ\u00eancias anteriores...');
    buscarSequenciasV3(ss).then(dado=>{
      if(token!==versao||!modal.classList.contains('open'))return;
      registros=Array.isArray(dado.sequencias)?dado.sequencias:[];
      const itens=[...new Set(registros.map(r=>r.numero_ss))].filter(Boolean);
      seq.replaceChildren();
      if(!itens.length){esquerda.hidden=true;return;}
      esquerda.hidden=false;
      for(const numero of itens){const op=document.createElement('option');op.value=numero;op.textContent=numero;seq.append(op);}
      mensagem('anterior','');preencherRelatorios();
    }).catch(err=>{
      if(token!==versao||!modal.classList.contains('open'))return;
      mensagem('anterior','Consulta indispon\u00edvel: '+err.message);
      btnRetryV3.hidden=false;
    });
  };
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
      setTimeout(() => tentarCarregar(), 0);
    } else if (!aberta && abertaAntes) {
      abertaAntes = false;
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