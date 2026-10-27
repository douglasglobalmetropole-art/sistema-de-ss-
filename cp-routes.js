'use strict';
const path=require('node:path');

// Modulo da Central de Operacoes. Reaproveita a instancia e o pool do GLOBAL SS.
// Backend adaptado do index.js original da Central; nenhum servidor ou pool duplicado.
module.exports=function registrarCentralOperacoes(app,pool){
  require('./cp-excel')(app,pool); // Exportacao Excel com links oficiais do uMov
  // CP_V24_MAPA_RASTREIO - fonte de rastreio protegida e independente das SS.
  require('./cp-tracking').registrar(app);
  const SUPABASE_URL=process.env.SUPABASE_URL || 'https://vzdqjinzjdzvurnsuujb.supabase.co';
  const SUPABASE_SERVICE_ROLE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';
  const cpCache=require('./cp-fast-cache').create({url:SUPABASE_URL,key:SUPABASE_SERVICE_ROLE_KEY,enabled:process.env.CP_PERSISTENT_CACHE_ENABLED!=='false'});
  const cpToday=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'});
  function supabaseHeaders(){
    const h={apikey:SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'};
    if(/^eyJ/.test(SUPABASE_SERVICE_ROLE_KEY))h.Authorization=`Bearer ${SUPABASE_SERVICE_ROLE_KEY}`;
    return h;
  }
  async function sbRequest(url,options={}){
    if(!SUPABASE_SERVICE_ROLE_KEY)throw Error('Credencial Supabase nao configurada');
    const r=await fetch(`${SUPABASE_URL}/rest/v1/${url}`,{...options,headers:{...supabaseHeaders(),Prefer:'return=representation',...(options.headers||{})}});
    if(!r.ok)throw Error('Consulta Supabase indisponivel ('+r.status+')');
    return r.json();
  }

  app.get(['/cp','/cp/'],(_req,res)=>{
    res.set('Cache-Control','no-store');
    res.sendFile(path.join(__dirname,'public','central-operacoes.html'));
  });
function equipeKey(v){
 return norm(v).replace(/\bEQUIPE\b/g,'').replace(/\s*-\s*/g,' - ').replace(/\s+/g,' ').trim()
}
function equipeNumero(v){
 const m=String(v||'').match(/(?:^|\s)(\d{2,3})(?:\s|\-|$)/);
 return m?m[1]:'';
}
async function lerVeiculos(){return await sbRequest('frotas_veiculos?select=id,placa,prefixo,tipo,status,polo,cidade,equipe_umov,funcionario_umov&order=placa.asc')}
async function mapaVeiculosFrotas(){
 const m=new Map();
 try{
   const frota=await lerVeiculos();
   for(const v of frota){
     if(String(v.status||'Ativo').toUpperCase()==='INATIVO')continue;
     const item={...v,funcionario:v.funcionario_umov||''};
     // Uma mesma placa pode atender mais de uma equipe. Cada equipe cadastrada
     // em equipe_umov (separada por |) recebe o vínculo com a mesma placa.
     const equipes=String(v.equipe_umov||'').split('|').map(x=>x.trim()).filter(Boolean);
     for(const eq of equipes){
       const k=equipeKey(eq); if(k)m.set(k,item);
       const num=equipeNumero(eq); if(num)m.set('#'+num,item);
     }
   }
 }catch(e){
   console.error('Aviso Supabase frotas_veiculos:',e.message);
   return m;
 }
 return m;
}
// A consulta das SS/KPIs vem exclusivamente do PostgreSQL uMov.
// O cadastro de Frotas tem uma única fonte oficial: Supabase public.frotas_veiculos.
// Não há fallback local/veiculos.json: inclusões, alterações e exclusões no Frotas refletem na Produtividade.



const CACHE=new Map();
const DATA_CACHE=new Map();
const DATA_CACHE_TTL=5*60*1000;

// CP_V21: consultas isoladas por IDs. Falha de um complemento não invalida a lista base.
// Não usa JOIN amplo nas tabelas de integração. Todos os números continuam parciais
// até a sincronização completa do uMov ser implementada.
async function cpLerComplementos(tarefas){
 const ids=[...new Set(tarefas.map(t=>Number(t.tsk_id)).filter(Number.isSafeInteger))];
 const locaisIds=[...new Set(tarefas.map(t=>Number(t.loc_id)).filter(Number.isSafeInteger))];
 const falhas=[];
 const consultar=async(nome,texto,values,ms)=>{
  if(!values[0]?.length)return {ok:true,rows:[]};
  try{return {ok:true,rows:(await pool.query({text:texto,values,query_timeout:ms})).rows}}
  catch(error){falhas.push(nome+': '+String(error.message||error).slice(0,120));return {ok:false,rows:[]}}
 };
 const [tarefasOut,locais,locaisOut]=await Promise.all([
  consultar('dbout_task',`SELECT tsk_id,age_id,tss_id,tsk_situation,tsk_scheduleinitialdatehour,
      tsk_realinitialdatehour,tsk_realfinaldatehour,e_situacao,e_tag
      FROM u45468.dbout_task WHERE tsk_id=ANY($1::bigint[])`,[ids],2600),
  consultar('local',`SELECT loc_id,loc_integrationid,loc_city,loc_neighborhood,loc_street,
      loc_streetnumber FROM u45468.local WHERE loc_id=ANY($1::bigint[])`,[locaisIds],2600),
  consultar('dbout_local',`SELECT loc_id,e_situacao,e_servicoexecutadosiscom,
      e_informacaoexecucaosiscom,e_userbaixasiscom,e_horariobaixasiscom,
      loc_description,e_localidade,e_bairro,e_reflocalizacao,loc_street,loc_streetnumber,
      loc_neighborhood,loc_city,loc_geoposition
      FROM u45468.dbout_local WHERE loc_id=ANY($1::bigint[])`,[locaisIds],1300)
 ]);
 const equipeIds=[...new Set([...tarefas.map(t=>Number(t.age_id)),...tarefasOut.rows.map(t=>Number(t.age_id))].filter(Number.isSafeInteger))];
 const tipoIds=[...new Set(tarefas.map(t=>Number(t.tty_id)).filter(Number.isSafeInteger))];
 const [agentes,tipos]=await Promise.all([
  consultar('agent',`SELECT age_id,age_name FROM u45468.agent WHERE age_id=ANY($1::bigint[])`,[equipeIds],1600),
  consultar('tasktype',`SELECT tty_id,tty_description FROM u45468.tasktype WHERE tty_id=ANY($1::bigint[])`,[tipoIds],1600)
 ]);
 const mapa=(rows,id)=>new Map(rows.map(r=>[String(r[id]),r]));
 return {
  dt:mapa(tarefasOut.rows,'tsk_id'),local:mapa(locais.rows,'loc_id'),
  dl:mapa(locaisOut.rows,'loc_id'),agent:mapa(agentes.rows,'age_id'),
  tipo:mapa(tipos.rows,'tty_id'),falhas,dtOk:tarefasOut.ok
 };
}

function setBounded(map,key,value,max=120){
 map.delete(key);map.set(key,value);
 while(map.size>max)map.delete(map.keys().next().value);
}

async function consultarLotes(valores,tamanho,consulta){
 const lotes=[]; for(let i=0;i<valores.length;i+=tamanho) lotes.push(valores.slice(i,i+tamanho));
 const saida=[];
 for(let i=0;i<lotes.length;i+=4) saida.push(...await Promise.all(lotes.slice(i,i+4).map(consulta)));
 return saida;
}

function norm(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim()}
function categoria(v){
 const n=norm(v);
 if(n==='BAIXADA NO SISCOM')return'BAIXADA';
 if(n==='REJEITADA')return'REJEITADA';
 if(n==='DUPLICADA')return'DUPLICADA';
 return n||'SEM SITUACAO';
}
// Reutilizar Intl.DateTimeFormat evita milhares de construcoes por consulta.
const CP_DATE_FORMATTER=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo'});
const CP_DT_FORMATTER=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
function brDate(v){if(!v)return'';const d=new Date(v);if(isNaN(d))return'';return CP_DATE_FORMATTER.format(d)}
function brDT(v){if(!v)return'';const d=new Date(v);if(isNaN(d))return'';return CP_DT_FORMATTER.format(d).replace(',','')}
function mins(a,b){if(!a||!b)return null;const m=Math.round((new Date(b)-new Date(a))/60000);return Number.isFinite(m)&&m>=0?m:null}
function hhmm(m){if(m==null)return'00:00';return `${Math.floor(m/60)}:${String(m%60).padStart(2,'0')}`}

async function buscarSituacoes(ids){
 const mapa=new Map();
 const unicos=[...new Set(ids.filter(Boolean).map(Number).filter(Number.isFinite))];
 try{
   const resultados=await consultarLotes(unicos,1500,parte=>pool.query({text:`
       SELECT loc_id,
              e_situacao AS situacao,
              e_servicoexecutadosiscom AS servico_executado_siscom,
              e_informacaoexecucaosiscom AS info_execucao_siscom,
              e_userbaixasiscom AS usuario_baixa_siscom,
              e_horariobaixasiscom AS horario_baixa_siscom,
              loc_description AS localizacao,
              e_localidade AS cidade_umov,
              e_bairro AS bairro_umov,
              e_reflocalizacao AS referencia_localizacao,
              loc_street AS logradouro_umov,
              loc_streetnumber AS numero_umov,
              loc_neighborhood AS bairro_sistema,
              loc_city AS cidade_sistema,
              loc_geoposition AS geoposicao
       FROM u45468.dbout_local
       WHERE loc_id = ANY($1::bigint[])
     `,values:[parte],query_timeout:12000}));
   for(const r of resultados) for(const x of r.rows) mapa.set(String(x.loc_id),{
       situacao:x.situacao||'',
       servico_executado_siscom:x.servico_executado_siscom||'',
       info_execucao_siscom:x.info_execucao_siscom||'',
       usuario_baixa_siscom:x.usuario_baixa_siscom||'',
       horario_baixa_siscom:x.horario_baixa_siscom||'',
       localizacao:x.localizacao||'', cidade_umov:x.cidade_umov||'',
       bairro_umov:x.bairro_umov||'',
       referencia_localizacao:x.referencia_localizacao||'',
       logradouro_umov:x.logradouro_umov||'', numero_umov:x.numero_umov||'',
       bairro_sistema:x.bairro_sistema||'', cidade_sistema:x.cidade_sistema||'',
       geoposicao:x.geoposicao||''
   });
 }catch(e){console.error('Erro consulta de situacao CP:',e.message);throw e}
 return mapa;
}


async function buscarCamposTarefa(ids){
 const mapa=new Map();
 const unicos=[...new Set(ids.filter(Boolean).map(Number).filter(Number.isFinite))];
 try{
   const resultados=await consultarLotes(unicos,1500,parte=>pool.query({
       text:`SELECT tsk_id, tss_id, tsk_situation AS situacao_campo,
                    e_tag AS tags, e_situacao AS status_integracao
             FROM u45468.dbout_task
             WHERE tsk_id = ANY($1::bigint[])`,
       values:[parte],
       query_timeout:12000
     }));
   for(const r of resultados) for(const x of r.rows) mapa.set(String(x.tsk_id),x);
 }catch(e){console.error('Erro consulta de tarefas CP:',e.message);throw e}
 return mapa;
}

app.get('/api/cp/veiculos',async(req,res)=>{try{res.json(await lerVeiculos())}catch(e){res.status(502).json({ok:false,error:'Consulta de frotas indisponivel.'})}});

app.get('/api/cp/health',async(req,res)=>{
 try{const r=await pool.query('SELECT current_database() db,now() agora');res.json({ok:true,conectado:true,cache_habilitado:cpCache.enabled,versao_cp:'V21 IDs antes dos complementos'})}
 catch(e){res.status(500).json({ok:false,error:e.message})}
});

app.get('/api/cp/ss',async(req,res)=>{
 const di=String(req.query.di||req.query.inicio||'');
 const df=String(req.query.df||req.query.fim||di);
 const valida=s=>/^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s+'T00:00:00Z')) && new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
 if(!valida(di)||!valida(df))return res.status(400).json({ok:false,error:'Datas invalidas (AAAA-MM-DD).'});
 const dias=(Date.parse(df+'T00:00:00Z')-Date.parse(di+'T00:00:00Z'))/86400000;
 if(dias<0||dias>61)return res.status(400).json({ok:false,error:'Periodo maximo de 62 dias. Reduza as datas.'});
 // Para o período padrão de dois dias, 8 mil linhas são mais que suficientes.
 // O limite anterior de 30 mil gerava centenas de consultas extras e travava.
 const pedidoLimite=Number(req.query.limite||200);
 const limite=Number.isSafeInteger(pedidoLimite)?Math.min(Math.max(pedidoLimite,1),300):200;
 const modo=String(req.query.modo||'criadas');
 if(!['criadas','movimentadas'].includes(modo))return res.status(400).json({ok:false,error:'Modo invalido.'});
 // Páginas maiores evitam dezenas de chamadas sequenciais no navegador.
 const offset=Math.min(Math.max(Number(req.query.offset||0),0),200000);
 if(!Number.isSafeInteger(offset))return res.status(400).json({ok:false,error:'Offset invalido.'});
 const chave=`v21|${modo}|${di}|${df}|${limite}|${offset}`;
 const fresh=req.query.refresh==='1';
 let etapa='cache';
 const lifeMs=df>=cpToday()?120000:900000;
 const maxStale=df>=cpToday()?48*3600000:14*86400000;
 let fallbackCache=null;
 try{
   if(!fresh){
    const cached=DATA_CACHE.get(chave);
    if(cached && (Date.now()-cached.ts)<lifeMs){
      DATA_CACHE.delete(chave);DATA_CACHE.set(chave,cached);
      res.set('X-Cache','MEMORY');
      res.set('Server-Timing','cp_memory;dur=0');
      res.set('X-CP-Truncated',cached.truncated?'1':'0');
      res.set('X-CP-Cached-At',new Date(cached.ts).toISOString());
      if(cached.truncated)res.set('X-CP-Next-Offset',String(offset+limite));
      return res.json(cached.dados);
    }
    if(cached && (Date.now()-cached.ts)<=maxStale){
      DATA_CACHE.delete(chave);DATA_CACHE.set(chave,cached);
      fallbackCache=cached;
      res.set('X-Cache','STALE-MEMORY');res.set('X-CP-Stale','1');
      res.set('X-CP-Cached-At',new Date(cached.ts).toISOString());
      res.set('X-CP-Truncated',cached.truncated?'1':'0');
      if(cached.truncated)res.set('X-CP-Next-Offset',String(offset+limite));
      return res.json(cached.dados);
    }
    const persistido=await cpCache.load('historico:'+chave,{maxAgeMs:lifeMs,maxStaleMs:maxStale,timeoutMs:700});
    if(persistido){
      fallbackCache={dados:persistido.payload.dados,truncated:persistido.payload.truncado,ts:Date.parse(persistido.at)};
      if(persistido.stale){
       setBounded(DATA_CACHE,chave,fallbackCache);
       res.set('X-Cache','STALE-PERSISTENT');res.set('X-CP-Stale','1');
       res.set('X-CP-Cached-At',persistido.at);
       res.set('X-CP-Truncated',persistido.payload.truncado?'1':'0');
       if(persistido.payload.truncado)res.set('X-CP-Next-Offset',String(offset+limite));
       return res.json(persistido.payload.dados);
      }
      if(!persistido.stale){
       setBounded(DATA_CACHE,chave,fallbackCache);
       res.set('X-Cache','PERSISTENT');
       res.set('X-CP-Cached-At',persistido.at);
       res.set('X-CP-Truncated',persistido.payload.truncado?'1':'0');
       if(persistido.payload.truncado)res.set('X-CP-Next-Offset',String(offset+limite));
       return res.json(persistido.payload.dados);
      }
    }
   }
   // Seleciona tarefas por programação, início, fim ou execução que atravessa
   // o período. A união de faixas permite que índices de cada data sejam usados.
   const sqlInicio=Date.now();
   // V20: consulta leve por origem; primeiro traz SS criadas no periodo.
   // Depois (modo movimentadas) complementa pelas movimentacoes do uMov.
   // Cada consulta pagina os IDs antes dos JOINs. Nunca soma amostras como total oficial.
   etapa='consulta-ids';
   const fonteCriadas=modo==='criadas';
   const keys=fonteCriadas?
    await pool.query({text:`SELECT tsk_id,loc_id,age_id,tty_id,tsk_insertdatehour,
        tsk_scheduleinitialdatehour,tsk_realinitialdatehour,tsk_realfinaldatehour
        FROM u45468.task WHERE tsk_insertdatehour >= $1::date
          AND tsk_insertdatehour < ($2::date + INTERVAL '1 day')
        ORDER BY tsk_insertdatehour DESC,tsk_id DESC LIMIT $3 OFFSET $4`,
      values:[di,df,limite+1,offset],query_timeout:3500}):
    await pool.query({text:`SELECT tsk_id FROM u45468.dbout_task
        WHERE tsk_lastexecutiondatehour >= $1::date
          AND tsk_lastexecutiondatehour < ($2::date + INTERVAL '1 day')
        ORDER BY tsk_lastexecutiondatehour DESC,tsk_id DESC LIMIT $3 OFFSET $4`,
      values:[di,df,limite+1,offset],query_timeout:3500});
   const truncado=keys.rows.length>limite;
   const ids=keys.rows.slice(0,limite);
   etapa='leitura-tarefas';
   const tarefas=fonteCriadas?ids:
    ids.length?(await pool.query({text:`SELECT tsk_id,loc_id,age_id,tty_id,
        tsk_insertdatehour,tsk_scheduleinitialdatehour,tsk_realinitialdatehour,
        tsk_realfinaldatehour FROM u45468.task WHERE tsk_id=ANY($1::bigint[])`,
        values:[ids.map(x=>x.tsk_id)],query_timeout:2300})).rows:[];
   etapa='complementos';
   const extra=await cpLerComplementos(tarefas);
   if(extra.falhas.length)console.warn('CP_V21 dados complementares parciais:',extra.falhas.join(' | '));
   const linhas=tarefas.map(t=>{
     const d=extra.dt.get(String(t.tsk_id))||{};
     const l=extra.local.get(String(t.loc_id))||{};
     const dl=extra.dl.get(String(t.loc_id))||{};
     const a=extra.agent.get(String(d.age_id||t.age_id))||{};
     const tt=extra.tipo.get(String(t.tty_id))||{};
     const programacao_real=d.tsk_scheduleinitialdatehour||t.tsk_scheduleinitialdatehour||null;
     const inicio_real=d.tsk_realinitialdatehour||t.tsk_realinitialdatehour||null;
     const fim_real=d.tsk_realfinaldatehour||t.tsk_realfinaldatehour||null;
     return {
       tsk_id:t.tsk_id,loc_id:t.loc_id,ss:l.loc_integrationid||'',
       cidade:l.loc_city||'',bairro:l.loc_neighborhood||'',
       logradouro:l.loc_street||'',numero:l.loc_streetnumber||'',
       tecnico:a.age_name||'',servico:tt.tty_description||'',
       programacao_real,inicio_real,fim_real,
       data_referencia:inicio_real||programacao_real||t.tsk_insertdatehour,
       t_situacao_campo:d.tsk_situation||'',t_tss_id:d.tss_id||null,
       t_tags:d.e_tag||'',t_status_integracao:d.e_situacao||'',
       s_situacao:dl.e_situacao||'',s_servico_executado_siscom:dl.e_servicoexecutadosiscom||'',
       s_info_execucao_siscom:dl.e_informacaoexecucaosiscom||'',
       s_usuario_baixa_siscom:dl.e_userbaixasiscom||'',
       s_horario_baixa_siscom:dl.e_horariobaixasiscom||'',
       s_localizacao:dl.loc_description||'',s_cidade_umov:dl.e_localidade||'',
       s_bairro_umov:dl.e_bairro||'',s_referencia_localizacao:dl.e_reflocalizacao||'',
       s_logradouro_umov:dl.loc_street||'',s_numero_umov:dl.loc_streetnumber||'',
       s_bairro_sistema:dl.loc_neighborhood||'',s_cidade_sistema:dl.loc_city||'',
       s_geoposicao:dl.loc_geoposition||''
     };
   });
   const sqlMs=Date.now()-sqlInicio;
   res.set('X-CP-Partial','1');res.set('X-CP-Version','V21');
   if(extra.falhas.length)res.set('X-CP-Enrichment-Partial','1');
   let baixadas=0,rejeitadas=0,duplicadas=0,soma=0,qtd=0;
   const dados=linhas.map(x=>{
     const s={
       situacao:x.s_situacao||'',
       servico_executado_siscom:x.s_servico_executado_siscom||'',
       info_execucao_siscom:x.s_info_execucao_siscom||'',
       usuario_baixa_siscom:x.s_usuario_baixa_siscom||'',
       horario_baixa_siscom:x.s_horario_baixa_siscom||'',
       localizacao:x.s_localizacao||'',
       cidade_umov:x.s_cidade_umov||'',
       bairro_umov:x.s_bairro_umov||'',
       referencia_localizacao:x.s_referencia_localizacao||'',
       logradouro_umov:x.s_logradouro_umov||'',
       numero_umov:x.s_numero_umov||'',
       bairro_sistema:x.s_bairro_sistema||'',
       cidade_sistema:x.s_cidade_sistema||'',
       geoposicao:x.s_geoposicao||''
     };
     const tx={
       situacao_campo:x.t_situacao_campo||'',
       tss_id:x.t_tss_id||'',
       tags:x.t_tags||'',
       status_integracao:x.t_status_integracao||''
     };
     const cat=categoria(s.situacao);
     if(cat==='BAIXADA')baixadas++;
     if(cat==='REJEITADA')rejeitadas++;
     if(cat==='DUPLICADA')duplicadas++;
     const dm=mins(x.inicio_real,x.fim_real);if(dm!=null){soma+=dm;qtd++}
     return {
       tsk_id:x.tsk_id,data:brDate(x.data_referencia),ss:x.ss||'',equipe:x.tecnico||'',tipo:'',placa:'',
       cidade:s.cidade_umov||s.cidade_sistema||x.cidade||'',
       bairro:s.bairro_umov||s.bairro_sistema||x.bairro||'',
       rua:[s.logradouro_umov||x.logradouro,s.numero_umov||x.numero].filter(Boolean).join(', '),
       localizacao:s.localizacao||'', referencia_localizacao:s.referencia_localizacao||'', geoposicao:s.geoposicao||'',

       servico:x.servico||'',macro:x.servico||'',
       situacao_campo:tx.situacao_campo||'',
       tss_id:tx.tss_id||'',
       tags:tx.tags||'',
       status_integracao:tx.status_integracao||'',
       status_siscom:s.situacao||'',
       info_execucao_siscom:s.info_execucao_siscom||'',
       usuario_baixa_siscom:s.usuario_baixa_siscom||'',
       horario_baixa_siscom:s.horario_baixa_siscom||'',
       programacao_iso:x.programacao_real||null,
       inicio_real_iso:x.inicio_real||null, fim_real_iso:x.fim_real||null,
       programacao:brDT(x.programacao_real),
       inicio:brDT(x.inicio_real),fim:brDT(x.fim_real),
       duracao:dm==null?'':hhmm(dm),
       situacao:s.situacao,
       categoria_situacao:cat,
       servico_executado_siscom:s.servico_executado_siscom
     };
   });
   const k={ok:true,total:dados.length,baixadas,rejeitadas,duplicadas,tempo_medio:hhmm(qtd?Math.round(soma/qtd):0)};
   setBounded(CACHE,chave,{...k,ts:Date.now()});
   setBounded(DATA_CACHE,chave,{dados,truncated:truncado,ts:Date.now()});
   // Persistencia permite resposta rapida mesmo em outro processo Vercel.
   // A escrita e aguardada somente quando o banco uMov ja foi consultado.
   await Promise.race([cpCache.save('historico:'+chave,{dados,truncado}),new Promise(resolve=>setTimeout(resolve,350))]);
   res.set('X-CP-Cached-At',new Date().toISOString());
   res.set('X-Cache','UMOV');
   res.set('X-CP-Source',modo);
   res.set('Server-Timing',`cp_sql;dur=${sqlMs},cp_total;dur=${Date.now()-sqlInicio}`);
   res.set('X-CP-Truncated',truncado?'1':'0');
   if(truncado)res.set('X-CP-Next-Offset',String(offset+limite));
   res.set('Cache-Control','no-store');
   res.json(dados);
 }catch(e){
   console.error('ERRO /api/cp/ss:',e.message);
   try{
    const memoria=DATA_CACHE.get(chave);
    const salvo=fallbackCache?null:Array.isArray(memoria?.dados)?null:await cpCache.load('historico:'+chave,{maxAgeMs:0,maxStaleMs:14*86400000,timeoutMs:700});
    const linhas=Array.isArray(memoria?.dados)?memoria.dados:fallbackCache?.dados||salvo?.payload?.dados;
    if(Array.isArray(linhas)){
     const trunc=memoria?.truncated??fallbackCache?.truncated??salvo?.payload?.truncado??false;
     res.set('X-Cache','STALE-ON-ERROR');res.set('X-CP-Stale','1');
     res.set('X-CP-Cached-At',new Date(memoria?.ts||fallbackCache?.ts||salvo?.at||Date.now()).toISOString());
     res.set('X-CP-Truncated',trunc?'1':'0');
     if(trunc)res.set('X-CP-Next-Offset',String(offset+limite));
     return res.json(linhas);
    }
   }catch(fallbackError){console.warn('Cache CP indisponivel:',fallbackError.message);}
   const timeout=/timeout|timed out|canceling statement/i.test(String(e.message||''));
   if(modo==='movimentadas' && timeout){
    res.set('X-CP-Partial','1');res.set('X-CP-Source','movimentadas-indisponivel');
    res.set('X-CP-Truncated','0');return res.json([]);
   }
   res.status(timeout?504:500).json({ok:false,etapa,error:timeout?'Consulta uMov excedeu tempo na etapa '+etapa+'. Verifique o indice da consulta.':'Falha na consulta ao uMov na etapa '+etapa+'.'});
 }
});



