'use strict';
// 只生成管理员已归档成绩。OOXML + ZIP STORE，零依赖，不调用Office/网络或子进程。
const MIME='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const NS='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const esc=value=>String(value??'').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
const time=value=>Number.isFinite(Number(value))&&Number(value)>0?new Date(Number(value)+8*3600000).toISOString().slice(0,19).replace('T',' '):'—';
function crc32(data){let crc=0xffffffff;for(const byte of data){crc^=byte;for(let k=0;k<8;k++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return(crc^0xffffffff)>>>0;}
function zip(entries){
  const local=[],central=[];let offset=0;
  for(const[name,xml]of entries){const path=Buffer.from(name),data=Buffer.from(xml),crc=crc32(data);const head=Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50,0);head.writeUInt16LE(20,4);head.writeUInt16LE(0x800,6);head.writeUInt16LE(0x21,12);head.writeUInt32LE(crc,14);head.writeUInt32LE(data.length,18);head.writeUInt32LE(data.length,22);head.writeUInt16LE(path.length,26);
    const dir=Buffer.alloc(46);dir.writeUInt32LE(0x02014b50,0);dir.writeUInt16LE(20,4);dir.writeUInt16LE(20,6);dir.writeUInt16LE(0x800,8);dir.writeUInt16LE(0x21,14);dir.writeUInt32LE(crc,16);dir.writeUInt32LE(data.length,20);dir.writeUInt32LE(data.length,24);dir.writeUInt16LE(path.length,28);dir.writeUInt32LE(offset,42);
    local.push(head,path,data);central.push(dir,path);offset+=head.length+path.length+data.length;
  }
  const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...local,directory,end]);
}
const col=i=>{let s='';for(i++;i;i=Math.floor((i-1)/26))s=String.fromCharCode(65+(i-1)%26)+s;return s;};
function worksheet(rows,widths){
  if(rows.length>1048576)throw Error('成绩行数超过Excel上限，请缩小导出范围');
  const data=rows.map((row,r)=>`<row r="${r+1}">${row.map((v,c)=>{
    const attr=`r="${col(c)}${r+1}" s="${r===0?1:0}"`;
    // 文本始终为inlineStr，= + - @开头的昵称不会作为公式执行；积分保持数值。
    return typeof v==='number'&&Number.isFinite(v)?`<c ${attr}><v>${v}</v></c>`:`<c ${attr} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
  }).join('')}</row>`).join('');
  return`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${NS}"><dimension ref="A1:${col(rows[0].length-1)}${rows.length}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${data}</sheetData><autoFilter ref="A1:${col(rows[0].length-1)}${rows.length}"/></worksheet>`;
}
function buildScoreExport(activity,roundId,now=Date.now()){
  const history=activity.history||[],selected=history.find(r=>r.roundId===roundId);
  if(!selected)throw Error('请选择有效的已结算场次后再导出');
  const today=new Date(now+8*3600000).toISOString().slice(0,10);
  const rankRows=(r)=>(r.ranking||[]).filter(p=>!p.npc);
  const context=r=>[r.day,r.label||'历史场',r.roundId,time(r.startedAt),time(r.finishedAt)];
  const detailHeader=['日期','场次名称','场次编号','开始时间（北京时间）','结算时间（北京时间）','名次','玩家','本场积分','结算状态'];
  const details=r=>rankRows(r).map((p,i)=>[...context(r),p.rank??i+1,String(p.name||'玩家'),Number(p.score)||0,p.alive?'存活':'淘汰']);
  const sheets=[
    {name:'所选场次成绩',rows:[detailHeader,...details(selected)],widths:[14,24,40,25,25,10,24,14,14]},
    {name:'今日合计',rows:[['统计日期','名次','玩家','今日积分','参与场数'],...(activity.dailyRanking||[]).filter(p=>!p.npc).map((p,i)=>[today,p.rank??i+1,String(p.name||'玩家'),Number(p.score)||0,Number(p.sessions)||0])],widths:[14,10,24,14,14]},
    {name:'累计总分',rows:[['统计范围','名次','玩家','累计积分','参与场数','参与天数'],...(activity.totalRanking||[]).filter(p=>!p.npc).map((p,i)=>['全部已结算场次',p.rank??i+1,String(p.name||'玩家'),Number(p.score)||0,Number(p.sessions)||0,Number(p.days)||0])],widths:[25,10,24,14,14,14]},
    {name:'全部场次明细',rows:[detailHeader,...history.flatMap(details)],widths:[14,24,40,25,25,10,24,14,14]}
  ];
  const entries=[['[Content_Types].xml',`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],
    ['_rels/.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml',`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="${NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${sheets.map((s,i)=>`<sheet name="${s.name}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels',`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}<Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml',`<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="${NS}"><fonts count="2"><font><sz val="11"/><name val="Microsoft YaHei"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Microsoft YaHei"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF245B91"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`]
  ];
  sheets.forEach((s,i)=>entries.push([`xl/worksheets/sheet${i+1}.xml`,worksheet(s.rows,s.widths)]));
  return{buffer:zip(entries),fileName:`S-ID-scores-${today}.xlsx`,mime:MIME};
}
module.exports={buildScoreExport,MIME};
