'use strict';
// 题库 Excel (.xlsx) / CSV 解析与导出工具（零外部依赖，仅使用 Node 内置 zlib / Buffer）。
// 严格对齐模板列：题目ID,题目类别,题型,题干,选项A,选项B,选项C,选项D,正确答案,状态

const zlib = require('zlib');
const { MIME } = require('./score-export.js');

const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const TEMPLATE_HEADERS = Object.freeze([
  '题目ID', '题目类别', '题型', '题干',
  '选项A', '选项B', '选项C', '选项D',
  '正确答案', '状态'
]);

const escXml = value => String(value ?? '')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

function decodeXmlEntities(str) {
  if (!str) return '';
  return String(str)
    .replace(/_x([0-9A-Fa-f]{4})_/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#x([0-9A-Fa-f]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildZip(entries) {
  const local = [], central = [];
  let offset = 0;
  for (const [name, xml] of entries) {
    const pathBuf = Buffer.from(name, 'utf8');
    const data = Buffer.isBuffer(xml) ? xml : Buffer.from(xml, 'utf8');
    const crc = crc32(data);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(0x800, 6);
    head.writeUInt16LE(0x21, 12);
    head.writeUInt32LE(crc, 14);
    head.writeUInt32LE(data.length, 18);
    head.writeUInt32LE(data.length, 22);
    head.writeUInt16LE(pathBuf.length, 26);

    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(0x800, 8);
    dir.writeUInt16LE(0x21, 14);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(data.length, 20);
    dir.writeUInt32LE(data.length, 24);
    dir.writeUInt16LE(pathBuf.length, 28);
    dir.writeUInt32LE(offset, 42);

    local.push(head, pathBuf, data);
    central.push(dir, pathBuf);
    offset += head.length + pathBuf.length + data.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}

function parseZipEntries(buf) {
  const entries = new Map();
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd >= 0) {
    const total = buf.readUInt16LE(eocd + 10);
    let ptr = buf.readUInt32LE(eocd + 16);
    for (let i = 0; i < total && ptr + 46 <= buf.length; i++) {
      if (buf.readUInt32LE(ptr) !== 0x02014b50) break;
      const method = buf.readUInt16LE(ptr + 10);
      const compSize = buf.readUInt32LE(ptr + 20);
      const nameLen = buf.readUInt16LE(ptr + 28);
      const extraLen = buf.readUInt16LE(ptr + 30);
      const commentLen = buf.readUInt16LE(ptr + 32);
      const localOffset = buf.readUInt32LE(ptr + 42);
      const name = buf.subarray(ptr + 46, ptr + 46 + nameLen).toString('utf8').replace(/^\/+/, '');
      if (localOffset + 30 <= buf.length && buf.readUInt32LE(localOffset) === 0x04034b50) {
        const lNameLen = buf.readUInt16LE(localOffset + 26);
        const lExtraLen = buf.readUInt16LE(localOffset + 28);
        const dataStart = localOffset + 30 + lNameLen + lExtraLen;
        if (compSize > 0 && dataStart + compSize <= buf.length) {
          const raw = buf.subarray(dataStart, dataStart + compSize);
          entries.set(name, method === 8 ? zlib.inflateRawSync(raw) : (method === 0 ? raw : Buffer.alloc(0)));
        }
      }
      ptr += 46 + nameLen + extraLen + commentLen;
    }
  }
  if (entries.size === 0) {
    let offset = 0;
    while (offset + 30 <= buf.length) {
      if (buf.readUInt32LE(offset) !== 0x04034b50) break;
      const method = buf.readUInt16LE(offset + 8);
      const compSize = buf.readUInt32LE(offset + 18);
      const nameLen = buf.readUInt16LE(offset + 26);
      const extraLen = buf.readUInt16LE(offset + 28);
      const name = buf.subarray(offset + 30, offset + 30 + nameLen).toString('utf8').replace(/^\/+/, '');
      const dataStart = offset + 30 + nameLen + extraLen;
      if (compSize > 0 && dataStart + compSize <= buf.length) {
        const raw = buf.subarray(dataStart, dataStart + compSize);
        entries.set(name, method === 8 ? zlib.inflateRawSync(raw) : (method === 0 ? raw : Buffer.alloc(0)));
      }
      offset = dataStart + compSize;
    }
  }
  return entries;
}

function parseSharedStrings(xml) {
  if (!xml) return [];
  const out = [];
  const siRegex = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = siRegex.exec(xml)) !== null) {
    // 剔除拼音注音 <rPh>...</rPh>
    const inner = m[1].replace(/<rPh\b[^>]*>[\s\S]*?<\/rPh>/g, '');
    const parts = [];
    const tRegex = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let tm;
    while ((tm = tRegex.exec(inner)) !== null) {
      parts.push(decodeXmlEntities(tm[1]));
    }
    out.push(parts.join(''));
  }
  return out;
}

