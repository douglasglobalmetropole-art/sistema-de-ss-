'use strict';
// Funções puras. Não registram SS nem acessam o banco.
const semAcento = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const texto = value => semAcento(value).toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g,' ').trim();
const codigo = value => {
 const s=texto(value).replace(/\s+/g,'');
 return (!s||/^0+$/.test(s)||['NULL','NULO','NAOINFORMADO','SEMNUMERO'].includes(s))?null:s;
};
function ruaNumero(rua,numero){
 let raw=semAcento(rua).toUpperCase().replace(/\s+/g,' ').trim();
 let n=codigo(numero);
 // uMov guarda frequentemente "RUA AFONSO PENA, 295," em loc_street.
 if(!n){const m=raw.match(/,\s*(\d+[A-Z]?)\s*,?\s*$/);if(m){n=m[1];raw=raw.slice(0,m.index);}}
 raw=raw.replace(/^(RUA|R\.|AVENIDA|AV\.|AV|TRAVESSA|TV\.|ESTRADA|RODOVIA)\s+/,'').replace(/,\s*$/,'');
 return {rua:texto(raw),numero:n};
}
function normalizarRegistro(v){
 const {rua,numero}=ruaNumero(v.logradouro??v.loc_street,v.numero??v.loc_streetnumber);
 const cidade=texto(v.cidade??v.loc_city), bairro=texto(v.bairro??v.loc_neighborhood);
 const complemento=texto(v.complemento??v.loc_streetnumbercompl);
 const chave_rua=cidade&&bairro&&rua?[cidade,bairro,rua].join('|'):null;
 const chave_endereco=chave_rua&&numero?[chave_rua,numero,complemento].join('|'):null;
 return {
   tsk_id:Number(v.tsk_id), loc_id:Number(v.loc_id), ss:String(v.ss??v.loc_integrationid??'').trim(),
   matricula:codigo(v.matricula), hidrometro:codigo(v.hidrometro),
   cidade, bairro, logradouro:rua, numero, complemento,
   chave_rua, chave_endereco, servico:String(v.servico??v.tty_description??'').trim(),
   situacao:String(v.situacao??v.tsk_situation??'').trim(),
   registro_em:v.registro_em??v.tsk_insertdatehour??null, origem:'umov',capturado_em:new Date().toISOString()
 };
}
function comparar(a,b){
 const ma=!!a.matricula&&!!b.matricula&&a.matricula===b.matricula;
 const ha=!!a.hidrometro&&!!b.hidrometro&&a.hidrometro===b.hidrometro;
 const ea=!!a.chave_endereco&&!!b.chave_endereco&&a.chave_endereco===b.chave_endereco;
 const ra=!!a.chave_rua&&!!b.chave_rua&&a.chave_rua===b.chave_rua;
 const sv=!!a.servico&&!!b.servico&&texto(a.servico)===texto(b.servico);
 const numeroDiferente=ra&&!!a.numero&&!!b.numero&&a.numero!==b.numero;
 const numeroAusente=ra&&(!a.numero||!b.numero);
 const pontos=(ma?40:0)+(ha?30:0)+(ea?20:ra?(numeroAusente?5:numeroDiferente?3:0):0)+(sv?10:0);
 const divergenciaMatricula=!!a.matricula&&!!b.matricula&&a.matricula!==b.matricula;
 const divergenciaHidrometro=!!a.hidrometro&&!!b.hidrometro&&a.hidrometro!==b.hidrometro;
 let categoria='proximidade';
 if(ea && a.servico&&b.servico&&!sv) categoria='relacionado';
 else if(sv&&(ma||ha||ea)&&!(divergenciaMatricula||divergenciaHidrometro)) categoria='provavel';
 else if(ma||ha||ea) categoria='revisar';
 const motivos=[ma?'Mesma matrícula':null,ha?'Mesmo hidrômetro':null,ea?'Mesmo endereço completo':null,!ea&&numeroAusente?'Mesma rua (número ausente)':null,!ea&&numeroDiferente?'Mesma rua (números diferentes)':null,sv?'Mesmo serviço':null,divergenciaMatricula?'Matrículas diferentes':null,divergenciaHidrometro?'Hidrômetros diferentes':null].filter(Boolean);
 return {pontos,categoria,motivos,mesmo_servico:sv};
}
module.exports={texto,codigo,normalizarRegistro,comparar};
