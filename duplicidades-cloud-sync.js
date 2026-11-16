'use strict';
/**
 * GLOBAL SS â€” Ã­ndice de duplicidades 100% na nuvem (uMov/PostgreSQL -> Supabase).
 * Adicione ao Express: require('./duplicidades-cloud-sync').registrar(app,{pool:poolPrincipal});
 * Somente leitura no uMov. Escreve EXCLUSIVAMENTE nas duas tabelas de Ã­ndice Supabase.
 * Proibido gravar TAGs, baixar ou rejeitar SS nesta rotina.
 */
const crypto = require('node:crypto');
const {normalizarRegistro,extrairReferenciasSs,ehReclamacaoRelacionada} = require('./duplicidades-core');
const SS_RE = /^\d{2}\/\d{2}-\d{6}-\d{2}$/;
const MAX_BIGINT = '9223372036854775807';
const PAGE_SIZE = 100;
const BACKFILL_PAGES = 2;   // Curtas execuÃ§Ãµes: evita timeout em Functions.
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
    if (!response.ok) {
      const detalhe = await response.text();
      throw Error('Supabase HTTP ' + response.status +
        ' em ' + route.split('?')[0] + ': ' + detalhe.slice(0,1500));
    }
    if (response.status === 204) return null;
    const raw = await response.text();
    return raw ? JSON.parse(raw) : null;
  };
}

async function obterFaixaIndice(rest, fonte) {
  const [menor,maior] = await Promise.all([
    rest('ss_duplicidades_indice?select=tsk_id&origem=eq.'+encodeURIComponent(fonte)+'&order=tsk_id.asc&limit=1'),
    rest('ss_duplicidades_indice?select=tsk_id&origem=eq.'+encodeURIComponent(fonte)+'&order=tsk_id.desc&limit=1')
  ]);
  return {
    menor:menor?.[0]?.tsk_id == null ? null : String(menor[0].tsk_id),
    maior:maior?.[0]?.tsk_id == null ? null : String(maior[0].tsk_id)
  };
}

async function obterCampos(db, schema) {
  const q = await db.query({
    text: `SELECT cfd_id,cfd_integrationid
      FROM ${schema}.customfield
      WHERE cfd_table='local'
        AND cfd_integrationid IN (
          'matricula','hidrometro','solicitante','telefone',
          'informacaosolicitante','esclarecimentosolicitante',
          'reflocalizacao'
        )
        AND cfd_active='1'`,
    query_timeout:5000
  });

  return Object.fromEntries(
    q.rows.map(x => [
      String(x.cfd_integrationid).trim(),
      String(x.cfd_id).trim()
    ])
  );
}