function parseStyleFormats(xml) {
  const numFmts = new Map();
  const xfNumFmtIds = [];
  if (!xml) return { numFmts, xfNumFmtIds };
  const nfRegex = /<numFmt\b([^>]*)\/?>/g;
  let m;
  while ((m = nfRegex.exec(xml)) !== null) {
    const idMatch = /\bnumFmtId="(\d+)"/.exec(m[1]);
    const codeMatch = /\bformatCode="([^"]*)"/.exec(m[1]);
    if (idMatch && codeMatch) {
      numFmts.set(Number(idMatch[1]), decodeXmlEntities(codeMatch[1]));
    }
  }
  const cellXfsMatch = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml);
  if (cellXfsMatch) {
    const xfRegex = /<xf\b([^>]*)(?:\/>|>[\s\S]*?<\/xf>)/g;
    let xm;
    while ((xm = xfRegex.exec(cellXfsMatch[1])) !== null) {
      const idMatch = /\bnumFmtId="(\d+)"/.exec(xm[1]);
      xfNumFmtIds.push(idMatch ? Number(idMatch[1]) : 0);
    }
  }
  return { numFmts, xfNumFmtIds };
}

function isPercentStyle(styleIdx, styles) {
  if (!styles || !Number.isInteger(styleIdx) || styleIdx < 0) return false;
  const numFmtId = styles.xfNumFmtIds[styleIdx];
  if (numFmtId === 9 || numFmtId === 10) return true;
  const code = styles.numFmts.get(numFmtId);
  return !!(code && code.includes('%'));
}

function colRefToIndex(ref) {
  const match = /^([A-Za-z]+)/.exec(String(ref || ''));
  if (!match) return -1;
  const letters = match[1].toUpperCase();
  let idx = 0;
  for (let i = 0; i < letters.length; i++) {
    idx = idx * 26 + (letters.charCodeAt(i) - 64);
  }
  return idx - 1;
}

function parseWorksheetRows(xml, sharedStrings, styles) {
  const rows = [];
  const rowRegex = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rm;
  while ((rm = rowRegex.exec(xml)) !== null) {
    const rowContent = rm[1];
    const rowArr = [];
    let nextCol = 0;
    const cellRegex = /<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cm;
    while ((cm = cellRegex.exec(rowContent)) !== null) {
      const attrs = cm[1] || '';
      const inner = cm[2] || '';
      const rMatch = /\br="([A-Za-z]+\d+)"/.exec(attrs);
      const colIdx = rMatch ? colRefToIndex(rMatch[1]) : nextCol;
      nextCol = colIdx + 1;
      const tMatch = /\bt="([^"]+)"/.exec(attrs);
      const sMatch = /\bs="(\d+)"/.exec(attrs);
      const cellType = tMatch ? tMatch[1] : 'n';
      const styleIdx = sMatch ? Number(sMatch[1]) : -1;

      let value = '';
      if (cellType === 'inlineStr') {
        const parts = [];
        const tRegex = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
        let tm;
        while ((tm = tRegex.exec(inner)) !== null) parts.push(decodeXmlEntities(tm[1]));
        value = parts.join('');
      } else {
        const vMatch = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(inner);
        const rawVal = vMatch ? decodeXmlEntities(vMatch[1]) : '';
        if (cellType === 's') {
          const sIdx = Number(rawVal);
          value = Number.isInteger(sIdx) && sIdx >= 0 && sIdx < sharedStrings.length ? sharedStrings[sIdx] : '';
        } else if (cellType === 'b') {
          value = rawVal === '1' || rawVal.toUpperCase() === 'TRUE' ? 'TRUE' : 'FALSE';
        } else if (cellType === 'n' && rawVal !== '' && Number.isFinite(Number(rawVal))) {
          const num = Number(rawVal);
          if (isPercentStyle(styleIdx, styles)) {
            value = `${Number((num * 100).toFixed(4))}%`;
          } else {
            value = String(num);
          }
        } else {
          value = rawVal;
        }
      }
      while (rowArr.length < colIdx) rowArr.push('');
      rowArr[colIdx] = String(value ?? '').trim();
    }
    if (rowArr.some(cell => cell !== '')) {
      rows.push(rowArr);
    }
  }
  return rows;
}