// CP_V22_PROGRAMADAS_Umov_SEM_DATA: fonte exclusiva do card Programadas.
// Sem filtro temporal: situacao oficial atual no dbout_task, com equipe vinculada.
// "Notas em campo" e "Retornadas" continuam usando as rotas anteriores.
app.get('/api/cp/programadas-status',async(req,res)=>{
  const modo=req.query.modo==='varredura'?'varredura':'situacao';
  const qtd=Number(req.query.limite||200);
  const limite=Number.isSafeInteger(qtd)?Math.max(1,Math.min(qtd,250)):200;
  const cursorRaw=String(req.query.cursor||'9223372036854775807');
  if(!/^\d{1,19}$/.test(cursorRaw))return res.status(400).json({ok:false,error:'Cursor invalido.'});
  const cursor=BigInt(cursorRaw);
  if(cursor<=0n||cursor>9223372036854775807n)return res.status(400).json({ok:false,error:'Cursor fora do intervalo.'});
  const statusOk=v=>{const s=norm(v);return s==='EM CAMPO'||s==='PENDENTE DE ENVIO PARA CAMPO'};
  let etapa='status';
  try{
    let pagina=[],tarefas=[],comStatus=[];
    if(modo==='situacao'){
      // Um indice por situacao/tsk_id no banco de origem acelera esta consulta.
      const r=await pool.query({text:
        `SELECT d.tsk_id,d.age_id,d.tsk_situation,d.tsk_scheduleinitialdatehour,
           d.tsk_realinitialdatehour,d.tsk_realfinaldatehour,d.e_situacao
         FROM u45468.dbout_task d
         WHERE d.tsk_id < $1::bigint
           AND (UPPER(BTRIM(d.tsk_situation))='EM CAMPO'
             OR UPPER(BTRIM(d.tsk_situation))='PENDENTE DE ENVIO PARA CAMPO')
         ORDER BY d.tsk_id DESC LIMIT $2`,
         values:[cursorRaw,limite+1],query_timeout:4200});
      pagina=r.rows;
      comStatus=pagina.slice(0,limite);
      etapa='task';
      if(comStatus.length){
        const r2=await pool.query({text:
          `SELECT tsk_id,loc_id,age_id,tty_id,tsk_insertdatehour,
            tsk_scheduleinitialdatehour,tsk_realinitialdatehour,tsk_realfinaldatehour
           FROM u45468.task WHERE tsk_id=ANY($1::bigint[])`,
          values:[comStatus.map(x=>x.tsk_id)],query_timeout:2400});
        tarefas=r2.rows;
      }
    }else{
      // Fallback exato, sem periodo: varre chaves de task progressivamente,
      // evitando filtro de situacao sobre a view grande dbout_task.
      const r=await pool.query({text:
        `SELECT tsk_id,loc_id,age_id,tty_id,tsk_insertdatehour,
          tsk_scheduleinitialdatehour,tsk_realinitialdatehour,tsk_realfinaldatehour
         FROM u45468.task WHERE tsk_id < $1::bigint ORDER BY tsk_id DESC LIMIT $2`,
        values:[cursorRaw,limite+1],query_timeout:3000});
      pagina=r.rows;
      tarefas=pagina.slice(0,limite);
      etapa='status-do-lote';
      if(tarefas.length){
        const d=await pool.query({text:
          `SELECT tsk_id,age_id,tsk_situation,tsk_scheduleinitialdatehour,
              tsk_realinitialdatehour,tsk_realfinaldatehour,e_situacao
           FROM u45468.dbout_task WHERE tsk_id=ANY($1::bigint[])`,
          values:[tarefas.map(t=>t.tsk_id)],query_timeout:2600});
        comStatus=d.rows.filter(x=>statusOk(x.tsk_situation));
      }
    }
    const temMais=pagina.length>limite;
    const cursorProximo=temMais?String(pagina[limite-1].tsk_id):null;
    const taskMap=new Map(tarefas.map(x=>[String(x.tsk_id),x]));
    // CP_V23_EXECUCAO_STATUS_GPS: manter Em Campo/Pendente mesmo sem equipe, quando houver inicio real.
    // O filtro de equipe das Programadas continua no frontend.
    const selecionadas=comStatus.filter(d=>{
      const t=taskMap.get(String(d.tsk_id));
      return !!t && (Number(d.age_id||t.age_id)>0 || !!(d.tsk_realinitialdatehour||t.tsk_realinitialdatehour));
    });
    const locaisIDs=[...new Set(selecionadas.map(d=>Number(taskMap.get(String(d.tsk_id))?.loc_id)).filter(Number.isSafeInteger))];
    const agentesIDs=[...new Set(selecionadas.map(d=>Number(d.age_id||taskMap.get(String(d.tsk_id))?.age_id)).filter(Number.isSafeInteger))];
    const tiposIDs=[...new Set(selecionadas.map(d=>Number(taskMap.get(String(d.tsk_id))?.tty_id)).filter(Number.isSafeInteger))];
    let complementosParciais=false;
    async function complementar(sql,ids,ms){
      if(!ids.length)return [];
      try{return (await pool.query({text:sql,values:[ids],query_timeout:ms})).rows}
      catch(e){complementosParciais=true;console.warn('V22 complemento:',e.message);return []}
    }
    etapa='complementos';
    const [locais,agentes,tipos]=await Promise.all([
      complementar('SELECT loc_id,loc_integrationid,loc_city,loc_neighborhood,loc_street,loc_streetnumber FROM u45468.local WHERE loc_id=ANY($1::bigint[])',locaisIDs,1800),
      complementar('SELECT age_id,age_name FROM u45468.agent WHERE age_id=ANY($1::bigint[])',agentesIDs,1800),
      complementar('SELECT tty_id,tty_description FROM u45468.tasktype WHERE tty_id=ANY($1::bigint[])',tiposIDs,1800)
    ]);
    const lmap=new Map(locais.map(v=>[String(v.loc_id),v]));
    const amap=new Map(agentes.map(v=>[String(v.age_id),v]));
    const tmap=new Map(tipos.map(v=>[String(v.tty_id),v]));
    const registros=selecionadas.map(d=>{
      const t=taskMap.get(String(d.tsk_id));
      const loc=lmap.get(String(t.loc_id))||{};
      const agenteId=d.age_id||t.age_id;
      const agent=amap.get(String(agenteId))||{};
      const tipo=tmap.get(String(t.tty_id))||{};
      const data=d.tsk_scheduleinitialdatehour||t.tsk_scheduleinitialdatehour||t.tsk_insertdatehour;
      return {
        tsk_id:d.tsk_id,agent_id:String(agenteId||''),ss:loc.loc_integrationid||'',equipe:Number(agenteId)>0?(agent.age_name||('Equipe '+agenteId)):'',
        cidade:loc.loc_city||'',bairro:loc.loc_neighborhood||'',
        rua:[loc.loc_street,loc.loc_streetnumber].filter(Boolean).join(', '),
        macro:tipo.tty_description||'',servico:tipo.tty_description||'',
        situacao_campo:d.tsk_situation||'',status_integracao:d.e_situacao||'',
        programacao_iso:d.tsk_scheduleinitialdatehour||t.tsk_scheduleinitialdatehour||null,
        inicio_real_iso:d.tsk_realinitialdatehour||t.tsk_realinitialdatehour||null,
        fim_real_iso:d.tsk_realfinaldatehour||t.tsk_realfinaldatehour||null,
        programacao:brDT(data),inicio:brDT(d.tsk_realinitialdatehour||t.tsk_realinitialdatehour),
        fim:brDT(d.tsk_realfinaldatehour||t.tsk_realfinaldatehour),
        data:brDate(data),no_periodo:false,
        cp_programada_status:true,cp_origem_situacao_atual:true
      }
    });
    res.set('Cache-Control','no-store');
    res.set('X-CP-Programadas-Source',modo);
    if(complementosParciais)res.set('X-CP-Enrichment-Partial','1');
    return res.json({ok:true,modo,registros,tem_mais:temMais,proximo_cursor:cursorProximo,
      complemento_parcial:complementosParciais,completo:!temMais});
  }catch(e){
    console.error('CP_V22 programadas /'+modo+' etapa '+etapa+':',e.message);
    // O cliente pode trocar a busca por status pela varredura de IDs.
    const falhaTempo=/timeout|timed out|canceling statement/i.test(String(e.message||''));
    res.status(falhaTempo?504:500).json({ok:false,modo,etapa,
       fallback:modo==='situacao'?'varredura':null,
       error:falhaTempo?'Tempo limite da consulta de Programadas no uMov':'Falha na consulta de Programadas do uMov'});
  }
});

