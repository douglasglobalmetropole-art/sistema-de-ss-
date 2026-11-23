'use strict';
/* CGM_UMOV_MANUAL_V1
   Atualiza apenas campo situacao no uMov. Nao consulta, baixa ou rejeita no SISCOM.
*/
const SS = /^\d{2}\/\d{2}-\d{6}-\d{2}$/;
const STATUS = Object.freeze({Baixada:'baixad',Rejeitada:'rejeitad',Duplicada:'duplicad'});
const simplificar = v => String(v ?? '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const estadoIgual = (atual,solicitado) => simplificar(atual).startsWith(STATUS[solicitado]);
function validarItens(itens){
  if(!Array.isArray(itens)||itens.length<1||itens.length>25)throw Error('Selecione de 1 a 25 SS.');
  const saida = itens.map(item=>({ss:String(item?.ss||'').trim(),tarefa:Number(item?.tarefa)}));
  if(saida.some(item=>!SS.test(item.ss)||!Number.isSafeInteger(item.tarefa)||item.tarefa<=0))
    throw Error('Selecao contem SS ou tarefa invalida.');
  if(new Set(saida.map(x=>x.tarefa)).size!==saida.length)throw Error('Ha tarefas repetidas na selecao.');
  return saida;
}
function validarRegistros(itens,rows,status,cidades,normalizarCidade){
  const porId=new Map(rows.map(x=>[Number(x.tsk_id),x]));
  const permitidas=cidades?new Set(cidades.map(normalizarCidade)):null;
  for(const item of itens){
    const r=porId.get(item.tarefa);
    if(!r||String(r.ss||'').trim()!==item.ss)throw Error('SS ou tarefa divergente. Nenhuma alteracao enviada.');
    if(permitidas&&!permitidas.has(normalizarCidade(r.cidade||'')))throw Error('SS fora da divisao autorizada.');
    const situacao=simplificar(r.situacao_campo);
    const situacoes=status==='Baixada'?['retornada de campo']:['retornada de campo','pendente de envio para campo'];
    if(!situacoes.includes(situacao))throw Error('A SS '+item.ss+' nao esta em situacao de campo permitida para esta operacao manual.');
    const atual=String(r.status_integracao||'').trim();
    if(atual&&!estadoIgual(atual,status))throw Error('A SS '+item.ss+' ja possui status de integracao '+atual+'. Nenhuma alteracao enviada.');
  }
  return porId;
}
const SQL=`SELECT t.tsk_id,l.loc_integrationid AS ss,l.loc_city AS cidade,
  COALESCE(NULLIF(TRIM(d.tsk_situation),''),t.tsk_situation,'') AS situacao_campo,
  COALESCE(NULLIF(TRIM((SELECT COALESCE(NULLIF(TRIM(ce.cev_description::text),''),
  NULLIF(TRIM(v.cfv_externalvalue::text),''),NULLIF(TRIM(v.cfv_internalvalue::text),''),'')
  FROM u45468.customfieldvalue v JOIN u45468.customfield cf ON cf.cfd_id=v.cfd_id
  LEFT JOIN u45468.customentityvalue ce ON ce.cev_id=CASE WHEN v.cfv_internalvalue ~ '^[0-9]{1,18}$'
  THEN v.cfv_internalvalue::bigint ELSE NULL END
  WHERE v.cfv_registerid=t.tsk_id AND LOWER(TRIM(cf.cfd_integrationid))='situacao'
  AND LOWER(TRIM(cf.cfd_table))='task' LIMIT 1)),''),NULLIF(TRIM(d.e_situacao),''),'') AS status_integracao
  FROM u45468.task t JOIN u45468.local l ON l.loc_id=t.loc_id
  LEFT JOIN u45468.dbout_task d ON d.tsk_id=t.tsk_id
  WHERE t.tsk_id=ANY($1::bigint[])`;
function registrar(app,{pool,autorizado,podeEscrever,origemOk,postUmovXml,identificadorSituacao,xmlEscape,cidadesPermitidas,normalizarCidade}){
  const autenticado=(req,res,escrita)=>{
    if(!autorizado(req)) {res.status(401).json({ok:false,error:'Faça login no sistema para atualizar o uMov.'});return false;}
    if(escrita&&!podeEscrever(req)){res.status(403).json({ok:false,error:'Sem permissao para alterar status no uMov.'});return false;}
    if(!origemOk(req)){res.status(403).json({ok:false,error:'Origem nao autorizada.'});return false;}
    return true;
  };
  async function buscar(itens){
    const q=await pool.query({text:SQL,values:[itens.map(x=>x.tarefa)],query_timeout:9000});
    return q.rows;
  }
  app.post('/api/umov/manual-status',async(req,res)=>{
    res.set('Cache-Control','no-store');
    if(!autenticado(req,res,true))return;
    const status=String(req.body?.status||'').trim();
    if(!Object.prototype.hasOwnProperty.call(STATUS,status))return res.status(400).json({ok:false,error:'Escolha Baixada, Rejeitada ou Duplicada.'});
    if(req.body?.processo!=='MANUAL_UMOV'||req.body?.confirmacao!=='CONFIRMAR STATUS UMOV')
      return res.status(400).json({ok:false,error:'Confirme expressamente a operacao manual uMov.'});
    let itens;
    try{itens=validarItens(req.body?.itens)}catch(e){return res.status(400).json({ok:false,error:e.message});}
    try{
      const rows=await buscar(itens);
      const porId=validarRegistros(itens,rows,status,cidadesPermitidas(req),normalizarCidade);
      const resultados=[];
      for(const item of itens){
        const atual=String(porId.get(item.tarefa).status_integracao||'').trim();
        if(estadoIgual(atual,status)){resultados.push({...item,ok:true,ja_aplicado:true,estado:'Ja consta no uMov'});continue;}
        try{
          const valor=xmlEscape(identificadorSituacao(status));
          await postUmovXml('schedule',item.tarefa,`<schedule><customFields><situacao><alternativeIdentifier>${valor}</alternativeIdentifier></situacao></customFields></schedule>`);
          resultados.push({...item,ok:true,confirmado:false,estado:'Enviado ao uMov; aguardando sincronizacao'});
        }catch(e){resultados.push({...item,ok:false,error:String(e.message||e).slice(0,260)});}
      }
      const sucesso=resultados.filter(x=>x.ok).length, falhas=resultados.length-sucesso;
      console.info('[CGM_UMOV_MANUAL_V1]',JSON.stringify({status,sucesso,falhas,divisao:req.divisaoSS?.codigo||'geral'}));
      return res.status(falhas?(sucesso?207:502):200).json({ok:falhas===0,processo:'MANUAL_UMOV',status,sucesso,falhas,resultados,
        aviso:'Somente status de integracao no uMov. Nenhum evento de baixa ou rejeicao SISCOM foi consultado ou executado.'});
    }catch(e){
      const validacao=/SS ou tarefa|fora da divisao|ja possui status|situacao de campo/.test(e.message);
      return res.status(validacao?409:503).json({ok:false,error:validacao?e.message:'Falha ao validar as SS antes do envio ao uMov. Nenhuma alteracao solicitada.'});
    }
  });
  app.post('/api/umov/manual-status/conferir',async(req,res)=>{
    res.set('Cache-Control','no-store');
    if(!autenticado(req,res,false))return;
    const status=String(req.body?.status||'').trim();
    if(!Object.prototype.hasOwnProperty.call(STATUS,status))return res.status(400).json({ok:false,error:'Status invalido.'});
    let itens;
    try{itens=validarItens(req.body?.itens)}catch(e){return res.status(400).json({ok:false,error:e.message});}
    try{
      const rows=await buscar(itens);
      const porId=new Map(rows.map(x=>[Number(x.tsk_id),x]));
      const cidades=cidadesPermitidas(req),permitidas=cidades?new Set(cidades.map(normalizarCidade)):null;
      if(itens.some(item=>{
        const r=porId.get(item.tarefa);
        return !r||String(r.ss||'').trim()!==item.ss||(permitidas&&!permitidas.has(normalizarCidade(r.cidade||'')));
      }))return res.status(403).json({ok:false,error:'Selecao nao autorizada ou SS divergente.'});
      const resultados=itens.map(item=>{const atual=String(porId.get(item.tarefa).status_integracao||'').trim();return {...item,status_integracao:atual,confirmado:estadoIgual(atual,status)};});
      return res.json({ok:true,processo:'MANUAL_UMOV',status,resultados,confirmadas:resultados.filter(x=>x.confirmado).length});
    }catch(e){return res.status(503).json({ok:false,error:'Falha ao conferir o status no uMov.'});}
  });
}
module.exports={registrar,validarItens,validarRegistros,estadoIgual,SQL};