async function extrairPagina(db, campos, where, arg, limiteInferior, schema, fonte) {
  const cond = where === 'recent'
    ? 'tsk_id > $1::bigint'
    : where === 'enrich'
      ? 'tsk_id < $1::bigint AND tsk_id >= $2::bigint'
      : where === 'latest' ? 'TRUE' : 'tsk_id < $1::bigint';

  const sort = where === 'recent' ? 'ASC' : 'DESC';
  const params = where === 'latest'
    ? [PAGE_SIZE]
    : where === 'enrich' ? [arg,limiteInferior,PAGE_SIZE] : [arg,PAGE_SIZE];
  const limite = where === 'latest' ? '$1' : where === 'enrich' ? '$3' : '$2';

  const q = await db.query({
    text: `WITH pagina AS MATERIALIZED (
        SELECT tsk_id,loc_id,tty_id,tsk_situation,tsk_insertdatehour
        FROM ${schema}.task
        WHERE ${cond}
        ORDER BY tsk_id ${sort}
        LIMIT ${limite}
      )
      SELECT
        p.tsk_id,
        p.loc_id,
        p.tsk_situation AS situacao,
        p.tsk_insertdatehour AS registro_em,
        l.loc_integrationid AS ss,
        l.loc_city AS cidade,
        l.loc_neighborhood AS bairro,
        l.loc_street AS logradouro,
        l.loc_streetnumber AS numero,
        l.loc_streetnumbercompl AS complemento,
        tt.tty_description AS servico
      FROM pagina p
      LEFT JOIN ${schema}.local l ON l.loc_id=p.loc_id
      LEFT JOIN ${schema}.tasktype tt ON tt.tty_id=p.tty_id
      ORDER BY p.tsk_id ${sort}`,
    values:params,
    query_timeout:9000
  });

  const rows = q.rows;

  if (!rows.length) {
    return {rows,indices:[],relacoes:[]};
  }

  const ids = [
    ...new Set(rows.map(r=>r.loc_id).filter(Boolean).map(String))
  ];

  let extras = [];
  const cfIds = Object.values(campos).filter(Boolean);

  if (ids.length && cfIds.length) {
    const fields = await db.query({
      text: `SELECT
          cfv_registerid AS loc_id,
          cfd_id,
          cfv_internalvalue AS valor
        FROM ${schema}.customfieldvalue
        WHERE cfv_registerid=ANY($1::bigint[])
          AND cfd_id=ANY($2::bpchar[])`,
      values:[ids,cfIds],
      query_timeout:9000
    });

    extras = fields.rows;
  }

  const destinos = {
    matricula:'matricula',
    hidrometro:'hidrometro',
    solicitante:'solicitante',
    telefone:'telefone',
    informacaosolicitante:'informacao_solicitante',
    esclarecimentosolicitante:'esclarecimento_solicitante',
    reflocalizacao:'referencia_localizacao'
  };

  const porLocal = new Map();

  for (const x of extras) {
    const id = String(x.loc_id);
    const dados = porLocal.get(id) || {};

    for (const [integracao,destino] of Object.entries(destinos)) {
      if (String(x.cfd_id).trim() === campos[integracao]) {
        dados[destino] = x.valor;
        break;
      }
    }

    porLocal.set(id,dados);
  }

  const indices = rows
    .filter(x=>x.loc_id != null && SS_RE.test(String(x.ss||'')))
    .map(x=>normalizarRegistro({
      ...x,
      ...(porLocal.get(String(x.loc_id)) || {}),
      origem: fonte
    }));

  // Identifica reclamaÃ§Ãµes que citam SS anteriores.
  const relacoes = await resolverRelacoes(db,indices,schema,fonte);

  return {rows,indices,relacoes};
}
async function resolverRelacoes(db, items, schema, fonte) {
  const candidatos = [];

  for (const item of items) {
    const textoEvidencia = [
      item.informacao_solicitante,
      item.esclarecimento_solicitante
    ].filter(Boolean).join(' ');

    const referencias = extrairReferenciasSs(textoEvidencia);

    if (!referencias.length ||
        !ehReclamacaoRelacionada(textoEvidencia)) continue;

    for (const ss of referencias) {
      if (ss !== item.ss) {
        candidatos.push({item,ss,textoEvidencia});
      }
    }
  }

  if (!candidatos.length) return [];

  const ssOriginais = [...new Set(candidatos.map(x=>x.ss))];

  // Consulta somente leitura no PostgreSQL do uMov.
  const q = await db.query({
    text:`SELECT DISTINCT ON (l.loc_integrationid)
        l.loc_integrationid AS ss,
        t.tsk_id
      FROM ${schema}.local l
      JOIN ${schema}.task t ON t.loc_id=l.loc_id
      WHERE l.loc_integrationid::text=ANY($1::text[])
      ORDER BY l.loc_integrationid,t.tsk_id DESC`,
    values:[ssOriginais],
    query_timeout:9000
  });

  const origens = new Map(
    q.rows.map(x=>[String(x.ss).trim(),String(x.tsk_id)])
  );

  const resultado = [];

  for (const c of candidatos) {
    const tskOrigem = origens.get(c.ss);
    if (!tskOrigem) continue;

    resultado.push({
      fonte_origem:fonte,
      fonte_relacionada:fonte,
      ss_origem:c.ss,
      tsk_origem:tskOrigem,
      ss_relacionada:c.item.ss,
      tsk_relacionada:c.item.tsk_id,
      tipo_relacao:'reclamacao_relacionada',
      protocolo_referenciado:c.item.protocolo_referenciado,
      evidencia:c.textoEvidencia.slice(0,2000),
      confianca:0.95,
      origem_automatica:true,
      revisado_operador:false
    });
  }

  return resultado;
}

