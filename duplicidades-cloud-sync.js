'use strict';
/**
 * GLOBAL SS — índice de duplicidades 100% na nuvem (uMov/PostgreSQL -> Supabase).
 * Adicione ao Express: require('./duplicidades-cloud-sync').registrar(app,{pool:poolPrincipal});
 * Somente leitura no uMov. Escreve EXCLUSIVAMENTE nas duas tabelas de índice Supabase.
 * Proibido gravar TAGs, baixar ou rejeitar SS nesta rotina.
 */
const crypto = require('node:crypto');
const {normalizarRegistro} = require('./duplicidades-core');
const SS_RE = /^\d{2}\/\d{2}-\d{6}-\d{2}$/;
const MAX_BIGINT = '9223372036854775807';
const PAGE_SIZE = 100;
const BACKFILL_PAGES = 2;   // Curtas execuções: evita timeout em Functions.
const LOCK_A = 221029;
const LOCK_B = 2026;

function segredoValido(recebido, esperado) {
  if (typeof recebido !== 'string' || typeof esperado !== 'string' || esperado.length < 32) return false;
  const raw = recebido.startsWith('Bearer ') ? recebido.slice(7) : '';
  const a = crypto.createHash('sha256').update(raw).digest();
  const b = crypto.createHash('sha256').update(esperado).digest();
  return crypto.timingSafeEqual(a,b) && raw.length > 0;
}
function bancoNumero(v, padrao) {
  const s = String(v == null ? padrao : v);
  return /^\d+$/.test(s) && BigInt(s) > 0n && BigInt(s) <= BigInt(MAX_BIGINT) ? s : String(padrao);
}
function config() {
  const base = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = String(process.env.SUPABASE_SECRET_KEY || '');
  const secret = String(process.env.DUPLICIDADES_SYNC_SECRET || '');
  if (!/^https:\/\/[^/]+$/.test(base) || !key || secret.length < 32)
    throw Error('Configure SUPABASE_URL, SUPABASE_SECRET_KEY e DUPLICIDADES_SYNC_SECRET na Vercel.');
  return {base,key,secret};
}
function criarRest({base,key}) {
  return async function rest(route, opts={}) {
    const response = await fetch(base + '/rest/v1/' + route, {
      method:opts.method || 'GET',
      headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',
        ...(opts.upsert?{'Prefer':'resolution=merge-duplicates,return=minimal'}:{}),
        ...(opts.headers||{})},
      body:opts.body == null ? undefined : JSON.stringify(opts.body),
      signal:AbortSignal.timeout(13000)
    });
    if (!response.ok) throw Error('Supabase HTTP '+response.status+' em '+route.split('?')[0]);
    if (response.status === 204) return null;
    const raw = await response.text();
    return raw ? JSON.parse(raw) : null;
  };
}

