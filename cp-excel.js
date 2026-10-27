'use strict';
// CP_V26_EXPORT_SS_LINK_E_FIM_REAL

// Exportacao XLSX nativa, sem dependencias npm e sem formulas de texto nao confiavel.
const zlib = require('node:zlib');
const {Buffer} = require('node:buffer');

const MAX_ROWS = 10000;
const MAX_UNCOMPRESSED = 5 * 1024 * 1024;
const HOST = String(process.env.UMOV_REPORT_HOST || 'consglobalmetropole.umov.me').trim().toLowerCase();
const REPORT_HOST = /^[a-z0-9.-]+\.umov\.me$/.test(HOST) ? HOST : 'consglobalmetropole.umov.me';
const xml = v => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
const safe = v => String(v == null ? '' : v).slice(0,500);

// ZIP no formato padrao OpenXML. Sem formula HYPERLINK(): links externos verdadeiros.
// IMPORTANTE: bit 3 (0x0008) deve ficar DESLIGADO, pois nao emitimos data descriptors.
// Se ativado, o Excel tenta reparar a estrutura ZIP mesmo quando outros leitores abrem.
const crcTable = new Uint32Array(256);
for (let n=0;n<256;n++) { let c=n;for(let j=0;j<8;j++)c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1);crcTable[n]=c>>>0; }
function crc32(data) { let c=0xFFFFFFFF;for(const b of data)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0; }
function makeZip(entries) {
 const parts=[], central=[];let offset=0;
 for(const [filename,content] of entries) {
  const name=Buffer.from(filename), raw=Buffer.from(content,'utf8'),compressed=zlib.deflateRawSync(raw,{level:6}),crc=crc32(raw);
  const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(0,6);local.writeUInt16LE(8,8);local.writeUInt32LE(crc,14);local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(raw.length,22);local.writeUInt16LE(name.length,26);
  parts.push(local,name,compressed);
  const cd=Buffer.alloc(46);cd.writeUInt32LE(0x02014b50,0);cd.writeUInt16LE(20,4);cd.writeUInt16LE(20,6);cd.writeUInt16LE(0,8);cd.writeUInt16LE(8,10);cd.writeUInt32LE(crc,16);cd.writeUInt32LE(compressed.length,20);cd.writeUInt32LE(raw.length,24);cd.writeUInt16LE(name.length,28);cd.writeUInt32LE(offset,42);
  central.push(cd,name);offset+=local.length+name.length+compressed.length;
 }
 const centralSize=central.reduce((n,b)=>n+b.length,0);
 const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(centralSize,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...parts,...central,end]);
}
function workbook(rows, tab, periodo, links) {
 const headers=[tab==='retornadas'?'Data de finalização real':'Data programada','SS','Equipe','Município','Bairro','Rua / endereço','Serviço / macro','Duração','Situação em campo','Integração','ID tarefa'];
 const cols='ABCDEFGHIJK';
 const sheetRows=[], hyperlinks=[], rels=[];
 function cell(ref,value,style=0){return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;}
 function row(n,cells,height){sheetRows.push(`<row r="${n}"${height?` ht="${height}" customHeight="1"`:''}>${cells.join('')}</row>`);}
 row(1,[cell('A1','GLOBAL METRÓPOLE  |  CENTRAL DE OPERAÇÕES',1)],30);
 row(2,[cell('A2',`ÚLTIMAS MOVIMENTAÇÕES — ${tab==='programadas'?'PROGRAMADAS':'RETORNADAS'}`,2)],24);
 row(3,[cell('A3',`${tab==='programadas'?'Situação atual, independente da data':`Período: ${periodo.inicio||'—'} a ${periodo.fim||'—'}`}  |  Registros exportados: ${rows.length}`,4)],23);
 row(4,[cell('A4','Clique na SS com hiperlink para abrir o relatório original do uMov, quando disponível.',4)],24);
 row(6,headers.map((v,i)=>cell(cols[i]+'6',v,1)),28);
 for(let i=0;i<rows.length;i++) {
  const r=rows[i],line=i+7,id=String(r[0]),url=links.get(id)||'',ss=String(r[1]||'');
  const vals=[r[2],ss,r[3],r[4],r[5],r[6],r[7],r[8],r[9],r[10],id];
  row(line,vals.map((v,j)=>cell(cols[j]+line,safe(v),j===1&&url?3:(i%2===0?0:5))),21);
  if(url){const relId=`rId${rels.length+1}`;rels.push(`<Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${xml(url)}" TargetMode="External"/>`);hyperlinks.push(`<hyperlink ref="B${line}" r:id="${relId}" tooltip="Abrir relatório original do uMov"/>`);}
 }
 const last=Math.max(6,rows.length+6);
 const widths=[24,23,26,21,25,42,43,13,23,21,16];
 const colsXml=widths.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('');
 const worksheet=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><dimension ref="A1:K${last}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="6" topLeftCell="A7" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="19"/><cols>${colsXml}</cols><sheetData>${sheetRows.join('')}</sheetData><autoFilter ref="A6:K${last}"/><mergeCells count="4"><mergeCell ref="A1:K1"/><mergeCell ref="A2:K2"/><mergeCell ref="A3:K3"/><mergeCell ref="A4:K4"/></mergeCells>${hyperlinks.length?`<hyperlinks>${hyperlinks.join('')}</hyperlinks>`:''}<pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.3" footer="0.3"/></worksheet>`;
 const styles=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="4"><font><sz val="10"/><name val="Aptos"/><color rgb="FF25496D"/></font><font><b/><sz val="11"/><name val="Aptos"/><color rgb="FFFFFFFF"/></font><font><b/><sz val="13"/><name val="Aptos"/><color rgb="FF0A528C"/></font><font><u val="single"/><sz val="10"/><name val="Aptos"/><color rgb="FF0563C1"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF075B9C"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF0F6FC"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1"/><xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
 const entries=[
  ['[Content_Types].xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`],
  ['_rels/.rels',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
  ['xl/workbook.xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${tab==='programadas'?'Programadas':'Retornadas'}" sheetId="1" r:id="rId1"/></sheets></workbook>`],
  ['xl/_rels/workbook.xml.rels',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
  ['xl/styles.xml',styles],['xl/worksheets/sheet1.xml',worksheet],
  ['xl/worksheets/_rels/sheet1.xml.rels',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`]
 ];
 return makeZip(entries);
}
// CP_V27_LINKS_SEM_BLOQUEAR_EXCEL
// Consulta os metadados de relatorio em lotes, SEM JOIN volumoso entre views.
// Nenhuma excecao da consulta opcional deve impedir a exportacao dos dados.
async function cpV27Links(pool, ids, expectedSS){
 const links=new Map();
 const deadline=Date.now()+4600;
 const batchSize=180;
 let checked=0,failed=0;
 const query=async(text,values,ms)=>pool.query({text,values,query_timeout:Math.min(ms,Math.max(350,deadline-Date.now()))});
 for(let pos=0;pos<ids.length;pos+=batchSize){
  if(Date.now()>=deadline){failed+=ids.length-pos;break}
  const batch=ids.slice(pos,pos+batchSize);
  try{
   // A tabela task e consultada primeiro; colunas opcionais sao lidas via JSON.
   const t=await query(`SELECT t.tsk_id,t.loc_id,
     NULLIF(to_jsonb(t)->>'tss_id','') AS tss_id,
     NULLIF(to_jsonb(t)->>'tsk_accesstoken','') AS tsk_accesstoken
     FROM u45468.task t WHERE t.tsk_id=ANY($1::bigint[])`,[batch],1700);
   const taskRows=t.rows||[];
   const locations=[...new Set(taskRows.map(x=>Number(x.loc_id)).filter(x=>Number.isSafeInteger(x)&&x>0))];
   // So usamos links de tarefas com numero da SS confirmado pelo uMov.
   const localMap=new Map();
   if(locations.length){
    const l=await query(`SELECT loc_id,loc_integrationid FROM u45468.local
      WHERE loc_id=ANY($1::bigint[])`,[locations],1100);
    for(const x of l.rows||[])localMap.set(String(x.loc_id),String(x.loc_integrationid||'').trim());
   }
   // Se task nao trouxer o tipo/token, busca em dbout_task, SEM JOIN com local.
   const missing=taskRows.filter(x=>Number(x.tss_id)!==50||!x.tsk_accesstoken).map(x=>x.tsk_id);
   const fallback=new Map();
   if(missing.length&&Date.now()<deadline){
    try{
     const d=await query(`SELECT d.tsk_id,
        NULLIF(to_jsonb(d)->>'tss_id','') AS tss_id,
        NULLIF(to_jsonb(d)->>'tsk_accesstoken','') AS tsk_accesstoken
        FROM u45468.dbout_task d WHERE d.tsk_id=ANY($1::bigint[])`,[missing],1700);
     for(const x of d.rows||[])fallback.set(String(x.tsk_id),x);
    }catch(e){failed+=missing.length;console.warn('CP V27: dbout_task indisponivel para links:',e.code||e.message)}
   }
   for(const tsk of taskRows){
    const id=String(tsk.tsk_id);
    if(expectedSS.get(id)!==localMap.get(String(tsk.loc_id)))continue;
    const d=fallback.get(id)||{};
    const type=Number(tsk.tss_id||d.tss_id);
    const token=String(tsk.tsk_accesstoken||d.tsk_accesstoken||'');
    if(type!==50||!/^[A-Za-z0-9._~-]+$/.test(token))continue;
    links.set(id,`https://${REPORT_HOST}/CenterWeb/report/schedule/${id}/${token}`);
   }
   checked+=batch.length;
  }catch(e){
   failed+=batch.length;
   console.warn('CP V27: lote de links indisponivel, Excel preservado:',e.code||e.message);
  }
 }
 return {links,partial:failed>0||checked<ids.length,checked,failed};
}

