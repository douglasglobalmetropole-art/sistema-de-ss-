'use strict';
// Patch incremental: altera somente âncoras conhecidas, preserva integrações já existentes.
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=process.argv[2];
if(!root){console.error('Uso: node APLICAR_TRAMITACAO.js C:\\caminho\\global-ss');process.exit(2)}
const spec=JSON.parse(fs.readFileSync(path.join(__dirname,'PATCHES.json'),'utf8'));
const dest={
  'server.js':path.join(root,'server.js'),
  'public/index.html':path.join(root,'public','index.html')
};
const working=new Map();
try{
  for(const file of Object.keys(dest)){
    if(!fs.existsSync(dest[file]))throw Error('Arquivo ausente: '+dest[file]);
    working.set(file,fs.readFileSync(dest[file],'utf8').replace(/\r\n/g,'\n'));
  }
  let alteracoes=0,ignoradas=0;
  for(const step of spec){
    const current=working.get(step.path);
    const occurrences=current.split(step.before).length-1;
    if(current.includes(step.after) || (occurrences===0 && step.name==='Alternar painel da tramitação' && current.includes("$('tramitacaoIntro').hidden=screen!=='tramitacao';"))){
      console.log('Já aplicado:',step.name);ignoradas++;continue;
    }
    if(occurrences!==step.expected){
      throw Error('Versão divergente em '+step.path+' ('+step.name+'). Encontrado '+occurrences+' trecho(s), esperado '+step.expected+'. Nenhum arquivo alterado.');
    }
    working.set(step.path,current.split(step.before).join(step.after));
    alteracoes++;
  }
  new vm.Script(working.get('server.js'),{filename:'server.js'});
  const html=working.get('public/index.html');
  let scripts=0;
  for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){
    if(match[1].trim()){new vm.Script(match[1],{filename:'index.html/script-'+(++scripts)});}
  }
  if(scripts<5)throw Error('Não foi possível validar os scripts do index.html');
  for(const [file,content] of working){
    if(fs.readFileSync(dest[file],'utf8').replace(/\r\n/g,'\n')!==content){
      fs.writeFileSync(dest[file],content,'utf8');
    }
  }
  console.log('Tramitação instalada com sucesso:',alteracoes,'etapas aplicadas;',ignoradas,'já presentes. Scripts JS validados:',scripts);
}catch(error){console.error('INSTALAÇÃO BLOQUEADA:',error.message);process.exit(1)}
