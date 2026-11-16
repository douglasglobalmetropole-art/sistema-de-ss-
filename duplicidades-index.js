'use strict';
const {normalizarRegistro,comparar}=require('./duplicidades-core');
const {definirMatriz,SS_RE}=require('./duplicidades-matriz');
const TABELA='ss_duplicidades_indice';
const COL='origem,tsk_id,loc_id,ss,matricula,hidrometro,cidade,bairro,logradouro,numero,complemento,chave_rua,chave_endereco,servico,situacao,registro_em,capturado_em';
const arr=x=>Array.isArray(x)?x:[];
const CLASSES=['matricula','hidrometro','chave_endereco','chave_rua'];
const MAX_BUSCA=500;
const STATUS_ABERTO=s=>String(s||'').trim().toLowerCase()==='pendente de envio para campo';
const TEXTO_TAG=ss=>'DUPLICATA DA SS '+ss;

function registrar(app,{pool,poolLote1,schemaLote1='u46915',autorizado,podeEscrever,origemOk,rest,escreverTag}){
 if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schemaLote1))throw Error('Schema Lote 1 invalido');
 const fontes=['umov','umov_lote1'];
 const fonteReq=req=>req.divisaoSS?(req.divisaoSS.lote1?'umov_lote1':'umov'):null;
 const cidadeOk=(cidade,req)=>!req.divisaoSS||req.divisaoSS.cidades.some(c=>String(c).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase()===String(cidade||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase());
 const fonteBanco=fonte=>fonte==='umov_lote1'?{db:poolLote1,schema:schemaLote1}:{db:pool,schema:'u45468'};

 if(typeof autorizado!=='function'||typeof podeEscrever!=='function'||typeof origemOk!=='function'||typeof escreverTag!=='function')
  throw Error('Configuracao de autorizacao da Matriz incompleta.');
 const caminho=(col,val,limit)=>`${TABELA}?select=${COL}&${col}=eq.${encodeURIComponent(val)}&order=tsk_id.desc&limit=${limit}`;
 async function buscarMatriz(ss,req,comDetalhes=false){
   const candidatas=arr(await rest(`${TABELA}?select=${COL}&ss=eq.${encodeURIComponent(ss)}&order=tsk_id.desc&limit=100`));
   const fontePreferida=fonteReq(req);
   let base=candidatas.find(x=>(!fontePreferida||x.origem===fontePreferida)&&cidadeOk(x.cidade,req));
   let origem='indice';
   if(!base){
     // Consulta pontual na origem correta, nunca mistura IDs entre bancos.
     for(const fonte of (fontePreferida?[fontePreferida]:fontes)){
       const {db,schema}=fonteBanco(fonte);
       if(!db)continue;
       const q=await db.query({text:`SELECT l.loc_id,l.loc_integrationid AS ss,l.loc_city AS cidade,
         l.loc_neighborhood AS bairro,l.loc_street AS logradouro,l.loc_streetnumber AS numero,
         l.loc_streetnumbercompl AS complemento,t.tsk_id,t.tsk_situation AS situacao,
         t.tsk_insertdatehour AS registro_em,tt.tty_description AS servico
         FROM ${schema}.local l
         JOIN LATERAL (SELECT tsk_id,tsk_situation,tsk_insertdatehour,tty_id
           FROM ${schema}.task WHERE loc_id=l.loc_id ORDER BY tsk_id DESC LIMIT 1) t ON TRUE
         LEFT JOIN ${schema}.tasktype tt ON tt.tty_id=t.tty_id
         WHERE l.loc_integrationid=$1 LIMIT 1`,values:[ss],query_timeout:7000});
       if(!q.rows.length||!cidadeOk(q.rows[0].cidade,req))continue;
       const raw=q.rows[0];raw.origem=fonte;
       const campos=await db.query({text:`SELECT f.cfd_integrationid AS campo,v.cfv_internalvalue AS valor
         FROM ${schema}.customfieldvalue v JOIN ${schema}.customfield f ON f.cfd_id=v.cfd_id
         WHERE v.cfv_registerid=$1 AND f.cfd_table='local'
           AND f.cfd_integrationid IN ('matricula','hidrometro')`,values:[raw.loc_id],query_timeout:5000});
       for(const r of campos.rows)raw[r.campo]=r.valor;
       base=normalizarRegistro(raw);origem='consulta_pontual';break;
     }
     if(!base)return null;
   }
   const consultas=CLASSES.filter(col=>base[col]&&String(base[col]).length<180)
    .map(col=>({col,url:caminho(col,base[col],col==='chave_rua'?75:MAX_BUSCA)}));
   const encontrados=await Promise.all(consultas.map(x=>rest(x.url)));
   const truncado=encontrados.some((reg,i)=>arr(reg).length >= (consultas[i].col==='chave_rua'?75:MAX_BUSCA));
   const porSS=new Map();
   for(const reg of encontrados.flatMap(arr)){
     if(reg.ss===ss||!SS_RE.test(String(reg.ss||'')))continue;
     const chave=String(reg.origem)+'|'+String(reg.ss);
     const antes=porSS.get(chave);
     if(!antes||Number(reg.tsk_id)>Number(antes.tsk_id))porSS.set(chave,reg);
   }
   const todos=[...porSS.values()].map(r=>({...r,...comparar(base,r)})).filter(r=>r.pontos>=3)
    .sort((a,b)=>b.pontos-a.pontos||Number(b.tsk_id)-Number(a.tsk_id));

   const grupo=definirMatriz(base,todos);

   // CGM_STATUS_FISICOS_V5: somente na janela detalhada.
   if (comDetalhes) {
     const porFonte = new Map();
     const registros = [base,...todos.slice(0,80),...grupo.duplicatas];

     for (const registro of registros) {
       if (!['umov','umov_lote1'].includes(registro.origem)) continue;
       const id = Number(registro.tsk_id);
       if (!Number.isSafeInteger(id) || id <= 0) continue;
       if (!porFonte.has(registro.origem)) porFonte.set(registro.origem,[]);
       porFonte.get(registro.origem).push(registro);
     }

     await Promise.all([...porFonte.entries()].map(async ([fonte,lista]) => {
       const {db,schema} = fonteBanco(fonte);
       if (!db) return;
       const ids = [...new Set(lista.map(r => Number(r.tsk_id)))];

       try {
         const consulta = await db.query({
           text: `
             SELECT t.tsk_id,
                    t.tsk_situation AS situacao_campo,
                    COALESCE((
                      SELECT COALESCE(
                        NULLIF(ce.cev_description::text,''),
                        NULLIF(v.cfv_externalvalue::text,''),
                        NULLIF(v.cfv_internalvalue::text,''),
                        '')
                      FROM ${schema}.customfieldvalue v
                      JOIN ${schema}.customfield f ON f.cfd_id=v.cfd_id
                      LEFT JOIN ${schema}.customentityvalue ce
                        ON ce.cev_id=CASE WHEN v.cfv_internalvalue ~ '^[0-9]{1,18}$'
                        THEN v.cfv_internalvalue::bigint ELSE NULL END
                      WHERE v.cfv_registerid=t.tsk_id
                        AND f.cfd_table='task'
                        AND LOWER(TRIM(f.cfd_integrationid))='situacao'
                      LIMIT 1
                    ),'') AS status_integracao
             FROM ${schema}.task t
             WHERE t.tsk_id=ANY($1::bigint[])
           `,
           values:[ids],
           query_timeout:4500
         });

         const dados=new Map(consulta.rows.map(r=>[String(r.tsk_id),r]));
         for(const registro of lista){
           const atual=dados.get(String(registro.tsk_id));
           if(!atual)continue;
           registro.situacao_campo=atual.situacao_campo || '';
           registro.status_integracao=atual.status_integracao || '';
         }
       } catch(erro) {
         console.warn('[duplicidades] consulta pontual:',fonte,erro.code||erro.message);
         for(const registro of lista){
           registro.situacao_campo='Consulta indisponível';
           registro.status_integracao='Consulta indisponível';
         }
       }
     }));
   }

   const estados=arr(await rest('ss_duplicidades_controle?select=fonte,varredura_concluida,total_lidos,atualizado_em&fonte=in.(umov,umov_lote1)'));
   const porFonte=Object.fromEntries(estados.map(x=>[x.fonte,x]));
   const cobertura={completa:fontes.every(f=>porFonte[f]?.varredura_concluida===true),
     lidos:fontes.reduce((n,f)=>n+Number(porFonte[f]?.total_lidos||0),0),
     lotes:fontes.map(f=>({fonte:f,completa:!!porFonte[f]?.varredura_concluida,lidos:Number(porFonte[f]?.total_lidos||0)}))};
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
     const dados=await buscarMatriz(ss,req,req.query.detalhes==='1');
     if(!dados)return res.status(404).json({ok:false,codigo:'nao_indexada',erro:'SS nao localizada no indice ou uMov.'});
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
     const dados=await buscarMatriz(ss,req);
     if(!dados?.grupoSeguro||!dados.grupo.matriz)
       return res.status(409).json({ok:false,erro:'Matriz nao confirmada. Conclua a sincronizacao ou revise a consulta.'});
     if(!cidadeOk(dados.alvo.cidade,req)||dados.grupo.matriz.ss!==matrizSS)
       return res.status(409).json({ok:false,erro:'A Matriz foi alterada. Reabra a analise antes de marcar.'});
     // Escrita uMov usa uma credencial/rota unica: bloqueia lote 1 e grupos mistos.
     if(dados.alvo.origem!=='umov'||dados.grupo.matriz.origem!=='umov'||dados.grupo.duplicatas.some(d=>d.origem!=='umov'))
       return res.status(409).json({ok:false,erro:'TAG automatica bloqueada para grupos com Lote 1. Revise manualmente.'});
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