// Fonte oficial para os indicadores OPERACIONAIS: situacao e datas da dbout_task.
// Nao aplicar filtro de data: SS que continuam Em Campo podem ter sido abertas ha meses.
const ATIVAS_CACHE={dados:null,ts:0};
app.get('/api/cp/ativas',async(req,res)=>{
 let activeFallback=null;
 try{
  const fresh=req.query.refresh==='1';
  if(!fresh){
   if(ATIVAS_CACHE.dados && Date.now()-ATIVAS_CACHE.ts<60000){
    res.set('Cache-Control','no-store');res.set('X-Cache','MEMORY');
    res.set('X-CP-Cached-At',new Date(ATIVAS_CACHE.ts).toISOString());
    return res.json(ATIVAS_CACHE.dados);
   }
   if(ATIVAS_CACHE.dados)activeFallback={dados:ATIVAS_CACHE.dados,at:new Date(ATIVAS_CACHE.ts).toISOString()};
   const persistido=await cpCache.load('ativas_v21',{maxAgeMs:60000,maxStaleMs:48*3600000,timeoutMs:700});
   if(persistido?.payload.dados?.length===1){
    const dados=persistido.payload.dados[0];
    if(!activeFallback||Date.parse(persistido.at)>Date.parse(activeFallback.at))activeFallback={dados,at:persistido.at};
    if(persistido.stale){
     res.set('X-Cache','STALE-PERSISTENT');res.set('X-CP-Stale','1');
     res.set('X-CP-Cached-At',persistido.at);
     return res.json(dados);
    }
    if(!persistido.stale){
     ATIVAS_CACHE.dados=dados;ATIVAS_CACHE.ts=Date.parse(persistido.at);
     res.set('X-Cache','PERSISTENT');res.set('X-CP-Cached-At',persistido.at);
     return res.json(dados);
    }
   }
  }
  const limite=200;
  const inicioConsulta=Date.now();
  const r=await pool.query({text:`SELECT tsk_id,loc_id,age_id,tty_id,tsk_insertdatehour,
    tsk_scheduleinitialdatehour,tsk_realinitialdatehour,tsk_realfinaldatehour
    FROM u45468.task ORDER BY tsk_insertdatehour DESC NULLS LAST,tsk_id DESC
    LIMIT $1`,values:[limite],query_timeout:3500});
  const extra=await cpLerComplementos(r.rows);
  if(!extra.dtOk)throw Error('dbout_task indisponivel; classificacao atual nao confirmada');
  const truncado=true; // apenas as 200 tarefas mais recentes; nao total oficial
  const linhas=r.rows.flatMap(t=>{
    const d=extra.dt.get(String(t.tsk_id));if(!d)return [];
    const sit=norm(d.tsk_situation);
    if(sit!=='EM CAMPO'&&!sit.startsWith('PENDENTE')&&!sit.startsWith('AGUARDANDO'))return [];
    const l=extra.local.get(String(t.loc_id))||{};
    const dl=extra.dl.get(String(t.loc_id))||{};
    const a=extra.agent.get(String(d.age_id||t.age_id))||{};
    const tipo=extra.tipo.get(String(t.tty_id))||{};
    return [{
      tsk_id:t.tsk_id,situacao_campo:d.tsk_situation,
      programacao_real:d.tsk_scheduleinitialdatehour||t.tsk_scheduleinitialdatehour||null,
      inicio_real:d.tsk_realinitialdatehour||t.tsk_realinitialdatehour||null,
      fim_real:d.tsk_realfinaldatehour||t.tsk_realfinaldatehour||null,
      status_integracao:d.e_situacao||'',loc_id:t.loc_id,
      ss:l.loc_integrationid||'',cidade:l.loc_city||'',bairro:l.loc_neighborhood||'',
      logradouro:l.loc_street||'',numero:l.loc_streetnumber||'',
      equipe:a.age_name||'',servico:tipo.tty_description||'',
      s_situacao:dl.e_situacao||'',s_cidade_umov:dl.e_localidade||'',
      s_bairro_umov:dl.e_bairro||'',s_cidade_sistema:dl.loc_city||'',
      s_bairro_sistema:dl.loc_neighborhood||'',s_logradouro_umov:dl.loc_street||'',
      s_numero_umov:dl.loc_streetnumber||'',s_localizacao:dl.loc_description||'',
      s_geoposicao:dl.loc_geoposition||''
    }];
  });
  if(extra.falhas.length){console.warn('CP_V21 ativas parciais:',extra.falhas.join(' | '));res.set('X-CP-Enrichment-Partial','1');}
  const registros=linhas.map(x=>{
    const s={
      cidade_umov:x.s_cidade_umov||'',cidade_sistema:x.s_cidade_sistema||'',
      bairro_umov:x.s_bairro_umov||'',bairro_sistema:x.s_bairro_sistema||'',
      logradouro_umov:x.s_logradouro_umov||'',numero_umov:x.s_numero_umov||'',
      localizacao:x.s_localizacao||'',geoposicao:x.s_geoposicao||'',
      situacao:x.s_situacao||''
    };
    return {
      tsk_id:x.tsk_id,ss:x.ss||'',data:brDate(x.inicio_real||x.programacao_real),
      equipe:x.equipe||'',cidade:s.cidade_umov||s.cidade_sistema||x.cidade||'',
      bairro:s.bairro_umov||s.bairro_sistema||x.bairro||'',
      rua:[s.logradouro_umov||x.logradouro,s.numero_umov||x.numero].filter(Boolean).join(', '),
      localizacao:s.localizacao||'',geoposicao:s.geoposicao||'',servico:x.servico||'',macro:x.servico||'',
      situacao_campo:x.situacao_campo||'',
      status_integracao:x.status_integracao||'',status_siscom:s.situacao||'',
      situacao:s.situacao||'',
      programacao_iso:x.programacao_real||null,
      inicio_real_iso:x.inicio_real||null,fim_real_iso:x.fim_real||null,
      programacao:brDT(x.programacao_real),
      inicio:brDT(x.inicio_real),fim:brDT(x.fim_real),
      duracao:hhmm(mins(x.inicio_real,x.fim_real)),
      snapshot_ativa:true
    };
  });
  const comEquipe=x=>!!String(x.equipe||'').trim()&&!['SEM EQUIPE','NAO INFORMADO','NÃO INFORMADO','NULL','UNDEFINED'].includes(norm(x.equipe));
  const semInicioSemFim=x=>!x.inicio_real_iso&&!x.fim_real_iso;
  const statusParaProgramar=x=>{const v=norm(x.situacao_campo);return v.includes('EM CAMPO')||v.includes('PENDENTE')||v.includes('AGUARDANDO')};
  const stats={
    total_status_em_campo:registros.filter(x=>norm(x.situacao_campo)==='EM CAMPO').length,
    total_status_pendente_campo:registros.filter(x=>norm(x.situacao_campo).includes('PENDENTE')).length,
    com_inicio_sem_fim:registros.filter(x=>x.inicio_real_iso&&!x.fim_real_iso).length,
    total_em_campo:registros.filter(x=>x.inicio_real_iso&&!x.fim_real_iso).length,
    total_programadas:registros.filter(x=>semInicioSemFim(x)&&comEquipe(x)&&statusParaProgramar(x)).length,
    sem_inicio_com_equipe:registros.filter(x=>!x.inicio_real_iso&&!x.fim_real_iso&&comEquipe(x)).length,
    sem_inicio_sem_equipe:registros.filter(x=>!x.inicio_real_iso&&!x.fim_real_iso&&!comEquipe(x)).length,
    com_fim:registros.filter(x=>!!x.fim_real_iso).length,
    sem_programacao:registros.filter(x=>!x.programacao_iso).length,
    ss_distintas:new Set(registros.map(x=>x.ss).filter(Boolean)).size,
    tarefas:registros.length
  };
  const dados={ok:true,fonte:'u45468.dbout_task',sem_filtro_data:true,truncado,escopo:'amostra das ultimas 200 tarefas',stats,registros};
  ATIVAS_CACHE.dados=dados;ATIVAS_CACHE.ts=Date.now();
  await Promise.race([cpCache.save('ativas_v21',{dados:[dados],truncado}),new Promise(resolve=>setTimeout(resolve,350))]);
  res.set('X-CP-Cached-At',new Date().toISOString());
  res.set('Cache-Control','no-store');res.set('X-Cache','UMOV');res.set('Server-Timing',`cp_ativas;dur=${Date.now()-inicioConsulta}`);res.json(dados);
 }catch(err){
  console.error('ERRO /api/cp/ativas:',err.message);
  try{
   const persistido=activeFallback?null:await cpCache.load('ativas_v21',{maxAgeMs:0,maxStaleMs:14*86400000,timeoutMs:700});
   const anterior=activeFallback?.dados||ATIVAS_CACHE.dados||persistido?.payload?.dados?.[0];
   if(anterior?.ok&&Array.isArray(anterior.registros)){
    res.set('X-Cache','STALE-ON-ERROR');res.set('X-CP-Stale','1');
    res.set('X-CP-Cached-At',new Date(activeFallback?.at||ATIVAS_CACHE.ts||persistido?.at||Date.now()).toISOString());
    return res.json(anterior);
   }
  }catch(fallbackError){console.warn('Cache CP ativas indisponivel:',fallbackError.message);}
  const timeout=/timeout|timed out|canceling statement/i.test(String(err.message||''));
  res.status(timeout?504:500).json({ok:false,error:timeout?
    'Consulta atual excedeu o limite de 3,5 segundos na leitura das tarefas. Verifique indices do uMov.':
    'Nao foi possivel consultar as situacoes atuais da dbout_task.'});
 }
});

