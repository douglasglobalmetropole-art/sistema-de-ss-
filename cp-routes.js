'use strict';
const path=require('node:path');

// Modulo da Central de Operacoes. Reaproveita a instancia e o pool do GLOBAL SS.
// Backend adaptado do index.js original da Central; nenhum servidor ou pool duplicado.
module.exports=function registrarCentralOperacoes(app,pool){
  const SUPABASE_URL=process.env.SUPABASE_URL || 'https://vzdqjinzjdzvurnsuujb.supabase.co';
  const SUPABASE_SERVICE_ROLE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';
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
function brDate(v){if(!v)return'';const d=new Date(v);if(isNaN(d))return'';return new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo'}).format(d)}
function brDT(v){if(!v)return'';const d=new Date(v);if(isNaN(d))return'';return new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(d).replace(',','')}
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
 try{const r=await pool.query('SELECT current_database() db,now() agora');res.json({ok:true,conectado:true})}
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
 const limite=Math.min(Math.max(Number(req.query.limite||8000),1),12000);
 // Paginação explícita: nunca esconder SS de meses movimentados no limite de 8.000.
 const offset=Math.min(Math.max(Number(req.query.offset||0),0),200000);
 if(!Number.isSafeInteger(offset))return res.status(400).json({ok:false,error:'Offset invalido.'});
 const chave=`${di}|${df}|${limite}|${offset}`;
 try{
   const cached=DATA_CACHE.get(chave);
   if(cached && (Date.now()-cached.ts)<DATA_CACHE_TTL){
     res.set('X-Cache','HIT');
     res.set('X-CP-Truncated',cached.truncated?'1':'0');
     if(cached.truncated)res.set('X-CP-Next-Offset',String(offset+limite));
     return res.json(cached.dados);
   }
   // Período de execução: inclui SS iniciadas, concluídas ou que atravessam o mês.
   // Datas da dbout_task (retorno operacional) prevalecem sobre task quando presentes.
   // O COALESCE antigo selecionava apenas uma data e excluía encerramentos no mês.
   const r=await pool.query({text:`
     WITH tarefas AS (
       SELECT t.tsk_id,t.loc_id,t.age_id,t.tty_id,t.tsk_insertdatehour,
              COALESCE(d.tsk_scheduleinitialdatehour,t.tsk_scheduleinitialdatehour) AS programacao_real,
              COALESCE(d.tsk_realinitialdatehour,t.tsk_realinitialdatehour) AS inicio_real,
              COALESCE(d.tsk_realfinaldatehour,t.tsk_realfinaldatehour) AS fim_real
       FROM u45468.task t
       LEFT JOIN u45468.dbout_task d ON d.tsk_id=t.tsk_id
     ), elegiveis AS MATERIALIZED (
       SELECT *,COALESCE(inicio_real,programacao_real,tsk_insertdatehour) AS data_referencia
       FROM tarefas
       WHERE
         (inicio_real >= $1::date AND inicio_real < ($2::date + INTERVAL '1 day'))
         OR (fim_real >= $1::date AND fim_real < ($2::date + INTERVAL '1 day'))
         OR (inicio_real < $1::date AND fim_real >= ($2::date + INTERVAL '1 day'))
         OR (inicio_real IS NULL AND programacao_real >= $1::date
             AND programacao_real < ($2::date + INTERVAL '1 day'))
         OR (inicio_real IS NULL AND programacao_real IS NULL
             AND tsk_insertdatehour >= $1::date
             AND tsk_insertdatehour < ($2::date + INTERVAL '1 day'))
     )
     SELECT t.tsk_id,t.loc_id,l.loc_integrationid AS ss,l.loc_city AS cidade,
       l.loc_neighborhood AS bairro,l.loc_street AS logradouro,l.loc_streetnumber AS numero,
       t.data_referencia,t.programacao_real,t.inicio_real,t.fim_real,
       a.age_name AS tecnico,tt.tty_description AS servico
     FROM elegiveis t
     LEFT JOIN u45468.local l ON l.loc_id=t.loc_id
     LEFT JOIN u45468.agent a ON a.age_id=t.age_id
     LEFT JOIN u45468.tasktype tt ON tt.tty_id=t.tty_id
     ORDER BY t.data_referencia ASC NULLS LAST,t.tsk_id ASC
     LIMIT $3 OFFSET $4
   `,values:[di,df,limite+1,offset],query_timeout:25000});

   // ETAPA 2: situação somente para loc_id retornados, em lotes pequenos
   const truncado=r.rows.length>limite;
   const linhas=r.rows.slice(0,limite);
   const [sit,tarefaExtra]=await Promise.all([
     buscarSituacoes(linhas.map(x=>x.loc_id)),
     buscarCamposTarefa(linhas.map(x=>x.tsk_id))
   ]);
   let baixadas=0,rejeitadas=0,duplicadas=0,soma=0,qtd=0;
   const dados=linhas.map(x=>{
     const s=sit.get(String(x.loc_id))||{
       situacao:'',info:'',servico_executado_siscom:'',
       usuario_baixa_siscom:'',horario_baixa_siscom:''
     };
     const tx=tarefaExtra.get(String(x.tsk_id))||{};
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

       servico:x.servico||'',
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
   CACHE.set(chave,{...k,ts:Date.now()});
   DATA_CACHE.set(chave,{dados,truncated:truncado,ts:Date.now()});
   res.set('X-Cache','MISS');
   res.set('X-CP-Truncated',truncado?'1':'0');
   if(truncado)res.set('X-CP-Next-Offset',String(offset+limite));
   res.set('Cache-Control','no-store');
   res.json(dados);
 }catch(e){
   console.error('ERRO /api/cp/ss:',e.message);
   const timeout=/timeout|timed out|canceling statement/i.test(String(e.message||''));
   res.status(timeout?504:500).json({ok:false,error:timeout?'A consulta ao uMov excedeu 15 segundos. Tente novamente.':'Falha na consulta ao uMov. Verifique a configuracao e as permissoes do banco.'});
 }
});


// Fonte oficial para os indicadores OPERACIONAIS: situacao e datas da dbout_task.
// Nao aplicar filtro de data: SS que continuam Em Campo podem ter sido abertas ha meses.
const ATIVAS_CACHE={dados:null,ts:0};
app.get('/api/cp/ativas',async(req,res)=>{
 try{
  if(ATIVAS_CACHE.dados && Date.now()-ATIVAS_CACHE.ts<60000){
   res.set('Cache-Control','no-store');res.set('X-Cache','HIT');
   return res.json(ATIVAS_CACHE.dados);
  }
  const limite=5000;
  const r=await pool.query({text:`
    SELECT d.tsk_id, d.tsk_situation AS situacao_campo,
           d.tsk_scheduleinitialdatehour AS programacao_real,
           d.tsk_realinitialdatehour AS inicio_real,
           d.tsk_realfinaldatehour AS fim_real,
           d.e_situacao AS status_integracao,
           t.loc_id, l.loc_integrationid AS ss,
           l.loc_city AS cidade, l.loc_neighborhood AS bairro,
           l.loc_street AS logradouro, l.loc_streetnumber AS numero,
           a.age_name AS equipe, tt.tty_description AS servico
    FROM u45468.dbout_task d
    LEFT JOIN u45468.task t ON t.tsk_id=d.tsk_id
    LEFT JOIN u45468.local l ON l.loc_id=t.loc_id
    LEFT JOIN u45468.agent a ON a.age_id=COALESCE(NULLIF(d.age_id,0),t.age_id)
    LEFT JOIN u45468.tasktype tt ON tt.tty_id=t.tty_id
    WHERE UPPER(BTRIM(d.tsk_situation)) = 'EM CAMPO'
       OR UPPER(BTRIM(d.tsk_situation)) LIKE 'PENDENTE%CAMPO%'
       OR UPPER(BTRIM(d.tsk_situation)) LIKE 'AGUARDANDO%CAMPO%'
    ORDER BY d.tsk_id DESC
    LIMIT $1
  `,values:[limite+1],query_timeout:18000});
  const truncado=r.rows.length>limite;
  const linhas=r.rows.slice(0,limite);
  let sit=new Map();
  try{sit=await buscarSituacoes(linhas.map(x=>x.loc_id));}
  catch(err){console.warn('CP ativas: consulta complementar de local indisponivel:',err.message)}
  const registros=linhas.map(x=>{
    const s=sit.get(String(x.loc_id))||{};
    return {
      tsk_id:x.tsk_id,ss:x.ss||'',data:brDate(x.inicio_real||x.programacao_real),
      equipe:x.equipe||'',cidade:s.cidade_umov||s.cidade_sistema||x.cidade||'',
      bairro:s.bairro_umov||s.bairro_sistema||x.bairro||'',
      rua:[s.logradouro_umov||x.logradouro,s.numero_umov||x.numero].filter(Boolean).join(', '),
      localizacao:s.localizacao||'',geoposicao:s.geoposicao||'',servico:x.servico||'',
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
  const comEquipe=x=>!!String(x.equipe||'').trim();
  const stats={
    total_status_em_campo:registros.filter(x=>norm(x.situacao_campo)==='EM CAMPO').length,
    total_status_pendente_campo:registros.filter(x=>norm(x.situacao_campo).includes('PENDENTE')).length,
    com_inicio_sem_fim:registros.filter(x=>x.inicio_real_iso&&!x.fim_real_iso).length,
    sem_inicio_com_equipe:registros.filter(x=>!x.inicio_real_iso&&!x.fim_real_iso&&comEquipe(x)).length,
    sem_inicio_sem_equipe:registros.filter(x=>!x.inicio_real_iso&&!x.fim_real_iso&&!comEquipe(x)).length,
    com_fim:registros.filter(x=>!!x.fim_real_iso).length,
    sem_programacao:registros.filter(x=>!x.programacao_iso).length,
    ss_distintas:new Set(registros.map(x=>x.ss).filter(Boolean)).size,
    tarefas:registros.length
  };
  const dados={ok:true,fonte:'u45468.dbout_task',sem_filtro_data:true,truncado,stats,registros};
  ATIVAS_CACHE.dados=dados;ATIVAS_CACHE.ts=Date.now();
  res.set('Cache-Control','no-store');res.set('X-Cache','MISS');res.json(dados);
 }catch(err){
  console.error('ERRO /api/cp/ativas:',err.message);
  const timeout=/timeout|timed out|canceling statement/i.test(String(err.message||''));
  res.status(timeout?504:500).json({ok:false,error:timeout?
    'Consulta atual das SS excedeu o tempo limite. Verifique indices e volume de tarefas.':
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
   SELECT h.tsk_id, g.geo_latitude AS latitude, g.geo_longitude AS longitude,
          g.geo_collecteddatehour AS horario_gps, h.hty_id
   FROM u45468.history h
   JOIN LATERAL (
     SELECT geo_latitude,geo_longitude,geo_collecteddatehour
     FROM u45468.geocoordinate g
     WHERE g.hty_id=h.hty_id
       AND g.geo_latitude BETWEEN -22 AND -18
       AND g.geo_longitude BETWEEN -42 AND -39
     ORDER BY g.geo_collecteddatehour ASC LIMIT 1
   ) g ON TRUE
   WHERE h.tsk_id=ANY($1::bigint[])
   ORDER BY h.tsk_id,h.hty_initialdatehour DESC NULLS LAST
  `,values:[ids],query_timeout:12000});
  const seen=new Set();const rows=result.rows.filter(r=>{const k=String(r.tsk_id);if(seen.has(k))return false;seen.add(k);return true});
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
 const k=CACHE.get(`${di}|${df}|8000`);
 res.json(k||{ok:true,total:0,baixadas:0,rejeitadas:0,duplicadas:0,tempo_medio:'00:00'});
});


};