async function gravarRelacoes(rest, items) {
  if (!items || !items.length) return;

  for(let i=0;i<items.length;i+=75) {
    await rest(
      'ss_duplicidades_relacoes?on_conflict=fonte_origem,tsk_origem,fonte_relacionada,tsk_relacionada,tipo_relacao',
      {
        method:'POST',
        body:items.slice(i,i+75),
        upsert:true
      }
    );
  }
}

async function gravarIndiceEmLotes(rest, items) {
  if (!Array.isArray(items) || !items.length) return;

  const grupos = new Map();

  for (const item of items) {
    const entradas = Object.entries(item)
      .sort(([a], [b]) => a.localeCompare(b));

    const assinatura = entradas.map(([chave]) => chave).join('|');

    if (!grupos.has(assinatura)) grupos.set(assinatura, []);

    grupos.get(assinatura).push(Object.fromEntries(entradas));
  }

  for (const grupo of grupos.values()) {
    for (let i = 0; i < grupo.length; i += 75) {
      await rest('ss_duplicidades_indice?on_conflict=origem,tsk_id', {
        method: 'POST',
        body: grupo.slice(i, i + 75),
        upsert: true
      });
    }
  }
}

async function gravarIndice(rest, items) {
  return gravarIndiceEmLotes(rest, items);
}

