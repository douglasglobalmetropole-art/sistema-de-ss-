require("dotenv").config();
const fs=require("node:fs");
const crypto=require("node:crypto");

const { createClient } = require("@supabase/supabase-js");

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;

if (!url || !key || key === "COLE_SUA_CHAVE_SECRETA_AQUI") {
  console.error("Configure o arquivo .env primeiro.");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});


// SISCOM individual: token só na memoria deste processo, nunca na fila Supabase.
const individualSessions=new Map();
const signingSecret=process.env.SISCOM_GATEWAY_SIGNING_SECRET||'';
const MAX_SESSION_MS=4*60*60*1000;
function siscomCanonical(value){
 if(Array.isArray(value))return '['+value.map(siscomCanonical).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+siscomCanonical(value[k])).join(',')+'}';
 return JSON.stringify(value);
}
function verifySignedTask(tarefa){
 const auth=tarefa.payload?.__siscom_identity;
 if(!auth)return null;
 if(signingSecret.length<32||!/^[0-9a-f]{64}$/.test(String(auth.sid||'')))throw Error('Sessao individual invalida');
 const exp=Number(auth.exp);
 if(!Number.isSafeInteger(exp)||exp<Date.now()||exp>Date.now()+180000)throw Error('Assinatura de tarefa expirada');
 const {__siscom_identity, ...payload}=tarefa.payload;
 const mac=crypto.createHmac('sha256',signingSecret).update(siscomCanonical({operation:tarefa.operation,sid:auth.sid,exp,payload})).digest('hex');
 if(!/^[0-9a-f]{64}$/.test(String(auth.mac||''))||!crypto.timingSafeEqual(Buffer.from(auth.mac,'hex'),Buffer.from(mac,'hex')))throw Error('Assinatura de tarefa invalida');
 return auth.sid;
}
function tokenFor(tarefa){
 const sid=verifySignedTask(tarefa);
 if(sid){
  const entry=individualSessions.get(sid);
  if(!entry||entry.expires<=Date.now()){
   individualSessions.delete(sid);
   throw Error('Sessao SISCOM expirada ou worker reiniciado. Faca login novamente.');
  }
  return entry.token;
 }
 if(process.env.SISCOM_REQUIRE_INDIVIDUAL==='true')throw Error('Login SISCOM individual obrigatorio');
 const token=process.env.SISCOM_ACCESS_TOKEN;
 if(!token)throw Error('SISCOM_ACCESS_TOKEN ausente. Faca login individual.');
 return token;
}
function decryptLoginEnvelope(envelope){
 const p=process.env.SISCOM_AUTH_PRIVATE_KEY_FILE;
 if(!p||!fs.existsSync(p))throw Error('Chave privada SISCOM nao configurada no worker');
 if(!envelope||!['key','iv','tag','data'].every(k=>typeof envelope[k]==='string'&&envelope[k].length>0))throw Error('Envelope de login incompleto');
 const privateKey=fs.readFileSync(p,'utf8');
 const key=crypto.privateDecrypt({key:privateKey,oaepHash:'sha256',padding:crypto.constants.RSA_PKCS1_OAEP_PADDING},Buffer.from(envelope.key,'base64'));
 try{
  const decipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(envelope.iv,'base64'));
  decipher.setAuthTag(Buffer.from(envelope.tag,'base64'));
  const plain=Buffer.concat([decipher.update(Buffer.from(envelope.data,'base64')),decipher.final()]);
  try{return JSON.parse(plain.toString('utf8'))}finally{plain.fill(0)}
 }finally{key.fill(0)}
}
function jwtExpiry(jwt){
 try{const parts=String(jwt).split('.');return Number(JSON.parse(Buffer.from(parts[1],'base64url').toString()).exp)*1000||0}catch{return 0}
}

