'use strict';
/* Executar SOMENTE no PC que já alcança o PostgreSQL uMov (VPN), com .env do Global SS.
   Usa varredura paginada por índice task_pk, e customfieldvalue_cfv_registerid_in.
   Não grava nada no uMov. Não expõe chaves no navegador. */
require('dotenv').config();
const {Pool}=require('pg');
const {normalizarRegistro}=require('./duplicidades-core');
const {setTimeout:pausa}=require('node:timers/promises');
const argv=process.argv.slice(2);
const atualizar=argv.includes('--atualizar');
const completa=argv.includes('--completa');
const flag=argv.find(v=>v.startsWith('--lotes='));
const maxLotes=completa?Number.MAX_SAFE_INTEGER:flag?Math.min(200,Math.max(1,Number(flag.split('=')[1])||10)):10;
const LOTE=120;
const url=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const key=process.env.SUPABASE_SECRET_KEY;
if(!url.startsWith('https://')||!key)throw Error('SUPABASE_URL e SUPABASE_SECRET_KEY obrigatórios somente no ambiente do servidor');
if(!process.env.DB_HOST||!process.env.DB_NAME||!process.env.DB_USER)throw Error('Configurar DB_HOST, DB_NAME e DB_USER no .env local');
const pool=new Pool({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||5432),database:process.env.DB_NAME,
 user:process.env.DB_USER,password:String(process.env.DB_PASSWORD||''),ssl:String(process.env.DB_SSL||'false')==='true'?{rejectUnauthorized:false}:false,
 max:1,connectionTimeoutMillis:7000,idleTimeoutMillis:15000});