async function gravarIndiceEnriquecido(rest, items) {
  if (!items || !items.length) return;

  const preservados = items.map(item => Object.fromEntries(
    Object.entries(item).filter(([chave, valor]) =>
      valor !== null &&
      valor !== undefined &&
      !(typeof valor === 'string' && valor.trim() === '')
    )
  ));

  return gravarIndiceEmLotes(rest, preservados);
}
async function sincronizar({pool,rest,fonte="umov",schema="u45468",lockB=LOCK_B}) {
  const db=await pool.connect();
  let locked=false;
  const inicio=Date.now();
  let paginas=0, tarefas=0, indexadas=0, novos=0, historicas=0, atualizadas=0;
  let paginasEnriquecimento=0, enriquecidos=0;
  try {
    const l=await db.query({text:'SELECT pg_try_advisory_lock($1::int,$2::int) AS obtido',values:[LOCK_A,lockB]});
    locked=!!l.rows[0]?.obtido;
    if (!locked) return {ok:true,em_execucao:true,mensagem:'Outra sincronizaÃ§Ã£o jÃ¡ estÃ¡ ativa.'};
    const estado=(await rest('ss_duplicidades_controle?select=*&fonte=eq.'+encodeURIComponent(fonte)+'&limit=1'))?.[0]||{
      fonte,ultimo_id_processado:null,maior_id_capturado:null,
      varredura_concluida:false,total_lidos:0,
      ultimo_id_enriquecimento:null,limite_id_enriquecimento:null,
      enriquecimento_concluido:false,total_enriquecidos:0
    };
    const campos=await obterCampos(db,schema);
    const persistir=async()=>{
      estado.atualizado_em=new Date().toISOString();
      estado.ultimo_erro=null;
      await rest('ss_duplicidades_controle?on_conflict=fonte',{method:'POST',body:estado,upsert:true});
    };
    // Congela a faixa de IDs que jÃ¡ existe no Ã­ndice Supabase. Isso cobre
    // inclusive registros antigos que nÃ£o estejam refletidos no contador/cursor
    // do backfill principal. A rotina nÃ£o altera os checkpoints da varredura.
    if (!estado.enriquecimento_concluido &&
        estado.limite_id_enriquecimento == null &&
        estado.ultimo_id_enriquecimento == null) {
      const faixa=await obterFaixaIndice(rest,fonte);
      if (faixa.menor != null && faixa.maior != null) {
        const maior=BigInt(faixa.maior);
        if (maior >= BigInt(MAX_BIGINT)) throw Error('ID mÃ¡ximo do Ã­ndice excede o limite seguro para iniciar enriquecimento.');
        estado.limite_id_enriquecimento=faixa.menor;
        estado.ultimo_id_enriquecimento=String(maior+1n);
        estado.total_enriquecidos=Number(estado.total_enriquecidos||0);
      } else {
        estado.enriquecimento_concluido=true;
      }
      await persistir();
    }

    if (!estado.enriquecimento_concluido &&
        estado.limite_id_enriquecimento != null &&
        estado.ultimo_id_enriquecimento != null) {
      let cursor=bancoNumero(estado.ultimo_id_enriquecimento,MAX_BIGINT);
      const limiteInferior=bancoNumero(estado.limite_id_enriquecimento,1);
      for (let i=0;i<BACKFILL_PAGES;i++) {
        const pag=await extrairPagina(db,campos,'enrich',cursor,limiteInferior,schema,fonte);
        if (!pag.rows.length) {
          estado.enriquecimento_concluido=true;
          await persistir();
          break;
        }
        // Primeiro grava Ã­ndice e relaÃ§Ãµes; sÃ³ depois avanÃ§a o checkpoint.
        await gravarIndiceEnriquecido(rest,pag.indices);
        await gravarRelacoes(rest,pag.relacoes);
        cursor=String(pag.rows[pag.rows.length-1].tsk_id);
        estado.ultimo_id_enriquecimento=cursor;
        estado.total_enriquecidos=Number(estado.total_enriquecidos||0)+pag.indices.length;
        if (pag.rows.length<PAGE_SIZE) estado.enriquecimento_concluido=true;
        await persistir();
        paginasEnriquecimento++;
        enriquecidos+=pag.indices.length;
        paginas++;tarefas+=pag.rows.length;indexadas+=pag.indices.length;
        if (pag.rows.length<PAGE_SIZE) break;
      }
    }

    // Novas tarefas: ASC, sem perder registros se houver >100 inserÃ§Ãµes entre execuÃ§Ãµes.
    // Sem indexar registros anteriores ao maior_id_capturado duas vezes aqui.
    if (estado.maior_id_capturado != null) {
      const pag=await extrairPagina(db,campos,'recent',bancoNumero(estado.maior_id_capturado,1),undefined,schema,fonte);
      if (pag.rows.length) {
        await gravarIndice(rest,pag.indices);
        await gravarRelacoes(rest,pag.relacoes);
        estado.maior_id_capturado=String(pag.rows[pag.rows.length-1].tsk_id);
        await persistir();
        paginas++;tarefas+=pag.rows.length;indexadas+=pag.indices.length;novos+=pag.indices.length;
      }
    }
    // HistÃ³rico: retoma do cursor da Ãºltima execuÃ§Ã£o. NÃ£o recomeÃ§a do zero.
    if (!estado.varredura_concluida) {
      let cursor=bancoNumero(estado.ultimo_id_processado,MAX_BIGINT);
      for(let i=0;i<BACKFILL_PAGES;i++) {
        const pag=await extrairPagina(db,campos,'history',cursor,undefined,schema,fonte);
        if (!pag.rows.length) {
          estado.varredura_concluida=true;
          estado.ultimo_id_processado=cursor;
          await persistir();
          break;
        }
        // Grava primeiro, atualiza cursor depois: falhas nÃ£o causam perda de SS.
        await gravarIndice(rest,pag.indices);
        await gravarRelacoes(rest,pag.relacoes);
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
      // Atualiza estado das Ãºltimas 100 tarefas, sem varrer tabela inteira a cada 5min.
      const pag=await extrairPagina(db,campos,'latest',undefined,undefined,schema,fonte);
      if (pag.indices.length) {
        await gravarIndice(rest,pag.indices);
        await gravarRelacoes(rest,pag.relacoes);
        atualizadas+=pag.indices.length;
        paginas++;tarefas+=pag.rows.length;indexadas+=pag.indices.length;
        await persistir();
      }
    }
    return {ok:true,fonte,modo:estado.varredura_concluida?'atualizacao':'varredura_inicial',
      varredura_concluida:!!estado.varredura_concluida,
      paginas,tarefas,indexadas,novos,historicas,atualizadas,
      total_lidos:estado.total_lidos,
      ultimo_id_processado:String(estado.ultimo_id_processado||''),
      maior_id_capturado:String(estado.maior_id_capturado||''),
      enriquecimento:{
        concluido:!!estado.enriquecimento_concluido,
        paginas:paginasEnriquecimento,
        indexados_nesta_execucao:enriquecidos,
        total_enriquecidos:Number(estado.total_enriquecidos||0),
        ultimo_id_processado:String(estado.ultimo_id_enriquecimento||''),
        limite_id:String(estado.limite_id_enriquecimento||'')
      },
      duracao_ms:Date.now()-inicio};
  } finally {
    if (locked) {
      try{await db.query({text:'SELECT pg_advisory_unlock($1::int,$2::int)',values:[LOCK_A,lockB]});}catch(e){console.error('[dup-sync] falha ao liberar lock:',e.message);}
    }
    db.release();
  }
}
function registrar(app,{pool,poolLote1,schemaLote1="u46915"}) {
  if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schemaLote1))throw Error("Schema Lote 1 invalido");
  if (!pool || typeof pool.connect!=='function') throw Error('Pool PostgreSQL uMov nÃ£o configurado para sincronizaÃ§Ã£o.');
  const auth=(req,res,next)=>{
    let secret;
    try{secret=config().secret;}catch(e){return res.status(503).json({ok:false,erro:'SincronizaÃ§Ã£o nÃ£o configurada no servidor.'});}
    if (!segredoValido(req.get('Authorization')||'',secret))return res.status(401).json({ok:false,erro:'Acesso nÃ£o autorizado.'});
    next();
  };
  const selecionar=req=>{
    const lote=String(req.query.lote||'2');
    if(!['1','2'].includes(lote))throw Error('Lote invalido');
    if(lote==='1'&&!poolLote1)throw Error('Pool Lote 1 nao configurado');
    return lote==='1'?{pool:poolLote1,fonte:'umov_lote1',schema:schemaLote1,lockB:2027}:{pool,fonte:'umov',schema:'u45468',lockB:LOCK_B};
  };
  app.get('/api/duplicidades/sync/status',auth,async(req,res)=>{
    res.set('Cache-Control','no-store');
    try{
      const r=criarRest(config());
      const origem=selecionar(req);
      const status=(await r('ss_duplicidades_controle?select=fonte,ultimo_id_processado,maior_id_capturado,varredura_concluida,total_lidos,ultimo_id_enriquecimento,limite_id_enriquecimento,enriquecimento_concluido,total_enriquecidos,atualizado_em,ultimo_erro&fonte=eq.'+encodeURIComponent(origem.fonte)+'&limit=1'))?.[0]||null;
      res.json({ok:true,fonte:origem.fonte,lote:origem.fonte==='umov_lote1'?1:2,status});
    }catch(e){console.error('[dup-sync] status:',e.message);res.status(503).json({ok:false,erro:'Falha ao consultar controle da sincronizaÃ§Ã£o.'});}
  });
  app.get('/api/duplicidades/sync',auth,async(req,res)=>{
    res.set('Cache-Control','no-store');
    try{
      const r=criarRest(config());
      const saida=await sincronizar({...selecionar(req),rest:r});
      console.log('[dup-sync]',JSON.stringify(saida));
      res.json(saida);
    }catch(e){console.error('[dup-sync] erro:',e.message);
      res.status(503).json({ok:false,erro:'SincronizaÃ§Ã£o nÃ£o concluÃ­da. Consulte os logs da Vercel. O checkpoint anterior foi preservado.'});}
  });
}
module.exports={registrar,sincronizar,segredoValido,criarRest,PAGE_SIZE};