// === Rejeição SISCOM: validação oficial, envio único, confirmação por evento novo ===
const REJ_BASE='https://siscom-backend.sistemas.cesan.com.br:9102/backend-servico';
const REJ_SS=/^(\d{2})\/(\d{2})-(\d{6})-(\d{2})$/;
function rejeicaoPartes(numero){
 const m=REJ_SS.exec(String(numero||''));if(!m)throw Error('Número de SS inválido para rejeição');
 return {numero,compacto:m[1]+m[2]+m[3]+m[4],ref:Number('20'+m[2]+m[1]),cod:Number(m[3]),seq:Number(m[4]),refStr:m[1]+'/'+m[2],codStr:m[3],seqStr:m[4]};
}
async function rejeicaoJson(url,token){
 const r=await fetch(url,{method:'GET',headers:{Authorization:'Bearer '+token,Accept:'application/json',Origin:'https://siscom.sistemas.cesan.com.br'},signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw Error('Consulta oficial de rejeição HTTP '+r.status);
 const txt=await r.text();if(!txt)return null;
 try{return JSON.parse(txt)}catch{throw Error('Resposta de rejeição fora do formato JSON')}
}
function rejeicaoLista(data){return Array.isArray(data)?data:Array.isArray(data?.content)?data.content:Array.isArray(data?.data)?data.data:[]}
function rejeicaoValida(data){
 if(data===false||data?.valido===false||data?.valida===false||data?.valid===false||data?.sucesso===false)return false;
 return true;
}
async function consultarRejeicao(token,numero){
 const parts=rejeicaoPartes(numero),base=REJ_BASE+'/rejeicaoSolicitacaoServico';
 const valida=await rejeicaoJson(base+'/validaSS/'+parts.compacto,token);
 if(!rejeicaoValida(valida))throw Error('SISCOM informa que esta SS não pode ser rejeitada');
 const qs=new URLSearchParams({page:'0',size:'25',sort:'ssFormatada,ASC',listCodigoSS:parts.compacto});
 const registros=rejeicaoLista(await rejeicaoJson(base+'?'+qs,token));
 const row=registros.find(x=>String(x?.ssFormatada||'').trim()===numero);
 if(!row)throw Error('SS não encontrada na listagem oficial de rejeição');
 const executor=Number(row.unidadeExecutoraResumidaDTO?.cdExecutor);
 if(Number(row.refAtendimento)!==parts.ref||Number(row.codAtendimento)!==parts.cod||Number(row.seqSS)!==parts.seq||!Number.isSafeInteger(executor)||executor<1||!Number.isSafeInteger(Number(row.codigoMacro))||Number(row.codigoMacro)<1)throw Error('Identidade ou executor da SS divergente no SISCOM');
 const registro={codAtendimento:row.codAtendimento,codigoMacro:row.codigoMacro,codigoSSAnterior:row.codigoSSAnterior??null,descricaoMacro:row.descricaoMacro,endereco:row.endereco,refAtendimento:row.refAtendimento,seqSS:row.seqSS,ssFormatada:row.ssFormatada,unidadeExecutoraResumidaDTO:row.unidadeExecutoraResumidaDTO};
 return {registro,executor,resumo:{numero_ss:numero,executor,unidade:String(row.unidadeExecutoraResumidaDTO?.dcExecutor||'').slice(0,140),macro:Number(row.codigoMacro),descricao_macro:String(row.descricaoMacro||'').slice(0,180),validada:true}};
}
async function eventosRejeicao(token,numero){
 const p=rejeicaoPartes(numero),url=new URL(REJ_BASE+'/solicitacaoServicoDados/evento');
 url.searchParams.set('refAtendimento',p.refStr);url.searchParams.set('codAtendimento',p.codStr);url.searchParams.set('ssSequencial',p.seqStr);
 const data=await rejeicaoJson(url,token);
 if(!Array.isArray(data))throw Error('Histórico SISCOM indisponível para verificar rejeição');
 return data;
}
function ehEventoRejeicao(e){return Number(e?.tipoEventoDTO?.id)===4||/^rejei(?:ç|c)[aã]o/i.test(String(e?.tipoEventoDTO?.descricao||''))}

let ocupado = false;

async function processar() {
  if (ocupado) return;
  for(const [id,s] of individualSessions)if(s.expires<Date.now())individualSessions.delete(id);
  ocupado = true;

  let tarefaAtual = null;
  try {
    const { data: tarefas, error } = await supabase
      .from("siscom_gateway_jobs")
      .select("id, operation, payload")
      .eq("status", "pendente")
      .order("created_at", { ascending: true })
      .limit(1);

    if (error) throw error;

    if (!tarefas || tarefas.length === 0) return;

    const tarefa = tarefas[0];
    tarefaAtual = tarefa;
    let tarefaReservada = false;

    const { data: reservada, error: erroReserva } = await supabase
      .from("siscom_gateway_jobs")
      .update({
        status: "processando",
        started_at: new Date().toISOString()
      })
      .eq("id", tarefa.id)
      .eq("status", "pendente")
      .select("id");

    if (erroReserva) throw erroReserva;
    if (!reservada || reservada.length === 0) return;

    tarefaReservada = true;
    console.log("Processando:", tarefa.id);

    let resultado;
    if (tarefa.operation === "siscom_login_individual") {
      const sid=verifySignedTask(tarefa);
      if(!sid)throw Error('Login sem assinatura do backend');
      const creds=decryptLoginEnvelope(tarefa.payload?.envelope);
      if(!/^[a-zA-Z0-9_.@-]{2,80}$/.test(String(creds.login||''))||!/^[a-zA-Z0-9+/=]{4,344}$/.test(String(creds.password||'')))throw Error('Credenciais fora do formato');
      const r=await fetch('https://siscom-backend.sistemas.cesan.com.br:9102/backend-seguranca/ad',{
       method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},
       body:JSON.stringify({login:creds.login,password:creds.password}),signal:AbortSignal.timeout(20000)
      });
      if(!r.ok)throw Error('Credenciais SISCOM rejeitadas (HTTP '+r.status+')');
      let dados;
      try{dados=await r.json()}catch{throw Error('Resposta da autenticacao SISCOM em formato inesperado')}
      if(!dados.accessToken||!dados.idUsuario||!dados.nome)throw Error('Autenticacao SISCOM sem identidade completa');
      const exp=jwtExpiry(dados.accessToken);
      if(exp<=Date.now()+30000)throw Error('Token SISCOM ja expirado');
      individualSessions.set(sid,{token:dados.accessToken,expires:Math.min(exp,Date.now()+MAX_SESSION_MS),idUsuario:dados.idUsuario,nome:dados.nome});
      resultado={idUsuario:dados.idUsuario,nome:String(dados.nome).slice(0,120),login:String(creds.login).slice(0,80)};
    } else if (tarefa.operation === "siscom_logout_individual") {
      const sid=verifySignedTask(tarefa);if(!sid)throw Error('Logout nao assinado');
      individualSessions.delete(sid);
      resultado={ok:true};
    } else if (tarefa.operation === "healthcheck") {
      if(tarefa.payload?.__siscom_identity)verifySignedTask(tarefa);
      resultado = {
      gateway: "SISCOM-GLOBAL",
      status: "online",
      computador: process.platform,
      timestamp: new Date().toISOString()
      };
    } else if (tarefa.operation === "consultar_ss") {
      const numero = String(tarefa.payload?.numero_ss || "").trim();
      const match = /^(\d{2}\/\d{2})-(\d{6})-(\d{2})$/.exec(numero);
      if (!match) throw new Error("Formato de SS inválido");
      const token = tokenFor(tarefa);
      if (!token) throw new Error("SISCOM_ACCESS_TOKEN não configurado no Windows");
      const endpoint = new URL("https://siscom-backend.sistemas.cesan.com.br:9102/backend-servico/solicitacaoServicoDados");
      endpoint.searchParams.set("refAtendimento",match[1]);
      endpoint.searchParams.set("codAtendimento",match[2]);
      endpoint.searchParams.set("ssSequencial",match[3]);
      const resposta = await fetch(endpoint, {headers:{Authorization:`Bearer ${token}`,Accept:"application/json"},signal:AbortSignal.timeout(15000)});
      if (!resposta.ok) throw new Error(`SISCOM HTTP ${resposta.status}`);
      const dados = await resposta.json();
      // Retornar somente informações operacionais, evitando CPF, telefone, e-mail, endereço e token.
      resultado = {
        numero_ss:numero,
        localidade:dados.localidade ?? null,
        bairro:dados.bairro ?? null,
        instrucaoExecutar:dados.instrucaoExecutar ?? null,
        dataHoraRegistro:dados.dataHoraRegistro ?? null,
        dataHoraExecucaoIni:dados.dataHoraExecucaoIni ?? null,
        dataHoraExecucaoFim:dados.dataHoraExecucaoFim ?? null
      };
    } else if (tarefa.operation === "consultar_ss_baixa") {
      const numero = String(tarefa.payload?.numero_ss || "").trim();
      const match = /^(\d{2}\/\d{2})-(\d{6})-(\d{2})$/.exec(numero);
      if (!match) throw new Error("Formato de SS inválido");
      const token = tokenFor(tarefa);
      if (!token) throw new Error("SISCOM_ACCESS_TOKEN não configurado no Windows");
      const endpoint = new URL("https://siscom-backend.sistemas.cesan.com.br:9102/backend-servico/baixarSolicitacaoServico/consultarSolicitacaoServico");
      endpoint.searchParams.set("refAtendimento", match[1]);
      endpoint.searchParams.set("codAtendimento", match[2]);
      endpoint.searchParams.set("ssSequencial", match[3]);
      const resposta = await fetch(endpoint, {method:"GET",headers:{Authorization:`Bearer ${token}`,Accept:"application/json"},signal:AbortSignal.timeout(20000)});
      if (!resposta.ok) throw new Error(`SISCOM baixa consulta HTTP ${resposta.status}`);
      const dados = await resposta.json();
      if (!dados || typeof dados !== "object" || Array.isArray(dados))
        throw new Error("Consulta oficial da baixa retornou formato inesperado");
      if (!dados.servicoMacroDTO?.cdServico)
        throw new Error("SISCOM não retornou servicoMacroDTO.cdServico para esta SS");
      // Somente dados estritamente necessários ao formulário. Não persistir resposta bruta.
      resultado = {
        numero_ss:numero,
        servicoMacroDTO: dados.servicoMacroDTO ? {cdServico:dados.servicoMacroDTO.cdServico,dcServico:dados.servicoMacroDTO.dcServico} : null,
        unidadeExecutoraDTO: dados.unidadeExecutoraDTO ? {cdExecutor:dados.unidadeExecutoraDTO.cdExecutor,cdUnidadeExecutora:dados.unidadeExecutoraDTO.cdUnidadeExecutora} : null,
        codEquipe: dados.codEquipe ?? null,
        dataHoraExecucaoIni: dados.dataHoraExecucaoIni ?? null,
        dataHoraExecucaoFim: dados.dataHoraExecucaoFim ?? null,
        descricaoExecucao: dados.descricaoExecucao ?? null,
        ultSS: dados.ultSS ?? null
      };
    } else if (tarefa.operation === "baixar_ss_real") {
      if(tarefa.payload?.__siscom_identity&&process.env.SISCOM_INDIVIDUAL_WRITE_ENABLED!=='true')throw Error('Baixa individual desabilitada para testes');
      const p=tarefa.payload||{},numero=String(p.numero_ss||'');
      const m=/^(\d{2})\/(\d{2})-(\d{6})-(\d{2})$/.exec(numero);
      if(!m)throw Error('SS inválida');
      if(numero==='10/26-032766-01')throw Error('SS de referência já encerrada: envio bloqueado');
      const token=tokenFor(tarefa);
      if(!token)throw Error('Token SISCOM ausente');
      const endpoint=new URL('https://siscom-backend.sistemas.cesan.com.br:9102/backend-servico/baixarSolicitacaoServico/consultarSolicitacaoServico');
      endpoint.searchParams.set('refAtendimento',m[1]+'/'+m[2]);endpoint.searchParams.set('codAtendimento',m[3]);endpoint.searchParams.set('ssSequencial',m[4]);
      const headers={Authorization:`Bearer ${token}`,Accept:'application/json'};
      const get=async()=>{const r=await fetch(endpoint,{headers,signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Consulta oficial HTTP '+r.status);return r.json();};
      const d=await get();
      if(d.ssFormatada!==numero)throw Error('Identidade da SS divergente');
      if(Number(d.dataBaixa)>0||d.dataHoraBaixa)throw Error('SS já baixada: envio bloqueado');
      if(Number(d.unidadeExecutoraDTO?.cdExecutor)!==Number(p.executor)||Number(d.servicoMacroDTO?.cdServico)!==Number(p.macro))throw Error('Executor ou macro divergente do SISCOM');
      const parse=v=>{const m=/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/.exec(String(v));if(!m)throw Error('Data inválida');const x=new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:00`);if(!Number.isFinite(x.getTime())||x.getDate()!==Number(m[1]))throw Error('Data inválida');return x;};
      const ini=parse(p.inicio),fim=parse(p.fim);if(fim<ini)throw Error('Fim anterior ao início');
      const eq=await fetch(`https://siscom-backend.sistemas.cesan.com.br:9102/backend-servico/baixarSolicitacaoServico/listarEquipeIntegrante/${Number(p.executor)}`,{headers,signal:AbortSignal.timeout(20000)});
      if(!eq.ok)throw Error('Falha ao validar equipe');const eqs=await eq.json();if(!Array.isArray(eqs)||!eqs.some(e=>Number(e.cdEquipe)===Number(p.equipe)))throw Error('Equipe não pertence ao executor');
      const mi=await fetch(`https://siscom-backend.sistemas.cesan.com.br:9102/backend-servico/baixarSolicitacaoServico/listarServicoMicro/${Number(p.macro)}`,{headers,signal:AbortSignal.timeout(20000)});
      if(!mi.ok)throw Error('Falha ao validar serviço');const micros=await mi.json();const micro=micros.find(x=>Number(x.cdServico)===Number(p.micro));if(!micro)throw Error('Micro incompatível');
      if(['S','SIM','TRUE','1'].includes(String(micro.obgCausaProbl||'').toUpperCase())&&!p.causa)throw Error('Causa obrigatória');
      d.codEquipe=Number(p.equipe);d.codServicoExec=Number(p.micro);d.ultSS=p.ultima_ss;
      d.dataHoraExecucaoIni=`${ini.getFullYear()}-${String(ini.getMonth()+1).padStart(2,'0')}-${String(ini.getDate()).padStart(2,'0')}T${String(ini.getHours()).padStart(2,'0')}:${String(ini.getMinutes()).padStart(2,'0')}:00`;
      d.dataHoraExecucaoFim=`${fim.getFullYear()}-${String(fim.getMonth()+1).padStart(2,'0')}-${String(fim.getDate()).padStart(2,'0')}T${String(fim.getHours()).padStart(2,'0')}:${String(fim.getMinutes()).padStart(2,'0')}:00`;
      d.descricaoExecucao=String(p.descricao);
      if(p.causa)d.tipoCausaProblema={id:Number(p.causa)};
      // Extrai somente mensagens de validação conhecidas; nunca persiste resposta bruta,
      // dados pessoais, credenciais ou o corpo completo da SS.
      const diagnosticoSeguro = (texto) => {
        let dados;
        try { dados = JSON.parse(texto); } catch { return null; }
        if (!dados || typeof dados !== 'object' || Array.isArray(dados)) return null;
        const chaves = ['message', 'mensagem', 'detail', 'detalhe', 'title', 'error', 'erro'];
        const mensagens = [];
        const adicionar = (valor) => {
          if (typeof valor !== 'string') return;
          const limpa = valor.replace(/[\r\n\t]+/g, ' ').trim();
          if (!limpa || limpa.length > 300) return;
          // Evita persistir mensagens contendo credenciais, documentos ou dados pessoais.
          if (/bearer|token|authorization|senha|password|cpf|cnpj|e-mail|email|telefone|https?:\/\//i.test(limpa)) return;
          if (/\b\d{11,}\b/.test(limpa)) return;
          mensagens.push(limpa);
        };
        for (const chave of chaves) adicionar(dados[chave]);
        // Formato de erros de validação por campo, sem copiar os valores enviados.
        if (dados.errors && typeof dados.errors === 'object' && !Array.isArray(dados.errors)) {
          for (const [campo, mensagensCampo] of Object.entries(dados.errors).slice(0, 8)) {
            if (!/^[a-zA-Z][a-zA-Z0-9_.]{0,60}$/.test(campo)) continue;
            for (const item of (Array.isArray(mensagensCampo) ? mensagensCampo : [mensagensCampo]).slice(0, 2)) {
              if (typeof item !== 'string' || item.length > 180) continue;
              const antes = mensagens.length;
              adicionar(item);
              if (mensagens.length > antes) mensagens[mensagens.length - 1] = `${campo}: ${mensagens.at(-1)}`;
            }
          }
        }
        return mensagens.slice(0, 5).join(' | ').slice(0, 700) || null;
      };
      // Não repetir POST automaticamente, mesmo se houver timeout ou erro de rede.
      let r;try{r=await fetch('https://siscom-backend.sistemas.cesan.com.br:9102/backend-servico/baixarSolicitacaoServico/',{method:'POST',headers:{...headers,'Content-Type':'application/json',Origin:'https://siscom.sistemas.cesan.com.br'},body:JSON.stringify(d),signal:AbortSignal.timeout(30000)});}catch(e){resultado={numero_ss:numero,status_baixa:'INCERTO',mensagem:'POST pode ter sido recebido. NÃO reenviar. Verifique o SISCOM manualmente.'};}
      if(r){const raw=(await r.text()).slice(0,1500);if(!r.ok){resultado={numero_ss:numero,status_baixa:'INCERTO',http_status:r.status,diagnostico_validacao:diagnosticoSeguro(raw),mensagem:'SISCOM não confirmou. Não reenviar sem verificar a situação.'};}else{try{const depois=await get();resultado={numero_ss:numero,status_baixa:Number(depois.dataBaixa)>0?'CONFIRMADA':'INCERTO',dataBaixa:depois.dataBaixa??null,mensagem:Number(depois.dataBaixa)>0?'Baixa confirmada por consulta oficial':'POST retornou sucesso, mas encerramento ainda não confirmado. Não reenviar.'};}catch(e){resultado={numero_ss:numero,status_baixa:'INCERTO',mensagem:'POST respondeu, mas falhou a verificação. Não reenviar.'};}}}
    } else if (["listar_areas_complementar","listar_servicos_complementar","consultar_complementares_ss","criar_ss_complementar"].includes(tarefa.operation)) {
      const op=tarefa.operation,p=tarefa.payload||{},numero=String(p.numero_ss||'').trim();
      if(op==='criar_ss_complementar'&&p.__siscom_identity&&process.env.SISCOM_INDIVIDUAL_WRITE_ENABLED!=='true')throw Error('Criacao individual desabilitada para testes');
      const m=/^(\d{2}\/\d{2})-(\d{6})-(\d{2})$/.exec(numero);
      if(!m)throw Error('SS complementar inválida');
      const token=tokenFor(tarefa);
      if(!token)throw Error('Token SISCOM não configurado');
      const base='https://siscom-backend.sistemas.cesan.com.br:9102/backend-servico/solicitacaoServicoComplementar';
      const headers={Authorization:`Bearer ${token}`,Accept:'application/json'};
      const params=new URLSearchParams({refAtendimento:m[1],codAtendimento:m[2],ssSequencial:m[3]});
      const getJson=async(url)=>{const r=await fetch(url,{headers,signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Consulta complementar HTTP '+r.status);return r.json();};
      const lista=v=>Array.isArray(v)?v:Array.isArray(v?.content)?v.content:Array.isArray(v?.data)?v.data:[];
      const consultar=async()=>lista(await getJson(base+'?'+params+'&size=100&sort=id,DESC'));
      const areaValida=v=>Number.isSafeInteger(Number(v))&&Number(v)>0;
      if(op==='listar_areas_complementar'){
        resultado=lista(await getJson(base+'/listaAreaProcesso')).filter(x=>areaValida(x?.codAraeExecutora)).map(x=>({codAraeExecutora:Number(x.codAraeExecutora),descricaoAreaExecutora:String(x.descricaoAreaExecutora||'').slice(0,150)}));
      }else if(op==='consultar_complementares_ss'){
        const rows=await consultar();
        resultado=rows.map(x=>({id:x.id??null,seqSSOrigem:x.seqSSOrigem??null,servico:x.servico?.cdServico??null,observacao:String(x.observacao||'').slice(0,1000),area:x.areaProcesso?.codAraeExecutora??null}));
      }else{
        if(!areaValida(p.area))throw Error('Área inválida');
        const areas=lista(await getJson(base+'/listaAreaProcesso'));
        const area=areas.find(x=>Number(x.codAraeExecutora)===Number(p.area));
        if(!area)throw Error('Área não encontrada no catálogo SISCOM');
        const servParams=new URLSearchParams({codAraeExecutora:String(p.area),refAtendimento:m[1],codAtendimento:m[2],ssSequencial:m[3]});
        const servicos=lista(await getJson(base+'/listaServicos?'+servParams));
        if(op==='listar_servicos_complementar'){
          resultado=servicos.filter(x=>areaValida(x?.cdServico)).map(x=>({cdServico:Number(x.cdServico),dcServico:String(x.dcServico||'').slice(0,200)}));
        }else{
          if(!areaValida(p.macro)||typeof p.descricao!=='string'||!p.descricao.trim()||p.descricao.length>1000)throw Error('Dados da complementar inválidos');
          const servico=servicos.find(x=>Number(x.cdServico)===Number(p.macro));
          if(!servico)throw Error('Serviço macro incompatível com área selecionada');
          // Consulta antes do POST. Nenhuma repetição automática, inclusive em caso de timeout.
          const anteriores=await consultar();
          const igual=x=>Number(x.areaProcesso?.codAraeExecutora)===Number(p.area)&&Number(x.servico?.cdServico)===Number(p.macro)&&String(x.observacao||'').trim()===p.descricao.trim();
          if(anteriores.some(igual)){
            resultado={numero_ss:numero,status_complementar:'JA_EXISTE',mensagem:'Complementar com mesmos dados já encontrada. Nenhum POST enviado.'};
          }else{
            const confirmarUrl=new URL(base+'/retornarDadosPopupConfirmarSS');
            confirmarUrl.searchParams.set('codAtendimento',m[2]);confirmarUrl.searchParams.set('refAtendimento',m[1]);confirmarUrl.searchParams.set('ssSequencial',m[3]);confirmarUrl.searchParams.set('servicoMacro',String(p.macro));
            await getJson(confirmarUrl);
            const body={codAtendimento:m[2],refAtendimento:m[1],seqSSOrigem:m[3],areaProcesso:area,servico,retrabalho:false,observacao:p.descricao.trim(),proconJudicialOuvidoria:'N',semOnus:'N'};
            let response;
            try{response=await fetch(base,{method:'POST',headers:{...headers,'Content-Type':'application/json',Origin:'https://siscom.sistemas.cesan.com.br'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});}
            catch(e){resultado={numero_ss:numero,status_complementar:'INCERTO',mensagem:'Envio pode ter sido recebido. NÃO reenviar sem verificar o SISCOM.'};}
            if(response){
              if(!response.ok){resultado={numero_ss:numero,status_complementar:'INCERTO',http_status:response.status,mensagem:'SISCOM não confirmou a criação. NÃO reenviar sem verificar.'};}
              else{try{const depois=await consultar();resultado={numero_ss:numero,status_complementar:depois.some(igual)?'CONFIRMADA':'INCERTO',mensagem:depois.some(igual)?'Complementar confirmada na consulta oficial.':'POST respondeu com sucesso, mas a complementar não foi identificada. NÃO reenviar.'};}
              catch(e){resultado={numero_ss:numero,status_complementar:'INCERTO',mensagem:'POST respondeu, mas falhou a verificação. NÃO reenviar.'};}}
            }
          }
        }
      }
    } else if (tarefa.operation === 'validar_ss_rejeicao') {
      if(!verifySignedTask(tarefa))throw Error('Consulta de rejeição exige login individual SISCOM');
      const token=tokenFor(tarefa),numero=String(tarefa.payload?.numero_ss||'').trim();
      const {resumo}=await consultarRejeicao(token,numero);
      resultado=resumo;
    } else if (tarefa.operation === 'rejeitar_ss_real') {
      if(!verifySignedTask(tarefa))throw Error('Rejeição exige login individual SISCOM');
      if(process.env.SISCOM_INDIVIDUAL_WRITE_ENABLED!=='true'||process.env.SISCOM_REJEICAO_WRITE_ENABLED!=='true')throw Error('Rejeição individual desabilitada no worker');
      const p=tarefa.payload||{},numero=String(p.numero_ss||'').trim();
      if(p.motivo!=='NAO_EXECUCAO')throw Error('Somente Não Execução possui payload oficial confirmado');
      const equipe=Number(p.equipe),inicio=String(p.inicio||''),fim=String(p.fim||''),observacao=String(p.observacao||'').trim();
      if(!Number.isSafeInteger(equipe)||equipe<1||equipe>99999999||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(inicio)||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(fim)||!Number.isFinite(Date.parse(inicio))||!Number.isFinite(Date.parse(fim))||Date.parse(fim)<Date.parse(inicio)||!observacao||observacao.length>1000)throw Error('Dados da rejeição inválidos');
      const token=tokenFor(tarefa);
      const {registro,executor}=await consultarRejeicao(token,numero);
      const equipes=rejeicaoLista(await rejeicaoJson(REJ_BASE+'/baixarSolicitacaoServico/listarEquipeIntegrante/'+executor,token));
      if(!equipes.some(x=>Number(x?.cdEquipe)===equipe))throw Error('Equipe não pertence à unidade executora oficial');
      const anteriores=await eventosRejeicao(token,numero);
      if(anteriores.some(ehEventoRejeicao))throw Error('Rejeição já registrada no histórico SISCOM; envio bloqueado');
      const body={flagModoRejeicao:false,cdEquipe:equipe,dataInicioExecucao:inicio,dataFimExecucao:fim,observacao,
        motivoNaoExecucaoDTO:{id:44,descricao:'NÃO EXECUTADO',maint:'A',dataHoraExclusao:null},
        listSolicitacaoServicoRejeitoDTO:[registro]};
      // PUT não é repetido, mesmo em caso de timeout ou conexão encerrada.
      let response;
      try{response=await fetch(REJ_BASE+'/rejeicaoSolicitacaoServico',{
        method:'PUT',headers:{Authorization:'Bearer '+token,Accept:'application/json','Content-Type':'application/json',Origin:'https://siscom.sistemas.cesan.com.br'},
        body:JSON.stringify(body),signal:AbortSignal.timeout(30000)
      });}catch(e){resultado={numero_ss:numero,status_rejeicao:'INCERTO',mensagem:'PUT pode ter sido recebido. NÃO reenviar sem verificar no SISCOM.'};}
      if(response){
        if(!response.ok){resultado={numero_ss:numero,status_rejeicao:'INCERTO',http_status:response.status,mensagem:'SISCOM não confirmou a rejeição. NÃO reenviar sem verificar.'};}
        else{
          let confirmado=false;
          try{
            const vistos=new Set(anteriores.filter(ehEventoRejeicao).map(e=>JSON.stringify([e.id,e.dataHoraEvento,e.tipoEventoDTO?.id])));
            for(let tentativa=0;tentativa<3;tentativa++){
              if(tentativa)await new Promise(resolve=>setTimeout(resolve,1400));
              const depois=await eventosRejeicao(token,numero);
              if(depois.some(e=>ehEventoRejeicao(e)&&!vistos.has(JSON.stringify([e.id,e.dataHoraEvento,e.tipoEventoDTO?.id])))){confirmado=true;break;}
            }
          }catch(e){/* envio único: verificação posterior poderá ser manual */}
          resultado={numero_ss:numero,status_rejeicao:confirmado?'CONFIRMADA':'INCERTO',mensagem:confirmado?'Rejeição confirmada por evento oficial SISCOM.':'PUT respondeu, mas não houve confirmação de novo evento 4. NÃO reenviar.'};
        }
      }
    } else if (tarefa.operation === "consultar_eventos_ss") {
      const numero = String(tarefa.payload?.numero_ss || "").trim();
      const match = /^(\d{2}\/\d{2})-(\d{6})-(\d{2})$/.exec(numero);
      if (!match) throw new Error("Formato de SS inválido");
      const token = tokenFor(tarefa);
      if (!token) throw new Error("SISCOM_ACCESS_TOKEN não configurado no Windows");
      const endpoint = new URL("https://siscom-backend.sistemas.cesan.com.br:9102/backend-servico/solicitacaoServicoDados/evento");
      endpoint.searchParams.set("refAtendimento", match[1]);
      endpoint.searchParams.set("codAtendimento", match[2]);
      endpoint.searchParams.set("ssSequencial", match[3]);
      const resposta = await fetch(endpoint, {headers:{Authorization:`Bearer ${token}`,Accept:"application/json"},signal:AbortSignal.timeout(15000)});
      if (!resposta.ok) throw new Error(`SISCOM eventos HTTP ${resposta.status}`);
      const dados = await resposta.json();
      if (!Array.isArray(dados)) throw new Error("Resposta inesperada do histórico de eventos");
      const eventos = dados.map(e => ({
        codigo: Number(e?.tipoEventoDTO?.id) || null,
        descricao: String(e?.tipoEventoDTO?.descricao || "").slice(0,120),
        data_hora: e?.dataHoraEvento ?? null,
        usuario: e?.login ?? null,
        unidade: e?.descricaoUnidadeExecutora ?? null
      })).sort((a,b) => String(a.data_hora||"").localeCompare(String(b.data_hora||"")));
      const oficiais = eventos.filter(e => e.codigo === 9 || /^encerrada$/i.test(e.descricao.trim()));
      const contratada = eventos.filter(e => e.codigo === 29 || /^encerrada pela contratada$/i.test(e.descricao.trim()));
      const encerramento = oficiais.at(-1) || null;
      resultado = {
        numero_ss: numero,
        status_verificado: encerramento ? "encerrada" : "nao_confirmado",
        encerramento_oficial: encerramento,
        encerramento_contratada: contratada.at(-1) || null,
        total_eventos: eventos.length,
        eventos
      };
      // Ausência de evento 9 NÃO significa automaticamente que a SS está aberta ou rejeitada.
    } else if (["listar_equipes", "listar_micros", "listar_causas"].includes(tarefa.operation)) {
      const cfg = {
        listar_equipes: { campo: "cd_executor", caminho: "listarEquipeIntegrante" },
        listar_micros: { campo: "cd_macro", caminho: "listarServicoMicro" },
        listar_causas: { campo: "cd_micro", caminho: "listarTipoCausaProblemaRelacionado" }
      }[tarefa.operation];
      const codigo = Number(tarefa.payload?.[cfg.campo]);
      if (!Number.isSafeInteger(codigo) || codigo < 1 || codigo > 99999999)
        throw new Error("Código inválido para consulta de catálogo");
      const token = tokenFor(tarefa);
      if (!token) throw new Error("SISCOM_ACCESS_TOKEN não configurado no Windows");
      const endpoint = `https://siscom-backend.sistemas.cesan.com.br:9102/backend-servico/baixarSolicitacaoServico/${cfg.caminho}/${codigo}`;
      const resposta = await fetch(endpoint, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        signal: AbortSignal.timeout(20000)
      });
      if (!resposta.ok) throw new Error(`SISCOM catálogo HTTP ${resposta.status}`);
      const dados = await resposta.json();
      if (!Array.isArray(dados)) throw new Error("Formato inesperado de catálogo SISCOM");
      if (tarefa.operation === "listar_equipes") {
        const vistos = new Set();
        resultado = dados.filter(e => {
          const cd = Number(e?.cdEquipe);
          if (!Number.isSafeInteger(cd) || vistos.has(cd)) return false;
          vistos.add(cd); return true;
        }).map(e => ({cdEquipe: Number(e.cdEquipe), id: e.id ?? null}));
      } else if (tarefa.operation === "listar_micros") {
        resultado = dados.map(e => ({
          cdServico: e.cdServico, dcServico: e.dcServico,
          obgCausaProbl: e.obgCausaProbl ?? null,
          obgPreencherMaterialBaixa: e.obgPreencherMaterialBaixa ?? null
        }));
      } else {
        resultado = dados.map(e => ({
          id: e.id, descricao: e.descricao, ordem: e.ordem ?? null,
          informarTerceiros: e.informarTerceiros ?? null
        }));
      }

    } else if (tarefa.operation.startsWith('tram_')) {
      const token=tokenFor(tarefa);
      // Somente tarefas assinadas de usuário autenticado; sem token compartilhado.
      if(!verifySignedTask(tarefa))throw Error('Tramitação exige sessão individual');
      const op=tarefa.operation,p=tarefa.payload?.params||{};
      const base='https://siscom-backend.sistemas.cesan.com.br:9102';
      const serv='/backend-servico/';
      const integer=(v,label,min=0)=>{const n=Number(v);if(!Number.isSafeInteger(n)||n<min)throw Error(label+' inválido');return n};
      const ss=(v)=>{const x=String(v||'');if(!/^\d{12}$/.test(x))throw Error('SS compacta inválida');return x};
      const partes=(v)=>{const m=/^(\d{2})\/(\d{2})-(\d{6})-(\d{2})$/.exec(String(v||''));if(!m)throw Error('SS formatada inválida');return {ref:m[1]+'/'+m[2],cod:m[3],seq:m[4]}};
      const q=new URLSearchParams();let path='';
      if(op==='tram_contratos')path=serv+'consultarSolicitacaoServicoMedicao/listarContratoPorUsuario';
      else if(op==='tram_fases')path=serv+'consultarSolicitacaoServicoMedicao/listarFasesMedContrato/';
      else if(op==='tram_responsaveis')path=serv+'consultarSolicitacaoServicoMedicao/listarUsuarioResponsavel';
      else if(op==='tram_perfil')path=serv+'medicaoSolicitacaoServico/perfilTramitacao';
      else if(op==='tram_macros')path=serv+'consultarSolicitacaoServicoMedicao/listarMacroAssociadoPorContratoRegistrado/'+integer(p.contrato,'Contrato',1);
      else if(op==='tram_pesquisar'){
        path=serv+'consultarSolicitacaoServicoMedicao/pesquisarSSNaMedicaoPorContrato';
        q.set('cdContrato',String(integer(p.contrato,'Contrato',1)));
        q.set('cdFaseMedicao',String(integer(p.fase??-1,'Fase',-1)));
        q.set('somenteSSSemMedicao',p.semMedicao===true?'S':'N');
        for(const [k,v] of [['dataExecucaoInicial',p.inicio],['dataExecucaoFinal',p.fim]])if(v){if(!/^\d{2}\/\d{2}\/\d{4}$/.test(String(v)))throw Error('Data inválida');q.set(k,String(v))}
        q.set('page',String(integer(p.page??0,'Página')));q.set('size',String(Math.min(100,integer(p.size??25,'Tamanho',1))));q.set('sort','dataExecucao,ASC');
      }
      else if(op==='tram_detalhes'){const v=partes(p.ss);path=serv+'medicaoSolicitacaoServico';q.set('refAtendimento',v.ref);q.set('codAtendimento',v.cod);q.set('ssSequencial',v.seq)}
      else if(op==='tram_ni')path=serv+'medicaoSolicitacaoServico/nis/contrato/'+integer(p.contrato,'Contrato',1);
      else if(op==='tram_itens')path=serv+'medicaoSolicitacaoServico/nis/medicaoSs/'+integer(p.medicao,'Medição',1);
      else if(op==='tram_historico')path=serv+'medicaoSolicitacaoServico/tramitacao/medicao/'+integer(p.medicao,'Medição',1);
      else if(op==='tram_ultima_acao')path=serv+'medicaoSolicitacaoServico/tramitacaoUltimaAcao/medicao/'+integer(p.medicao,'Medição',1);
      else if(op==='tram_anexos'){const v=partes(p.ss);path='/backend-anexosMedicaoSs/anexos/listAnexo';q.set('refAtendimento',v.ref);q.set('codAtendimento',v.cod);q.set('ssSequencial',v.seq)}
      else throw Error('Operação não autorizada');
      if(['tram_itens','tram_historico','tram_anexos'].includes(op)){q.set('page',String(integer(p.page??0,'Página')));q.set('size','25');q.set('sort',op==='tram_historico'?'dtTramitacao,ASC':op==='tram_itens'?'srvContratoNIDTO.numeroNi,ASC':'id,ASC')}
      const u=base+path+(q.size?'?'+q.toString():'');
      const r=await fetch(u,{headers:{Authorization:'Bearer '+token,Accept:'application/json'},signal:AbortSignal.timeout(25000)});
      if(!r.ok)throw Error('Consulta SISCOM '+op+' HTTP '+r.status);
      const body=await r.text();try{resultado=body?JSON.parse(body):[]}catch{throw Error('SISCOM retornou resposta não JSON')}
    } else {
      throw new Error("Operação não autorizada");
    }

    if (resultado === undefined || resultado === null)
      throw new Error(`Operação ${tarefa.operation} não produziu resultado válido`);

    const { error: erroFinal } = await supabase
      .from("siscom_gateway_jobs")
      .update({
        status: "concluido",
        result: resultado,
        // Depois de executar o login, remove o envelope criptografado da fila.
        ...(tarefa.operation==='siscom_login_individual'?{payload:{__siscom_identity:{sid:tarefa.payload.__siscom_identity.sid}}}:{}),
        finished_at: new Date().toISOString()
      })
      .eq("id", tarefa.id)
      .eq("status", "processando");

    if (erroFinal) throw erroFinal;

    console.log("Tarefa concluida:", tarefa.id);

  } catch (erro) {
    console.error("Erro:", erro.message);
    if (tarefaAtual) {
      const { error: erroStatus } = await supabase.from("siscom_gateway_jobs")
        .update({status:"erro",error_message:String(erro.message).slice(0,250),
          ...(tarefaAtual.operation==='siscom_login_individual'&&tarefaAtual.payload?.__siscom_identity?.sid?{payload:{__siscom_identity:{sid:tarefaAtual.payload.__siscom_identity.sid}}}:{}),
          finished_at:new Date().toISOString()})
        .eq("id",tarefaAtual.id).eq("status","processando");
      if (erroStatus) console.error("Falha ao registrar erro:",erroStatus.message);
    }
  } finally {
    ocupado = false;
  }
}

console.log("SISCOM Worker iniciado");
console.log("Consultando Supabase a cada 5 segundos");

processar();
setInterval(processar, 5000);