async function obterCampos(db) {
  const q = await db.query({text:`SELECT cfd_id,cfd_integrationid FROM u45468.customfield
    WHERE cfd_table='local' AND cfd_integrationid IN ('matricula','hidrometro') AND cfd_active='1'`,query_timeout:4000});
  const campos = Object.fromEntries(q.rows.map(x=>[String(x.cfd_integrationid).trim(),String(x.cfd_id).trim()]));
  // Se campos não forem encontrados, os endereços continuam sendo indexados;
  // NUNCA inventar matrícula/hidrômetro.
  return campos;
}
async function extrairPagina(db, campos, where, arg) {
  const cond = where === 'recent' ? 'tsk_id > $1::bigint' : where === 'latest' ? 'TRUE' : 'tsk_id < $1::bigint';
  const sort = where === 'recent' ? 'ASC' : 'DESC';
  const params = where === 'latest' ? [PAGE_SIZE] : [arg,PAGE_SIZE];
  const limite = where === 'latest' ? '$1' : '$2';
  const q = await db.query({text:`WITH pagina AS MATERIALIZED (
      SELECT tsk_id,loc_id,tty_id,tsk_situation,tsk_insertdatehour
      FROM u45468.task WHERE ${cond} ORDER BY tsk_id ${sort} LIMIT ${limite}
    ) SELECT p.tsk_id,p.loc_id,p.tsk_situation AS situacao,p.tsk_insertdatehour AS registro_em,
      l.loc_integrationid AS ss,l.loc_city AS cidade,l.loc_neighborhood AS bairro,
      l.loc_street AS logradouro,l.loc_streetnumber AS numero,l.loc_streetnumbercompl AS complemento,
      tt.tty_description AS servico
    FROM pagina p LEFT JOIN u45468.local l ON l.loc_id=p.loc_id
    LEFT JOIN u45468.tasktype tt ON tt.tty_id=p.tty_id ORDER BY p.tsk_id ${sort}`,
    values:params,query_timeout:9000});
  const rows=q.rows;
  if (!rows.length) return {rows,indices:[]};
  const ids = [...new Set(rows.map(r=>r.loc_id).filter(Boolean).map(String))];
  let extras=[];
  if (ids.length && (campos.matricula || campos.hidrometro)) {
    const cfIds=[campos.matricula,campos.hidrometro].filter(Boolean);
    const fields = await db.query({text:`SELECT cfv_registerid AS loc_id,cfd_id,cfv_internalvalue AS valor
      FROM u45468.customfieldvalue
      WHERE cfv_registerid=ANY($1::bigint[]) AND cfd_id=ANY($2::bpchar[])`,
      values:[ids,cfIds],query_timeout:9000});
    extras=fields.rows;
  }
  const porLocal=new Map();
  for(const x of extras) {
    const id=String(x.loc_id),dados=porLocal.get(id)||{};
    if(String(x.cfd_id).trim()===campos.matricula)dados.matricula=x.valor;
    if(String(x.cfd_id).trim()===campos.hidrometro)dados.hidrometro=x.valor;
    porLocal.set(id,dados);
  }
  const indices = rows.filter(x=>x.loc_id != null && SS_RE.test(String(x.ss||'')))
    .map(x=>normalizarRegistro({...x,...(porLocal.get(String(x.loc_id))||{})}));
  return {rows,indices};
}
async function gravarIndice(rest, items) {
  for(let i=0;i<items.length;i+=75)
    await rest('ss_duplicidades_indice?on_conflict=tsk_id',{
      method:'POST',body:items.slice(i,i+75),upsert:true
    });
}

