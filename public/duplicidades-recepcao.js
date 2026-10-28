/* Global SS | Recepção | Análise de Duplicidade — layout alinhado ao sistema.
   Consulta SOMENTE os registros carregados na Recepção. Não altera SS.
   Pontuação de critérios: 65 hidrômetro, 25 endereço normalizado, 10 serviço.
*/
(() => {
  'use strict';
  if (document.getElementById('dupModal')) return;
  const $ = id => document.getElementById(id);
  const norm = v => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/\b(RUA|AVENIDA|AV|R|Nº|NUMERO)\b/g, ' ')
    .replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const safe = v => String(v ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
  const value = (x, fields) => {
    for (const key of fields) if (x && x[key] !== null && x[key] !== undefined && String(x[key]).trim()) return x[key];
    return '';
  };
  const hyd = x => value(x, ['hidrometro','hidrometro_numero','matricula']);
  const addr = x => norm([x?.logradouro, x?.bairro, x?.cidade].join(' '));
  const serv = x => value(x, ['servico','tipo_servico','servico_solicitado']);
  const status = x => value(x, ['situacao_campo','situacao','status']) || 'Não informado';
  const chipStatus = v => {
    const s = norm(v);
    if (s.includes('CAMPO')) return 'field';
    if (s.includes('PROGRAM')) return 'scheduled';
    if (s.includes('ENCERR') || s.includes('BAIXAD') || s.includes('EXECUT')) return 'done';
    if (s.includes('REJEIT')) return 'rejected';
    return 'neutral';
  };
  const level = score => score >= 65 ? 'high' : score >= 35 ? 'medium' : 'low';
  const levelText = l => l === 'high' ? 'Alto' : l === 'medium' ? 'Médio' : l === 'low' ? 'Baixo' : 'Sem indícios';

  const css = document.createElement('style');
  css.id = 'dupGlobalStyles';
  css.textContent = `
    #dupModal { position:fixed;inset:0;z-index:99999;display:none;align-items:center;justify-content:center;padding:16px;background:rgba(8,29,52,.72);backdrop-filter:blur(2px); }
    #dupModal.open {display:flex}
    #dupBox {width:min(880px,96vw);max-height:min(90vh,900px);overflow:auto;background:#fff;border:1px solid #cbddeb;border-radius:12px;box-shadow:0 20px 65px rgba(0,26,49,.35);font:12px Arial, sans-serif;color:#143b62;padding:0;}
    #dupBox * {box-sizing:border-box}
    #dupBox .dupHeader {display:flex;justify-content:space-between;align-items:center;gap:15px;padding:16px 20px;background:linear-gradient(115deg,#07599a,#0b6eb7);color:white}
    #dupBox h2 {margin:0;color:#fff;font-size:18px;font-weight:750;letter-spacing:.1px}
    #dupBox .dupSubtitle {font-size:11px;color:#d9efff;margin:5px 0 0}
    #dupBox .dupClose {font-size:19px;line-height:1;color:white;border:1px solid #ffffff65;background:#ffffff16;border-radius:6px;cursor:pointer;padding:7px 11px}
    #dupBox .dupClose:hover {background:#ffffff32}
    #dupBox .dupBody {padding:18px 20px 20px}
    #dupBox .dupSummary {display:grid;grid-template-columns:1.15fr .85fr;gap:12px;margin-bottom:17px}
    #dupBox .dupSumCard {border:1px solid #dce8f2;border-radius:9px;padding:14px 15px;display:flex;align-items:center;gap:12px;background:#f4f8fc;min-width:0}
    #dupBox .dupSumCard.risk {background:#fff5f3;border-color:#f7dcda}
    #dupBox .dupSumCard.ok {background:#effaf5;border-color:#cceada}
    #dupBox .dupIcon {width:37px;height:37px;flex:0 0 37px;display:grid;place-items:center;border-radius:9px;background:#e0effc;color:#0761aa;font-size:19px;font-weight:700}
    #dupBox .dupSumCard.risk .dupIcon {background:#ffe3e0;color:#c73c37}
    #dupBox .dupSumCard.ok .dupIcon {background:#ddf5e8;color:#168652}
    #dupBox .dupMeta {font-size:11px;color:#627d96;font-weight:600;margin-bottom:5px}
    #dupBox .dupMainVal {font-size:17px;color:#153d6a;font-weight:800;overflow-wrap:anywhere}
    #dupBox .dupRisk.high {color:#cf3333} #dupBox .dupRisk.medium {color:#b4740d} #dupBox .dupRisk.low {color:#0b78b4} #dupBox .dupRisk.none {color:#177c50}
    #dupBox .dupSectionHead {display:flex;justify-content:space-between;align-items:center;gap:10px;margin:0 0 9px}
    #dupBox .dupSectionHead h3 {margin:0;font-size:13px;color:#07599a;font-weight:800}
    #dupBox .dupCount {display:inline-flex;padding:3px 8px;background:#e7f3fe;color:#0765b1;border-radius:99px;font-size:11px;font-weight:800}
    #dupBox .dupTableArea {border:1px solid #dfe8f1;border-radius:8px;overflow-x:auto;margin-bottom:15px}
    #dupBox .dupTable {width:100%;min-width:660px;table-layout:auto;border-collapse:collapse;margin:0}
    #dupBox .dupTable thead th {position:static;background:#eaf3fb;color:#284f76;border-right:0;border-bottom:1px solid #d9e8f4;padding:10px 11px;text-align:left;font-size:11px;white-space:nowrap;cursor:default}
    #dupBox .dupTable tbody tr:hover {background:#f6fbff}
    #dupBox .dupTable td {border-right:0;border-bottom:1px solid #e7eef4;padding:11px;white-space:normal;overflow:visible;text-overflow:clip;font-size:11px;vertical-align:middle}
    #dupBox .dupTable tbody tr:last-child td {border-bottom:0}
    #dupBox .dupSS {font-weight:800;color:#07599a;white-space:nowrap}
    #dupBox .dupBadge {display:inline-block;border-radius:5px;padding:4px 7px;font-size:10px;font-weight:800;white-space:nowrap}
    #dupBox .dupBadge.field {background:#dbf3e7;color:#087b4e}
    #dupBox .dupBadge.scheduled {background:#e1edfd;color:#1c67ab}
    #dupBox .dupBadge.done {background:#e1f2e9;color:#147b56}
    #dupBox .dupBadge.rejected {background:#ffe8e8;color:#b93438}
    #dupBox .dupBadge.neutral {background:#eef1f5;color:#587086}
    #dupBox .dupBadge.high {background:#ffe4e4;color:#c63436}
    #dupBox .dupBadge.medium {background:#fff0d9;color:#a66a08}
    #dupBox .dupBadge.low {background:#e8f3ff;color:#0e73b7}
    #dupBox .dupCriteria {border:1px solid #d7e8f7;border-radius:9px;padding:14px 15px;background:#f0f7fe}
    #dupBox .dupCriteria h3 {margin:0 0 10px;font-size:12px;color:#07599a}
    #dupBox .dupCriteriaGrid {display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}
    #dupBox .dupCriterion {background:white;border:1px solid #dbe8f5;border-radius:7px;padding:9px 10px;display:flex;justify-content:space-between;gap:6px;align-items:center;font-size:11px}
    #dupBox .dupPoints {font-weight:800;color:#0b6eb7;white-space:nowrap}
    #dupBox .dupInfo {padding:10px 12px;margin-top:11px;border-radius:7px;background:#f5f8fb;border-left:3px solid #328ad4;color:#496984;font-size:11px;line-height:1.55}
    #dupBox .dupEmpty {padding:22px 15px;text-align:center;color:#52738f;font-size:12px}
    #dupBox .dupFooter {display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:15px}
    #dupBox .dupFootText {color:#71869b;font-size:10px;max-width:530px;line-height:1.5}
    #dupBox .dupAction {background:#0879f7;color:white;border:1px solid #0879f7;border-radius:6px;padding:9px 18px;font-size:12px;font-weight:700;cursor:pointer}
    #dupBox .dupAction:hover {background:#07599a}
    @media(max-width:600px) {#dupBox .dupHeader{padding:13px}#dupBox .dupBody{padding:13px}#dupBox .dupSummary{grid-template-columns:1fr}#dupBox .dupCriteriaGrid{grid-template-columns:1fr}#dupBox h2{font-size:15px}}
  `;
  document.head.append(css);

  const modal = document.createElement('div');
  modal.id = 'dupModal';
  modal.innerHTML = `<div id="dupBox" role="dialog" aria-modal="true" aria-labelledby="dupTitle" tabindex="-1">
    <div class="dupHeader"><div><h2 id="dupTitle">Análise de Duplicidade</h2>
    <p class="dupSubtitle">Recepção · Comparação preventiva de solicitações de serviço</p></div>
    <button class="dupClose" id="dupClose" type="button" aria-label="Fechar janela">×</button></div>
    <div id="dupContent" class="dupBody"></div></div>`;
  document.body.append(modal);
  let previousFocus = null;
  function close() {
    modal.classList.remove('open');
    if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
  }
  $('dupClose').addEventListener('click', close);
  modal.addEventListener('click', e => {if (e.target === modal) close();});
  document.addEventListener('keydown', e => {if (e.key === 'Escape' && modal.classList.contains('open')) close();});

  function run() {
    if (typeof currentScreen === 'undefined' || currentScreen !== 'recepcao') {
      alert('Disponível somente na Recepção.'); return;
    }
    const items = typeof selected !== 'undefined' && selected ? Object.values(selected) : [];
    if (items.length !== 1) { alert('Selecione exatamente uma SS na Recepção.'); return; }
    const ss = items[0];
    const rows = typeof raw !== 'undefined' && Array.isArray(raw) ? raw : [];
    const key = norm(ss.ss);
    const baseHyd = norm(hyd(ss));
    const baseAddr = addr(ss);
    const baseServ = norm(serv(ss));
    const candidates = rows.filter(r => norm(r.ss) !== key).map(r => {
      const h = Boolean(baseHyd && baseHyd === norm(hyd(r)));
      const a = Boolean(baseAddr && baseAddr === addr(r));
      const t = Boolean(baseServ && baseServ === norm(serv(r)));
      const score = (h ? 65 : 0) + (a ? 25 : 0) + (t ? 10 : 0);
      return { r, score, reasons: [h ? 'Mesmo hidrômetro' : null, a ? 'Mesmo endereço' : null, t ? 'Mesmo tipo de serviço' : null].filter(Boolean) };
    }).filter(x => x.score >= 25).sort((a,b) => b.score - a.score);
    const highest = candidates.length ? candidates[0].score : 0;
    const risk = candidates.length ? level(highest) : 'none';

    const rowsHTML = candidates.map(x => {
      const st = status(x.r);
      return `<tr>
        <td><span class="dupSS">${safe(x.r.ss)}</span></td>
        <td><span class="dupBadge ${chipStatus(st)}">${safe(st)}</span></td>
        <td>${safe(hyd(x.r) || '—')}</td>
        <td><span class="dupBadge ${level(x.score)}">${x.score} pts</span></td>
        <td>${safe(serv(x.r) || '—')}<div style="font-size:10px;color:#71869b;margin-top:3px">${safe(x.reasons.join(' · '))}</div></td>
      </tr>`;
    }).join('');

    $('dupContent').innerHTML = `
      <div class="dupSummary">
        <div class="dupSumCard"><div class="dupIcon" aria-hidden="true">▣</div>
          <div><div class="dupMeta">SS consultada</div><div class="dupMainVal">${safe(ss.ss || '—')}</div></div></div>
        <div class="dupSumCard ${risk === 'none' ? 'ok' : 'risk'}"><div class="dupIcon" aria-hidden="true">${risk === 'none' ? '✓' : '!'}</div>
          <div><div class="dupMeta">Risco de duplicidade · pontuação</div>
          <div class="dupMainVal dupRisk ${risk}">${levelText(risk)}${candidates.length ? ` · ${highest} pts` : ''}</div></div></div>
      </div>
      <div class="dupSectionHead"><h3>Possíveis duplicadas <span class="dupCount">${candidates.length}</span></h3>
        <span style="font-size:10px;color:#71869b">${rows.length} SS carregadas nesta consulta</span></div>
      <div class="dupTableArea">${candidates.length ? `<table class="dupTable"><thead><tr>
        <th>SS</th><th>Situação</th><th>Hidrômetro</th><th>Pontuação</th><th>Tipo de serviço</th>
        </tr></thead><tbody>${rowsHTML}</tbody></table>` :
        '<div class="dupEmpty">Nenhuma correspondência encontrada entre as SS carregadas nesta página.</div>'}</div>
      <div class="dupCriteria"><h3>ⓘ &nbsp; Critérios de comparação</h3>
        <div class="dupCriteriaGrid">
          <div class="dupCriterion"><span>Mesmo hidrômetro</span><span class="dupPoints">65 pts</span></div>
          <div class="dupCriterion"><span>Mesmo endereço normalizado</span><span class="dupPoints">25 pts</span></div>
          <div class="dupCriterion"><span>Mesmo tipo de serviço</span><span class="dupPoints">10 pts</span></div>
        </div>
        <div class="dupInfo"><strong>Escopo da análise:</strong> apenas as ${rows.length} SS carregadas na página da Recepção.
         Não pesquisa outras páginas, histórico completo ou GIS. A pontuação indica critérios coincidentes,
         não é probabilidade estatística. A conferência final é feita pelo operador.</div>
      </div>
      <div class="dupFooter"><div class="dupFootText">Consulta informativa. Não rejeita, tramita, encerra nem modifica SS.</div>
        <button class="dupAction" type="button" id="dupOk">Concluir análise</button></div>`;
    $('dupOk').addEventListener('click', close);
    previousFocus = document.activeElement;
    modal.classList.add('open');
    $('dupClose').focus();
  }

  let btn = $('dupCheckBtn');
  if (!btn) {
    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'action';
    btn.id = 'dupCheckBtn';
    btn.innerHTML = '<b>▣</b>Verificar Duplicidades';
    const anchor = $('receptionVerifySiscomBtn');
    if (!anchor) { console.warn('[Duplicidades] Referência da Recepção não encontrada.'); return; }
    anchor.insertAdjacentElement('afterend', btn);
  }
  btn.onclick = run;
  const update = () => {btn.hidden = typeof currentScreen === 'undefined' || currentScreen !== 'recepcao';};
  update();
  document.querySelectorAll('[data-screen]').forEach(x => x.addEventListener('click', () => setTimeout(update, 0)));
})();