async function supa(route,{method='GET',body,headers={}}={}){
 const r=await fetch(url+'/rest/v1/'+route,{method,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',...headers},
  body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw Error('Falha Supabase HTTP '+r.status+' em '+route.split('?')[0]);
 const output=await r.text();return output?JSON.parse(output):null;
}
function checarNumero(s){if(!/^\d+$/.test(String(s||'')))throw Error('Cursor invalido');return String(s);}
async function main(){
 const field=await pool.query({text:`SELECT cfd_id,cfd_integrationid FROM u45468.customfield
  WHERE cfd_table='local' AND cfd_integrationid IN ('matricula','hidrometro') AND cfd_active='1'`,query_timeout:5000});
 const idCampo=Object.fromEntries(field.rows.map(r=>[r.cfd_integrationid,r.cfd_id]));
 if(!idCampo.matricula||!idCampo.hidrometro)throw Error('Campos ativos matrícula/hidrômetro não encontrados em u45468.customfield');
 let state=(await supa('ss_duplicidades_controle?select=*&fonte=eq.umov&limit=1'))?.[0];
 if(!state){state={fonte:'umov',ultimo_id_processado:null,maior_id_capturado:null,varredura_concluida:false,total_lidos:0};}
 if(!atualizar&&state.varredura_concluida){console.log('Varredura inicial concluída. Para atualizar as SS recentes execute --atualizar.');return;}
 // Em --atualizar o cursor começa pelo maior ID possível; não altera o checkpoint do histórico.
 let cursor=atualizar?'9223372036854775807':checarNumero(state.ultimo_id_processado||'9223372036854775807');
 let lidos=0,salvos=0;
 for(let i=0;i<maxLotes;i++){
   const q=await pool.query({text:`WITH pagina AS MATERIALIZED (
     SELECT tsk_id,loc_id,tty_id,tsk_situation,tsk_insertdatehour
     FROM u45468.task WHERE tsk_id < $1::bigint ORDER BY tsk_id DESC LIMIT $2
    ) SELECT p.tsk_id,p.loc_id,p.tsk_situation AS situacao,p.tsk_insertdatehour AS registro_em,
      l.loc_integrationid AS ss,l.loc_city AS cidade,l.loc_neighborhood AS bairro,
      l.loc_street AS logradouro,l.loc_streetnumber AS numero,l.loc_streetnumbercompl AS complemento,
      tt.tty_description AS servico
    FROM pagina p LEFT JOIN u45468.local l ON l.loc_id=p.loc_id
    LEFT JOIN u45468.tasktype tt ON tt.tty_id=p.tty_id ORDER BY p.tsk_id DESC`,
    values:[cursor,LOTE],query_timeout:12000});
   const rows=q.rows;
   if(!rows.length){
     if(!atualizar){state.varredura_concluida=true;state.ultimo_id_processado=cursor;state.atualizado_em=new Date().toISOString();state.ultimo_erro=null;await supa('ss_duplicidades_controle?on_conflict=fonte',{method:'POST',body:state,headers:{Prefer:'resolution=merge-duplicates,return=minimal'}});}
     console.log('Fim do histórico disponível.');break;
   }
   cursor=String(rows[rows.length-1].tsk_id);
   const locs=[...new Set(rows.map(x=>x.loc_id).filter(Boolean))];
   const f=locs.length?await pool.query({text:`SELECT cfv_registerid AS loc_id,cfd_id,cfv_internalvalue AS valor
       FROM u45468.customfieldvalue WHERE cfv_registerid=ANY($1::bigint[]) AND cfd_id=ANY($2::bpchar[])`,
       values:[locs,[idCampo.matricula,idCampo.hidrometro]],query_timeout:12000}):{rows:[]};
   const byLoc=new Map();
   for(const x of f.rows){const id=String(x.loc_id),v=byLoc.get(id)||{}; if(x.cfd_id===idCampo.matricula)v.matricula=x.valor;
     if(x.cfd_id===idCampo.hidrometro)v.hidrometro=x.valor;byLoc.set(id,v);}
   const indices=rows.filter(x=>/^\d{2}\/\d{2}-\d{6}-\d{2}$/.test(String(x.ss||'')))
      .map(x=>normalizarRegistro({...x,...byLoc.get(String(x.loc_id))}));
   for(let start=0;start<indices.length;start+=80){await supa('ss_duplicidades_indice?on_conflict=tsk_id',{method:'POST',body:indices.slice(start,start+80),headers:{Prefer:'resolution=merge-duplicates,return=minimal'}});}
   lidos+=rows.length;salvos+=indices.length;
   if(!atualizar){state.ultimo_id_processado=cursor;state.total_lidos=Number(state.total_lidos||0)+rows.length;state.atualizado_em=new Date().toISOString();state.ultimo_erro=null;
     if(!state.maior_id_capturado)state.maior_id_capturado=String(rows[0].tsk_id);
     await supa('ss_duplicidades_controle?on_conflict=fonte',{method:'POST',body:state,headers:{Prefer:'resolution=merge-duplicates,return=minimal'}});
   }
   console.log(`Lote ${i+1} | tarefas ${rows.length} | SS ${indices.length} | cursor ${cursor}`);
   if(rows.length<LOTE){
     if(!atualizar){state.varredura_concluida=true;state.atualizado_em=new Date().toISOString();await supa('ss_duplicidades_controle?on_conflict=fonte',{method:'POST',body:state,headers:{Prefer:'resolution=merge-duplicates,return=minimal'}});}
     break;
   }
   await pausa(150);
 }
 if(atualizar){state.atualizado_em=new Date().toISOString();state.ultimo_erro=null;await supa('ss_duplicidades_controle?on_conflict=fonte',{method:'POST',body:state,headers:{Prefer:'resolution=merge-duplicates,return=minimal'}});}
 console.log(`Finalizado: ${lidos} tarefas lidas, ${salvos} SS armazenadas.`,atualizar?'Atualização recente.':'Varredura retomável.');
}
main().catch(e=>{console.error('Sincronização interrompida:',e.message);process.exitCode=1}).finally(()=>pool.end());
