'use strict';
const {normalizarRegistro,comparar}=require('./duplicidades-core');
const {definirMatriz,SS_RE}=require('./duplicidades-matriz');
const TABELA='ss_duplicidades_indice';
const COL='tsk_id,loc_id,ss,matricula,hidrometro,cidade,bairro,logradouro,numero,complemento,chave_rua,chave_endereco,servico,situacao,registro_em,capturado_em';
const arr=x=>Array.isArray(x)?x:[];
const CLASSES=['matricula','hidrometro','chave_endereco','chave_rua'];
const MAX_BUSCA=500;
const STATUS_ABERTO=s=>String(s||'').trim().toLowerCase()==='pendente de envio para campo';
const TEXTO_TAG=ss=>'DUPLICATA DA SS '+ss;

function registrar(app,{pool,autorizado,podeEscrever,origemOk,rest,escreverTag}){
 if(typeof autorizado!=='function'||typeof podeEscrever!=='function'||typeof origemOk!=='function'||typeof escreverTag!=='function')
  throw Error('Configuracao de autorizacao da Matriz incompleta.');
 const caminho=(col,val,limit)=>`${TABELA}?select=${COL}&${col}=eq.${encodeURIComponent(val)}&order=tsk_id.desc&limit=${limit}`;
 async function buscarMatriz(ss){
   let base=arr(await rest(`${TABELA}?select=${COL}&ss=eq.${encodeURIComponent(ss)}&order=tsk_id.desc&limit=1`))[0];
   let origem='indice';
   if(!base){
     // Consulta um local pela SS exata. Nao amplia a busca para dbout_local.
     const q=await pool.query({text:`SELECT l.loc_id,l.loc_integrationid AS ss,l.loc_city AS cidade,
       l.loc_neighborhood AS bairro,l.loc_street AS logradouro,l.loc_streetnumber AS numero,
       l.loc_streetnumbercompl AS complemento,t.tsk_id,t.tsk_situation AS situacao,
       t.tsk_insertdatehour AS registro_em,tt.tty_description AS servico
       FROM u45468.local l
       JOIN LATERAL (SELECT tsk_id,tsk_situation,tsk_insertdatehour,tty_id
         FROM u45468.task WHERE loc_id=l.loc_id ORDER BY tsk_id DESC LIMIT 1) t ON TRUE
       LEFT JOIN u45468.tasktype tt ON tt.tty_id=t.tty_id
       WHERE l.loc_integrationid=$1 LIMIT 1`,values:[ss],query_timeout:7000});
     if(!q.rows.length)return null;
     const raw=q.rows[0];
     const campos=await pool.query({text:`SELECT f.cfd_integrationid AS campo,v.cfv_internalvalue AS valor
       FROM u45468.customfieldvalue v JOIN u45468.customfield f ON f.cfd_id=v.cfd_id
       WHERE v.cfv_registerid=$1 AND f.cfd_table='local'
         AND f.cfd_integrationid IN ('matricula','hidrometro')`,values:[raw.loc_id],query_timeout:5000});
     for(const r of campos.rows)raw[r.campo]=r.valor;
     base=normalizarRegistro(raw);origem='consulta_pontual';
   }
   const consultas=CLASSES.filter(col=>base[col]&&String(base[col]).length<180)
    .map(col=>({col,url:caminho(col,base[col],col==='chave_rua'?75:MAX_BUSCA)}));
   const encontrados=await Promise.all(consultas.map(x=>rest(x.url)));
   const truncado=encontrados.some((reg,i)=>consultas[i].col!=='chave_rua'&&arr(reg).length>=MAX_BUSCA);
   const porSS=new Map();
   for(const reg of encontrados.flatMap(arr)){
     if(reg.ss===ss||!SS_RE.test(String(reg.ss||'')))continue;
     const antes=porSS.get(reg.ss);
     if(!antes||Number(reg.tsk_id)>Number(antes.tsk_id))porSS.set(reg.ss,reg);
   }
   const todos=[...porSS.values()].map(r=>({...r,...comparar(base,r)})).filter(r=>r.pontos>=3)
    .sort((a,b)=>b.pontos-a.pontos||Number(b.tsk_id)-Number(a.tsk_id));
   const grupo=definirMatriz(base,todos);
   const estado=arr(await rest('ss_duplicidades_controle?select=varredura_concluida,total_lidos,atualizado_em&fonte=eq.umov&limit=1'))[0]||null;
   const cobertura={completa:!!estado?.varredura_concluida,lidos:Number(estado?.total_lidos||0),atualizado_em:estado?.atualizado_em||null};
   // Nao marcar Matriz definitiva quando o conjunto de SS ainda e parcial.
   const grupoSeguro=!!(grupo.habilitada&&origem==='indice'&&cobertura.completa&&!truncado);
   return {alvo:base,origem,resultadoCompleto:todos,resultados:todos.slice(0,80),grupo,grupoSeguro,cobertura,truncado};
 }
 app.get('/api/duplicidades/consulta',async(req,res)=>{
   res.set('Cache-Control','private, no-store');
   if(!autorizado(req))return res.status(401).json({ok:false,erro:'Faça login no SISCOM para consultar duplicidades.'});
   const ss=String(req.query.ss||'').trim();
   if(!SS_RE.test(ss))return res.status(400).json({ok:false,erro:'Numero da SS invalido.'});
   const inicio=Date.now();
   try{
     const dados=await buscarMatriz(ss);
     if(!dados)return res.status(404).json({ok:false,erro:'SS nao localizada no indice ou uMov.'});
     const {alvo,origem,resultados,grupo,grupoSeguro,cobertura,truncado}=dados;
     res.json({ok:true,alvo,origem_alvo:origem,resultados,cobertura,
       matriz:grupo.matriz||null,duplicatas:grupo.duplicatas||[],
       pode_selecionar:grupoSeguro,
       motivo_bloqueio:grupoSeguro?null:!cobertura.completa?'Conclua a sincronizacao do indice para definir a Matriz com seguranca.':
         truncado?'Limite de correspondencias atingido. E necessario ampliar a busca antes da marcacao.':
         origem!=='indice'?'A SS consultada ainda nao consta do indice. Sincronize o uMov.':
         grupo.motivo||'Nao ha duplicatas elegiveis neste conjunto.',
       busca_na_pagina:false,tempo_ms:Date.now()-inicio,
       aviso:!cobertura.completa?'Indice parcial: podem existir SS ainda nao sincronizadas.':null});
   }catch(e){console.error('[duplicidades] consulta:',e.message);
     res.status(503).json({ok:false,erro:'Indice de duplicidades indisponivel. Confira a sincronizacao.'});}
 });
 app.post('/api/duplicidades/aplicar-tag',async(req,res)=>{
   res.set('Cache-Control','no-store');
   if(!autorizado(req))return res.status(401).json({ok:false,erro:'Faça login para marcar duplicatas.'});
   if(!podeEscrever(req))return res.status(403).json({ok:false,erro:'Seu usuario nao possui permissao para alterar TAG no uMov.'});
   if(!origemOk(req))return res.status(403).json({ok:false,erro:'Origem de requisicao nao autorizada.'});
   const ss=String(req.body?.ss_consultada||'').trim(),matrizSS=String(req.body?.matriz_ss||'').trim();
   const tarefas=Array.isArray(req.body?.tarefas)?req.body.tarefas:[];
   if(!SS_RE.test(ss)||!SS_RE.test(matrizSS)||!tarefas.length||tarefas.length>20)
     return res.status(400).json({ok:false,erro:'Selecao invalida. Escolha ate 20 SS.'});
   const ids=[...new Set(tarefas.map(Number))];
   if(ids.length!==tarefas.length||ids.some(id=>!Number.isSafeInteger(id)||id<=0))
     return res.status(400).json({ok:false,erro:'Identificadores de SS invalidos.'});
   try{
     const dados=await buscarMatriz(ss);
     if(!dados?.grupoSeguro||!dados.grupo.matriz)
       return res.status(409).json({ok:false,erro:'Matriz nao confirmada. Conclua a sincronizacao ou revise a consulta.'});
     if(dados.grupo.matriz.ss!==matrizSS)
       return res.status(409).json({ok:false,erro:'A Matriz foi alterada. Reabra a analise antes de marcar.'});
     const elegiveis=new Map(dados.grupo.duplicatas.map(d=>[Number(d.tsk_id),d]));
     if(ids.some(id=>!elegiveis.has(id)||id===Number(dados.grupo.matriz.tsk_id)))
       return res.status(409).json({ok:false,erro:'Uma SS selecionada nao e duplicata elegivel desta Matriz.'});
     // Revalidacao com dados atuais ANTES de gravar. Os registros no indice podem estar defasados.
     const originais=await pool.query({text:`SELECT t.tsk_id,t.tsk_situation,
        l.loc_integrationid AS ss FROM u45468.task t
        JOIN u45468.local l ON l.loc_id=t.loc_id
        WHERE t.tsk_id=ANY($1::bigint[])`,values:[ids],query_timeout:7000});
     const atuais=new Map(originais.rows.map(r=>[Number(r.tsk_id),r]));
     if(ids.some(id=>!atuais.has(id)||!STATUS_ABERTO(atuais.get(id).tsk_situation)||atuais.get(id).ss!==elegiveis.get(id).ss))
       return res.status(409).json({ok:false,erro:'Situacao ou identificacao de uma SS mudou. Atualize a tela.'});
     const tags=await pool.query({text:`SELECT tsk_id,e_tag,e_situacao
       FROM u45468.dbout_task WHERE tsk_id=ANY($1::bigint[])`,values:[ids],query_timeout:6500});
     const porID=new Map(tags.rows.map(t=>[Number(t.tsk_id),t]));
     if(ids.some(id=>!porID.has(id)||String(porID.get(id).e_situacao||'').trim()))
       return res.status(409).json({ok:false,erro:'Integracao de uma SS mudou. Nenhuma TAG foi aplicada.'});
     const tag=TEXTO_TAG(matrizSS);
     const gravacoes=[];
     for(const id of ids){
       const existente=String(porID.get(id).e_tag||'').trim();
       if(/DUPLICATA DA SS/i.test(existente)&&!existente.toUpperCase().includes(tag))
         return res.status(409).json({ok:false,erro:'Uma SS ja possui TAG de outra Matriz. Revise manualmente.'});
       const partes=existente.split(/\s*\|\s*/).filter(Boolean);
       const final=partes.some(p=>p.toUpperCase()===tag)?existente:[...partes,tag].join(' | ');
       if(final.length>120)return res.status(409).json({ok:false,erro:'TAG ultrapassaria 120 caracteres. Revise as TAGs existentes.'});
       gravacoes.push({id,ss:atuais.get(id).ss,tag:final,jaAplicada:partes.some(p=>p.toUpperCase()===tag)});
     }
     const resultados=[];
     for(const a of gravacoes){
       if(a.jaAplicada){resultados.push({ss:a.ss,tarefa:a.id,ok:true,ja_aplicada:true});continue;}
       try{await escreverTag(a.id,a.tag);resultados.push({ss:a.ss,tarefa:a.id,ok:true});}
       catch(e){console.error('[duplicidades] falha ao aplicar tag:',a.id,e.message);
         resultados.push({ss:a.ss,tarefa:a.id,ok:false,erro:'Nao foi possivel aplicar a TAG no uMov.'});}
     }
     const falhas=resultados.filter(r=>!r.ok).length;
     res.status(falhas?207:200).json({ok:falhas===0,matriz:matrizSS,tag_aplicada:tag,resultados,
       sucesso:resultados.length-falhas,falhas});
   }catch(e){console.error('[duplicidades] tags:',e.message);
     res.status(503).json({ok:false,erro:'Nao foi possivel validar a selecao ou acessar o uMov.'});}
 });
}
module.exports={registrar};