function parseCsvRows(text) {
  const cleaned = String(text || '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inQuotes) {
      if (ch === '"') {
        if (cleaned[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field.trim());
      field = '';
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && cleaned[i + 1] === '\n') i++;
      row.push(field.trim());
      field = '';
      if (row.some(c => c !== '')) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field.trim());
    if (row.some(c => c !== '')) rows.push(row);
  }
  return rows;
}

function normalizeQuestionType(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (['单选', '单选题', 'single', '单选题(single)'].includes(s)) return 'single';
  if (['多选', '多选题', 'multiple', '多选题(multiple)'].includes(s)) return 'multiple';
  if (['判断', '判断题', '是非', '是非题', 'judge', '判断题(judge)'].includes(s)) return 'judge';
  return '';
}

function normalizeStatus(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (!s || ['启用', '正常', '开启', '是', '1', 'true', 'enabled', 'active'].includes(s)) {
    return { status: '启用', enabled: true };
  }
  if (['停用', '禁用', '关闭', '否', '0', 'false', 'disabled', 'inactive'].includes(s)) {
    return { status: '停用', enabled: false };
  }
  return null;
}

function normalizeAnswerForType(type, rawAnswer, validOptionKeys) {
  const raw = String(rawAnswer ?? '').trim();
  if (!raw) return null;
  if (type === 'judge') {
    const upper = raw.toUpperCase();
    if (['正确', '对', '是', 'T', 'TRUE', '1', 'YES', 'Y', '√', '✓', 'A'].includes(upper)) return 'T';
    if (['错误', '错', '否', 'F', 'FALSE', '0', 'NO', 'N', '×', '✕', 'B'].includes(upper)) return 'F';
    return null;
  }
  if (type === 'single') {
    const upper = raw.toUpperCase().replace(/[^A-Z]/g, '');
    if (upper.length === 1 && validOptionKeys.includes(upper)) return upper;
    return null;
  }
  if (type === 'multiple') {
    const letters = [...new Set(raw.toUpperCase().match(/[A-Z]/g) || [])].sort();
    if (letters.length >= 2 && letters.every(k => validOptionKeys.includes(k))) {
      return letters;
    }
    return null;
  }
  return null;
}

function mapHeaderColumns(headerRow) {
  const map = {};
  const aliases = {
    id: ['题目id', 'id', '题号', '编号', 'questionid'],
    category: ['题目类别', '类别', '分类', '题库类别', '专题', 'category'],
    type: ['题型', '题目类型', '类型', 'type'],
    stem: ['题干', '题目', '问题', '题目内容', 'stem', 'question'],
    optA: ['选项a', 'a', 'optiona'],
    optB: ['选项b', 'b', 'optionb'],
    optC: ['选项c', 'c', 'optionc'],
    optD: ['选项d', 'd', 'optiond'],
    answer: ['正确答案', '答案', '标准答案', 'answer'],
    status: ['状态', '启用状态', '是否启用', 'status'],
    explanation: ['解析', '答案解析', '说明', 'explanation']
  };
  headerRow.forEach((cell, idx) => {
    const norm = String(cell || '').trim().toLowerCase().replace(/\s+/g, '');
    for (const [key, list] of Object.entries(aliases)) {
      if (list.includes(norm) && map[key] === undefined) {
        map[key] = idx;
      }
    }
  });
  return map;
}