module.exports = function registerCpExcel(app,pool) {
 app.post('/api/cp/exportar-movimentacoes',require('express').raw({type:'application/octet-stream',limit:'1mb',inflate:false}),async(req,res)=>{
  try {
   const body=Buffer.isBuffer(req.body)?req.body:Buffer.alloc(0);
   const raw=req.get('X-CP-Payload')==='gzip'?zlib.gunzipSync(body,{maxOutputLength:MAX_UNCOMPRESSED}):body;
   if(raw.length>MAX_UNCOMPRESSED) return res.status(413).json({ok:false,error:'Exportacao excede 5 MB de dados.'});
   const obj=JSON.parse(raw.toString('utf8'));
   if(!obj || !['programadas','retornadas'].includes(obj.tab) || !Array.isArray(obj.rows) || !obj.rows.length || obj.rows.length>MAX_ROWS)
    return res.status(400).json({ok:false,error:`Informe entre 1 e ${MAX_ROWS} SS para exportar.`});
   const rows=obj.rows;
   if(rows.some(r=>!Array.isArray(r)||r.length!==11||!Number.isSafeInteger(Number(r[0]))||Number(r[0])<=0))
    return res.status(400).json({ok:false,error:'Dados de SS invalidos para exportacao.'});
   const ids=[...new Set(rows.map(r=>Number(r[0])))];
   const links=new Map();
   const expectedSS=new Map(rows.map(x=>[String(x[0]),String(x[1]||'').trim()]));
   let linkStatus={partial:false,checked:0,failed:0};
   if(ids.length){
    try{
     linkStatus=await cpV27Links(pool,ids,expectedSS);
     for(const [id,url] of linkStatus.links)links.set(id,url);
    }catch(e){
     // Protecao final: mesmo em erro inesperado, o Excel ainda e gerado.
     linkStatus={partial:true,checked:0,failed:ids.length};
     console.warn('CP V27: hyperlinks indisponiveis:',e.code||e.message);
    }
   }
   const arquivo=workbook(rows,obj.tab,obj.periodo||{},links);
   const di=String(obj.periodo?.inicio||'').replace(/[^0-9-]/g,'').slice(0,10);
   const df=String(obj.periodo?.fim||'').replace(/[^0-9-]/g,'').slice(0,10);
   res.set('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
   res.set('Content-Disposition',`attachment; filename="CENTRAL_SS_${obj.tab.toUpperCase()}_${obj.tab==='programadas'?'STATUS_ATUAL':(di||'DATA')+'_'+(df||'DATA')}.xlsx"`);
   res.set('Cache-Control','no-store');res.set('X-CP-Relatorios-Disponiveis',String(links.size));res.set('X-CP-Links-Partial',linkStatus.partial?'1':'0');
   res.send(arquivo);
  }catch(e){console.error('CP exportar Excel:',e.message);if(!res.headersSent)res.status(502).json({ok:false,error:'Falha ao gerar Excel. Verifique a consulta de relatorios uMov.'});}
 });
};
module.exports._test={workbook,makeZip,cpV27Links};