async function sincronizar({pool,rest}) {
  const db=await pool.connect();
  let locked=false;
  const inicio=Date.now();
  let paginas=0, tarefas=0, indexadas=0, novos=0, historicas=0, atualizadas=0;
  try {
    const l=await db.query({text:'SELECT pg_try_advisory_lock($1::int,$2::int) AS obtido',values:[LOCK_A,LOCK_B]});
    locked=!!l.rows[0]?.obtido;
    if (!locked) return {ok:true,em_execucao:true,mensagem:'Outra sincronização já está ativa.'};
    const estado=(await rest('ss_duplicidades_controle?select=*&fonte=eq.umov&limit=1'))?.[0]||{
      fonte:'umov',ultimo_id_processado:null,maior_id_capturado:null,
      varredura_concluida:false,total_lidos:0
    };
    const campos=await obterCampos(db);
    const persistir=async()=>{
      estado.atualizado_em=new Date().toISOString();
      estado.ultimo_erro=null;
      await rest('ss_duplicidades_controle?on_conflict=fonte',{method:'POST',body:estado,upsert:true});
    };
    // Novas tarefas: ASC, sem perder registros se houver >100 inserções entre execuções.
    // Sem indexar registros anteriores ao maior_id_capturado duas vezes aqui.
    if (estado.maior_id_capturado != null) {
      const pag=await extrairPagina(db,campos,'recent',bancoNumero(estado.maior_id_capturado,1));
      if (pag.rows.length) {
        await gravarIndice(rest,pag.indices);
        estado.maior_id_capturado=String(pag.rows[pag.rows.length-1].tsk_id);
        await persistir();
        paginas++;tarefas+=pag.rows.length;indexadas+=pag.indices.length;novos+=pag.indices.length;
      }
    }
    // Histórico: retoma do cursor da última execução. Não recomeça do zero.
    if (!estado.varredura_concluida) {
      let cursor=bancoNumero(estado.ultimo_id_processado,MAX_BIGINT);
      for(let i=0;i<BACKFILL_PAGES;i++) {
        const pag=await extrairPagina(db,campos,'history',cursor);
        if (!pag.rows.length) {
          estado.varredura_concluida=true;
          estado.ultimo_id_processado=cursor;
          await persistir();
          break;
        }
        // Grava primeiro, atualiza cursor depois: falhas não causam perda de SS.
        await gravarIndice(rest,pag.indices);
        cursor=String(pag.rows[pag.rows.length-1].tsk_id);
        estado.ultimo_id_processado=cursor;
        estado.total_lidos=Number(estado.total_lidos||0)+pag.rows.length;
        if (estado.maior_id_capturado == null) estado.maior_id_capturado=String(pag.rows[0].tsk_id);
        if (pag.rows.length<PAGE_SIZE) estado.varredura_concluida=true;
        await persistir();
        paginas++;tarefas+=pag.rows.length;indexadas+=pag.indices.length;historicas+=pag.indices.length;
        if (pag.rows.length<PAGE_SIZE) break;
      }
    } else if (novos===0) {
      // Atualiza estado das últimas 100 tarefas, sem varrer tabela inteira a cada 5min.
      const pag=await extrairPagina(db,campos,'latest');
      if (pag.indices.length) {
        await gravarIndice(rest,pag.indices);
        atualizadas+=pag.indices.length;
        paginas++;tarefas+=pag.rows.length;indexadas+=pag.indices.length;
        await persistir();
      }
    }
    return {ok:true,modo:estado.varredura_concluida?'atualizacao':'varredura_inicial',
      varredura_concluida:!!estado.varredura_concluida,
      paginas,tarefas,indexadas,novos,historicas,atualizadas,
      total_lidos:estado.total_lidos,
      ultimo_id_processado:String(estado.ultimo_id_processado||''),
      maior_id_capturado:String(estado.maior_id_capturado||''),
      duracao_ms:Date.now()-inicio};
  } finally {
    if (locked) {
      try{await db.query({text:'SELECT pg_advisory_unlock($1::int,$2::int)',values:[LOCK_A,LOCK_B]});}catch(e){console.error('[dup-sync] falha ao liberar lock:',e.message);}
    }
    db.release();
  }
}
function registrar(app,{pool}) {
  if (!pool || typeof pool.connect!=='function') throw Error('Pool PostgreSQL uMov não configurado para sincronização.');
  const auth=(req,res,next)=>{
    let secret;
    try{secret=config().secret;}catch(e){return res.status(503).json({ok:false,erro:'Sincronização não configurada no servidor.'});}
    if (!segredoValido(req.get('Authorization')||'',secret))return res.status(401).json({ok:false,erro:'Acesso não autorizado.'});
    next();
  };
  app.get('/api/duplicidades/sync/status',auth,async(req,res)=>{
    res.set('Cache-Control','no-store');
    try{
      const r=criarRest(config());
      const status=(await r('ss_duplicidades_controle?select=fonte,ultimo_id_processado,maior_id_capturado,varredura_concluida,total_lidos,atualizado_em,ultimo_erro&fonte=eq.umov&limit=1'))?.[0]||null;
      res.json({ok:true,status});
    }catch(e){console.error('[dup-sync] status:',e.message);res.status(503).json({ok:false,erro:'Falha ao consultar controle da sincronização.'});}
  });
  app.get('/api/duplicidades/sync',auth,async(req,res)=>{
    res.set('Cache-Control','no-store');
    try{
      const r=criarRest(config());
      const saida=await sincronizar({pool,rest:r});
      console.log('[dup-sync]',JSON.stringify(saida));
      res.json(saida);
    }catch(e){console.error('[dup-sync] erro:',e.message);
      res.status(503).json({ok:false,erro:'Sincronização não concluída. Consulte os logs da Vercel. O checkpoint anterior foi preservado.'});}
  });
}
module.exports={registrar,sincronizar,segredoValido,criarRest,PAGE_SIZE};
