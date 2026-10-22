require("dotenv").config();

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

let ocupado = false;

async function processar() {
  if (ocupado) return;
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
    if (tarefa.operation === "healthcheck") {
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
      const token = process.env.SISCOM_ACCESS_TOKEN;
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
      const token = process.env.SISCOM_ACCESS_TOKEN;
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
      const p=tarefa.payload||{},numero=String(p.numero_ss||'');
      const m=/^(\d{2})\/(\d{2})-(\d{6})-(\d{2})$/.exec(numero);
      if(!m)throw Error('SS inválida');
      if(numero==='10/26-032766-01')throw Error('SS de referência já encerrada: envio bloqueado');
      const token=process.env.SISCOM_ACCESS_TOKEN;
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
    } else if (tarefa.operation === "consultar_eventos_ss") {
      const numero = String(tarefa.payload?.numero_ss || "").trim();
      const match = /^(\d{2}\/\d{2})-(\d{6})-(\d{2})$/.exec(numero);
      if (!match) throw new Error("Formato de SS inválido");
      const token = process.env.SISCOM_ACCESS_TOKEN;
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
      const token = process.env.SISCOM_ACCESS_TOKEN;
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
        .update({status:"erro",error_message:String(erro.message).slice(0,250),finished_at:new Date().toISOString()})
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