function rowsToQuizQuestions(rows) {
  if (!Array.isArray(rows) || rows.length < 2) {
    throw new Error('导入文件中没有找到有效的题目数据行（需包含表头与至少 1 行题目）');
  }
  const colMap = mapHeaderColumns(rows[0]);
  if (colMap.type === undefined || colMap.stem === undefined || colMap.answer === undefined) {
    throw new Error('表头格式不匹配，请使用标准模板列：题目ID,题目类别,题型,题干,选项A,选项B,选项C,选项D,正确答案,状态');
  }

  const questions = [];
  const seenIds = new Set();
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const get = key => (colMap[key] !== undefined && row[colMap[key]] !== undefined ? String(row[colMap[key]]).trim() : '');
    const rawId = get('id');
    const category = get('category') || '默认题库';
    const rawType = get('type');
    const stem = get('stem');
    const rawAnswer = get('answer');
    const rawStatus = get('status');
    const explanation = get('explanation');

    // 跳过全空行
    if (!rawId && !rawType && !stem && !rawAnswer) continue;

    const rowLabel = `第 ${r + 1} 行${rawId ? `（${rawId}）` : ''}`;
    const id = rawId || `Q${String(r).padStart(4, '0')}`;
    if (seenIds.has(id)) {
      throw new Error(`${rowLabel}：题目ID「${id}」在本次导入文件中重复`);
    }
    seenIds.add(id);

    const type = normalizeQuestionType(rawType);
    if (!type) {
      throw new Error(`${rowLabel}：题型「${rawType || '空'}」无效，仅支持 单选 / 多选 / 判断`);
    }
    if (!stem) {
      throw new Error(`${rowLabel}：题干不能为空`);
    }

    let options = [];
    if (type === 'judge') {
      options = [
        { key: 'T', text: '正确' },
        { key: 'F', text: '错误' }
      ];
    } else {
      for (const [k, field] of [['A', 'optA'], ['B', 'optB'], ['C', 'optC'], ['D', 'optD']]) {
        const text = get(field);
        if (text !== '') options.push({ key: k, text });
      }
      if (options.length < 2) {
        throw new Error(`${rowLabel}：${type === 'single' ? '单选题' : '多选题'}至少需要填写 2 个非空选项（选项A–D）`);
      }
    }

    const validKeys = options.map(o => o.key);
    const answer = normalizeAnswerForType(type, rawAnswer, validKeys);
    if (!answer) {
      throw new Error(`${rowLabel}：正确答案「${rawAnswer || '空'}」与题型/选项不匹配`);
    }

    const st = normalizeStatus(rawStatus);
    if (!st) {
      throw new Error(`${rowLabel}：状态「${rawStatus}」无效，仅支持 启用 / 停用`);
    }

    questions.push({
      id,
      category,
      type,
      stem,
      options,
      answer,
      explanation: explanation || '',
      status: st.status,
      enabled: st.enabled
    });
  }

  if (!questions.length) {
    throw new Error('导入文件中没有解析到任何有效题目');
  }
  return questions;
}