// GPS separado da consulta principal: falhas aqui nao afetam os KPIs.
const GPS_CACHE=new Map();
app.post('/api/cp/ss-gps',async(req,res)=>{
 const ids=[...new Set((Array.isArray(req.body?.task_ids)?req.body.task_ids:[]).map(Number).filter(x=>Number.isSafeInteger(x)&&x>0))].slice(0,40);
 if(!ids.length)return res.json([]);
 const key=ids.join(','); const hit=GPS_CACHE.get(key);
 if(hit&&Date.now()-hit.ts<300000)return res.json(hit.rows);
 try{
  const result=await pool.query({text:`
   /* CP_V18_GPS_REAL: ultimos eventos com geoposicao registrada; nao sao rastreamento ao vivo */
   SELECT req.tsk_id, point.latitude, point.longitude, point.horario_gps, point.hty_id
   FROM unnest($1::bigint[]) AS req(tsk_id)
   JOIN LATERAL (
     SELECT g.geo_latitude AS latitude, g.geo_longitude AS longitude,
            g.geo_collecteddatehour AS horario_gps, h.hty_id
     FROM (
       SELECT h.hty_id, h.hty_initialdatehour
       FROM u45468.history h
       WHERE h.tsk_id=req.tsk_id
       ORDER BY h.hty_initialdatehour DESC NULLS LAST
       LIMIT 50
     ) h
     JOIN LATERAL (
       SELECT geo_latitude,geo_longitude,geo_collecteddatehour
       FROM u45468.geocoordinate g
       WHERE g.hty_id=h.hty_id
         AND g.geo_latitude BETWEEN -22 AND -18
         AND g.geo_longitude BETWEEN -42 AND -39
       ORDER BY g.geo_collecteddatehour DESC NULLS LAST LIMIT 1
     ) g ON TRUE
     ORDER BY g.geo_collecteddatehour DESC NULLS LAST
     LIMIT 1
   ) point ON TRUE
  `,values:[ids],query_timeout:6500});
  const rows=result.rows;
  if(GPS_CACHE.size>100)GPS_CACHE.clear();GPS_CACHE.set(key,{ts:Date.now(),rows});
  res.json(rows);
 }catch(e){console.error('GPS uMov:',e.message);res.status(503).json({error:'GPS indisponivel; consulta principal preservada.'})}
});

app.get('/api/cp/frotas-veiculos',async(req,res)=>{
 try{
  const frota=await lerVeiculos();
  res.json({ok:true,data:(frota||[]).filter(v=>String(v.status||'Ativo').toUpperCase()!=='INATIVO')});
 }catch(e){res.status(500).json({ok:false,error:e.message})}
});

app.get('/api/cp/kpis-cache',(req,res)=>{
 const di=req.query.di||req.query.inicio||'',df=req.query.df||req.query.fim||'';
 const k=CACHE.get(`v15-completo|${di}|${df}|800|0`)||CACHE.get(`v15-completo|${di}|${df}|1200|0`);
 res.json(k||{ok:true,total:0,baixadas:0,rejeitadas:0,duplicadas:0,tempo_medio:'00:00'});
});


};
