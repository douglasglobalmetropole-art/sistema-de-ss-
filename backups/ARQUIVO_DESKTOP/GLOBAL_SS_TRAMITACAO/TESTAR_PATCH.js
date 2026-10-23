'use strict';
const fs=require('fs'),path=require('path'),os=require('os'),cp=require('child_process');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'globalss-tramitacao-'));
fs.mkdirSync(path.join(tmp,'public'));
fs.copyFileSync(path.join(__dirname,'base.server.js'),path.join(tmp,'server.js'));
fs.copyFileSync(path.join(__dirname,'base.index.html'),path.join(tmp,'public','index.html'));
const patch=path.join(__dirname,'APLICAR_TRAMITACAO.js');
const r=cp.spawnSync(process.execPath,[patch,tmp],{encoding:'utf8'});
if(r.status!==0)throw Error('Aplicação do patch falhou: '+r.stdout+r.stderr);
for(const [file,reference] of [['server.js',path.join(__dirname,'site','server.js')],['public/index.html',path.join(__dirname,'site','public','index.html')]]){
  const content=fs.readFileSync(path.join(tmp,file),'utf8');
  if(content!==fs.readFileSync(reference,'utf8'))throw Error('Resultado diferente do esperado para '+file);
}
const again=cp.spawnSync(process.execPath,[patch,tmp],{encoding:'utf8'});
if(again.status!==0)throw Error('Patch não é idempotente: '+again.stderr);
const server=fs.readFileSync(path.join(tmp,'server.js'),'utf8');
if((server.match(/tramitacao:/g)||[]).length!==3)throw Error('Tramitação faltou em alguma consulta SQL');
console.log('PASSOU: todas as consultas, idempotência, sintaxe JS, preservação dos arquivos originais.');
fs.rmSync(tmp,{force:true,recursive:true});
