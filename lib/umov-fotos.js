'use strict';

const {parseDocument} = require('htmlparser2');

const MAX_FOTOS = 40;
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const NAO_FOTO = /logo|icone|icon|bras[aã]o|banner|assinatura|(?:^|[\/_-])(?:spacer|pixel|placeholder|loading)(?:[.\/_-]|$)/i;
const TOKEN = /^[a-zA-Z0-9._~-]+$/;

async function consultarRelatorioFotos(pool, tarefa, ss) {
  const values = [tarefa, ss];
  const resultado = await pool.query({
    text: `SELECT l.loc_city AS cidade, to_jsonb(t)->>'tsk_accesstoken' AS token
           FROM u45468.task t
           JOIN u45468.local l ON l.loc_id=t.loc_id
           WHERE t.tsk_id=$1 AND l.loc_integrationid=$2 AND t.tss_id=50
           LIMIT 1`,
    values,
    query_timeout: 5000
  });
  return resultado.rows[0];
}

async function consultarTokenLegado(pool, tarefa) {
  const resultado = await pool.query({
    text: `SELECT tsk_accesstoken AS token FROM u45468.dbout_task
           WHERE tsk_id=$1 AND tss_id=50
             AND NULLIF(BTRIM(tsk_accesstoken::text),'') IS NOT NULL LIMIT 1`,
    values: [tarefa],
    query_timeout: 5000
  });
  return resultado.rows[0]?.token;
}

function origemPermitida(url, relatorio) {
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
  if (url.origin === relatorio.origin) return true;
  const hosts = String(process.env.UMOV_REPORT_IMAGE_HOSTS || '').toLowerCase().split(',').map(host => host.trim());
  return url.hostname === 'umov.me' || url.hostname.endsWith('.umov.me') || hosts.includes(url.hostname);
}

function fotoPermitida(src, base, relatorio) {
  if (!src || NAO_FOTO.test(src.slice(0, 160))) return null;
  if (/^data:image\/(?:jpeg|png|webp|gif);base64,[a-z\d+/]+={0,2}$/i.test(src)) {
    return src.length >= 3336 && src.length <= 2400000 ? src : null;
  }
  try {
    const url = new URL(src, base);
    if (!origemPermitida(url, relatorio) || NAO_FOTO.test(url.pathname) || /\.svgz?$/i.test(url.pathname)) return null;
    return url.href;
  } catch {
    return null;
  }
}

function extrairFontesHtml(html, relatorio) {
  const document = parseDocument(html);
  const elementos = [];
  let base = relatorio;
  let temBase = false;
  const pilha = document.children.slice().reverse();
  while (pilha.length) {
    const node = pilha.pop();
    const attrs = node.attribs || {};
    if (node.name === 'base' && !temBase && attrs.href) {
      temBase = true;
      try { base = new URL(attrs.href, relatorio); } catch { /* mantém a URL do relatório */ }
    }
    if (node.name === 'template' || node.name === 'noscript' || attrs.hidden !== undefined ||
        /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)\s*(?:!important\s*)?(?:;|$)/i.test(attrs.style || '')) continue;
    if (node.name === 'img') elementos.push(attrs);
    for (let i = (node.children?.length || 0) - 1; i >= 0; i--) pilha.push(node.children[i]);
  }

  const fotos = [];
  for (const attrs of elementos) {
    const width = /^\d+(?:px)?$/i.test(attrs.width) ? Number.parseInt(attrs.width, 10) : null;
    const height = /^\d+(?:px)?$/i.test(attrs.height) ? Number.parseInt(attrs.height, 10) : null;
    if ((width !== null && width < 90) || (height !== null && height < 70)) continue;
    const candidatos = [attrs['data-src'], attrs['data-original'], attrs['data-lazy-src'], attrs.src]
      .map(src => src?.trim()).filter(src => src && !NAO_FOTO.test(src.slice(0, 160)));
    if (!candidatos.length) continue;
    const fonte = candidatos.map(src => fotoPermitida(src, base, relatorio)).find(Boolean);
    if (!fonte) {
      // O relatório pode misturar hospedagens. Evita devolver uma galeria parcial.
      if (candidatos.every(src => /\.svgz?(?:[?#]|$)/i.test(src))) continue;
      return [];
    }
    fotos.push(fonte);
  }
  return fotos;
}

async function consultarFontesFotos(link) {
  const relatorio = new URL(link);
  let url = relatorio;
  const signal = AbortSignal.timeout(3500);
  for (let i = 0; i < 3; i++) {
    const response = await fetch(url, {
      redirect: 'manual', signal,
      headers: {Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'pt-BR,pt;q=0.9'}
    });
    if ([301,302,303,307,308].includes(response.status)) {
      await response.body?.cancel();
      const location = response.headers.get('location');
      if (!location) return [];
      url = new URL(location, url);
      if (url.origin !== relatorio.origin || !origemPermitida(url, relatorio)) return [];
      continue;
    }
    const contentType = response.headers.get('content-type') || '';
    if (!response.ok || !/\b(?:text\/html|application\/xhtml\+xml)\b/i.test(contentType) ||
        Number(response.headers.get('content-length')) > MAX_HTML_BYTES || !response.body) {
      await response.body?.cancel();
      return [];
    }
    // Lê somente o HTML. As fotos seguem diretamente ao navegador.
    let size = 0;
    const chunks = [];
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > MAX_HTML_BYTES) return [];
      chunks.push(chunk);
    }
    return extrairFontesHtml(Buffer.concat(chunks, size).toString('utf8'), url);
  }
  return [];
}

module.exports = {consultarRelatorioFotos, consultarTokenLegado, consultarFontesFotos, extrairFontesHtml,
  fotoPermitida, MAX_FOTOS, TOKEN};