function parseQuizFile({ buffer, fileName = '' }) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    throw new Error('上传的文件为空');
  }
  const isZip = buffer.length >= 4 && buffer.readUInt32LE(0) === 0x04034b50;
  const lowerName = String(fileName || '').toLowerCase();
  if (isZip || lowerName.endsWith('.xlsx')) {
    if (!isZip) throw new Error('文件不是有效的 .xlsx 工作簿（请确认已保存为标准 Excel .xlsx 格式）');
    const entries = parseZipEntries(buffer);
    const sstXml = entries.get('xl/sharedStrings.xml')?.toString('utf8') || '';
    const stylesXml = entries.get('xl/styles.xml')?.toString('utf8') || '';
    let sheetXml = entries.get('xl/worksheets/sheet1.xml')?.toString('utf8') || '';
    if (!sheetXml) {
      for (const [k, v] of entries.entries()) {
        if (k.startsWith('xl/worksheets/sheet') && k.endsWith('.xml')) {
          sheetXml = v.toString('utf8');
          break;
        }
      }
    }
    if (!sheetXml) throw new Error('Excel 文件中未找到工作表（xl/worksheets/sheet1.xml）');
    const sharedStrings = parseSharedStrings(sstXml);
    const styles = parseStyleFormats(stylesXml);
    const rows = parseWorksheetRows(sheetXml, sharedStrings, styles);
    return rowsToQuizQuestions(rows);
  }
  // CSV / 文本解析（优先 UTF-8，若含替换符且无中文表头则尝试 GB18030）
  let text = buffer.toString('utf8');
  if (!text.includes('题') && typeof TextDecoder === 'function') {
    try { text = new TextDecoder('gb18030').decode(buffer); } catch { /* ignore */ }
  }
  const rows = parseCsvRows(text);
  return rowsToQuizQuestions(rows);
}

const colLetter = i => {
  let s = '';
  for (i++; i; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s;
  return s;
};

function buildWorksheetXml(rows, widths) {
  const data = rows.map((row, r) => `<row r="${r + 1}">${row.map((v, c) => {
    const attr = `r="${colLetter(c)}${r + 1}" s="${r === 0 ? 1 : 0}"`;
    return `<c ${attr} t="inlineStr"><is><t xml:space="preserve">${escXml(v)}</t></is></c>`;
  }).join('')}</row>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${NS}"><dimension ref="A1:${colLetter(rows[0].length - 1)}${rows.length}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${data}</sheetData><autoFilter ref="A1:${colLetter(rows[0].length - 1)}${rows.length}"/></worksheet>`;
}

function questionToRow(q) {
  const typeText = q.type === 'multiple' ? '多选' : (q.type === 'judge' ? '判断' : '单选');
  const optMap = {};
  if (q.type !== 'judge' && Array.isArray(q.options)) {
    for (const o of q.options) optMap[o.key] = o.text ?? '';
  }
  let answerText = '';
  if (q.type === 'judge') {
    answerText = q.answer === 'T' ? '正确' : '错误';
  } else if (Array.isArray(q.answer)) {
    answerText = q.answer.join(',');
  } else {
    answerText = String(q.answer || '');
  }
  const statusText = q.enabled === false || q.status === '停用' ? '停用' : '启用';
  return [
    String(q.id || ''),
    String(q.category || '十五五规划'),
    typeText,
    String(q.stem || ''),
    String(optMap.A || ''),
    String(optMap.B || ''),
    String(optMap.C || ''),
    String(optMap.D || ''),
    answerText,
    statusText
  ];
}

function buildQuizWorkbook(questions, { fileName = 'S-ID-quiz-template.xlsx', sheetName = 'Sheet1' } = {}) {
  const rows = [
    [...TEMPLATE_HEADERS],
    ...(Array.isArray(questions) ? questions.map(questionToRow) : [])
  ];
  const widths = [12, 16, 10, 44, 28, 28, 28, 28, 12, 10];
  const entries = [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="${NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets><sheet name="${escXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
    ['xl/styles.xml', `<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="${NS}"><fonts count="2"><font><sz val="11"/><name val="Microsoft YaHei"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Microsoft YaHei"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF245B91"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`],
    ['xl/worksheets/sheet1.xml', buildWorksheetXml(rows, widths)]
  ];
  return {
    buffer: buildZip(entries),
    fileName,
    mime: MIME
  };
}

module.exports = {
  TEMPLATE_HEADERS,
  parseQuizFile,
  buildQuizWorkbook,
  questionToRow
};
