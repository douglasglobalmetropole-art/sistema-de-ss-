'use strict';
const {normalizarRegistro,comparar}=require('./duplicidades-core');
const TABELA='ss_duplicidades_indice';
const COL='tsk_id,loc_id,ss,matricula,hidrometro,cidade,bairro,logradouro,numero,complemento,chave_rua,chave_endereco,servico,situacao,registro_em,capturado_em';
const SS_RE=/^\d{2}\/\d{2}-\d{6}-\d{2}$/;
const arr=x=>Array.isArray(x)?x:[];
function registrar(app,{pool,autorizado,rest}){
 app.get('/api/duplicidades/consulta',async(req,res)=>{
   res.set('Cache-Control','private, no-store');
   if(!autorizado(req))return res.status(401).json({ok:false,erro:'Faça login no SISCOM para realizar a busca global de duplicidades.'});
   const ss=String(req.query.ss||'').trim();
   if(!SS_RE.test(ss))return res.status(400).json({ok:false,erro:'Informe o número da SS no formato 10/26-098247-01.'});
   const inicio=Date.now();
   try{
     let base=arr(await rest(`${TABELA}?select=${COL}&ss=eq.${encodeURIComponent(ss)}&order=tsk_id.desc&limit=1`))[0];
     let baseOrigem='indice';
     if(!base){
       // Consulta PONTUAL ao uMov, nunca uma varredura global na view pesada.
       const q=await pool.query({text:`SELECT l.loc_id,l.loc_integrationid AS ss,l.loc_city AS cidade,
        l.loc_neighborhood AS bairro,l.loc_street AS logradouro,
        l.loc_streetnumber AS numero,l.loc_streetnumbercompl AS complemento,
        t.tsk_id,t.tsk_situation AS situacao,t.tsk_insertdatehour AS registro_em,
        tt.tty_description AS servico
        FROM u45468.local l
        JOIN LATERAL (SELECT tsk_id,tsk_situation,tsk_insertdatehour,tty_id
           FROM u45468.task WHERE loc_id=l.loc_id ORDER BY tsk_id DESC LIMIT 1) t ON TRUE
        LEFT JOIN u45468.tasktype tt ON tt.tty_id=t.tty_id
        WHERE l.loc_description LIKE $1 AND l.loc_integrationid=$2 LIMIT 1`,
        values:['SS: '+ss+'%',ss],query_timeout:7000});
       if(!q.rows.length)return res.status(404).json({ok:false,erro:'SS não localizada no índice nem no uMov.'});
       const raw=q.rows[0];
       const f=await pool.query({text:`SELECT f.cfd_integrationid AS campo,v.cfv_internalvalue AS valor
        FROM u45468.customfieldvalue v JOIN u45468.customfield f ON f.cfd_id=v.cfd_id
        WHERE v.cfv_registerid=$1 AND f.cfd_table='local' AND f.cfd_integrationid IN ('matricula','hidrometro')`,
        values:[raw.loc_id],query_timeout:5000});
       for(const v of f.rows)raw[v.campo]=v.valor;
       base=normalizarRegistro(raw);baseOrigem='consulta_pontual';
     }
     const filtros=[];
     for(const [col,val] of [['matricula',base.matricula],['hidrometro',base.hidrometro],['chave_endereco',base.chave_endereco],['chave_rua',base.chave_rua]]){
       if(val && String(val).length<180) filtros.push(`${TABELA}?select=${COL}&${col}=eq.${encodeURIComponent(val)}&order=tsk_id.desc&limit=${col==='chave_rua'?75:150}`);
     }
     const encontrados=await Promise.all(filtros.map(x=>rest(x)));
     const porSS=new Map();
     for(const registro of encontrados.flatMap(arr)){
       if(registro.ss===ss)continue;
       const antiga=porSS.get(registro.ss);
       if(!antiga||Number(registro.tsk_id)>Number(antiga.tsk_id))porSS.set(registro.ss,registro);
     }
     const resultados=Array.from(porSS.values()).map(r=>({...r,...comparar(base,r)}))
       .filter(r=>r.pontos>=3).sort((a,b)=>b.pontos-a.pontos||Number(b.tsk_id)-Number(a.tsk_id)).slice(0,80);
     const controle=arr(await rest('ss_duplicidades_controle?select=ultimo_id_processado,varredura_concluida,total_lidos,atualizado_em,ultimo_erro&fonte=eq.umov&limit=1'))[0]||null;
     res.json({ok:true,alvo:base,origem_alvo:baseOrigem,resultados,
       cobertura:controle?{completa:!!controle.varredura_concluida,lidos:Number(controle.total_lidos||0),atualizado_em:controle.atualizado_em}: {completa:false,lidos:0,atualizado_em:null},
       busca_na_pagina:false, tempo_ms:Date.now()-inicio,
       aviso:!controle?.varredura_concluida?'Índice parcial: podem existir SS fora do histórico já sincronizado.':null});
   }catch(e){console.error('[duplicidades] consulta indisponivel:',e.message);res.status(503).json({ok:false,erro:'Consulta do índice indisponível. Confira a sincronização e as credenciais do servidor.'});}
 });
}
module.exports={registrar};
