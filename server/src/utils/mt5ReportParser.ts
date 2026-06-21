import zlib from 'zlib';

type CellValue = string | number | Date | string[] | null;
type CellMap = Record<string, string>;
type RowMap = Record<number, CellMap>;

export interface Mt5ReportSummary {
  expertName?: string | null;
  symbol?: string | null;
  timeframe?: string | null;
  periodStart?: Date | null;
  periodEnd?: Date | null;
  initialDeposit?: number | null;
  currency?: string | null;
  leverage?: string | null;
  totalNetProfit?: number | null;
  grossProfit?: number | null;
  grossLoss?: number | null;
  profitFactor?: number | null;
  expectedPayoff?: number | null;
  recoveryFactor?: number | null;
  sharpeRatio?: number | null;
  totalTrades?: number | null;
  totalDeals?: number | null;
  winrate?: number | null;
  profitTrades?: number | null;
  lossTrades?: number | null;
  shortTrades?: number | null;
  shortWinrate?: number | null;
  longTrades?: number | null;
  longWinrate?: number | null;
  balanceDrawdownMax?: number | null;
  balanceDrawdownPct?: number | null;
  equityDrawdownMax?: number | null;
  equityDrawdownPct?: number | null;
  largestProfitTrade?: number | null;
  largestLossTrade?: number | null;
  averageProfitTrade?: number | null;
  averageLossTrade?: number | null;
  maxConsecutiveWins?: number | null;
  maxConsecutiveLosses?: number | null;
  averageConsecutiveWins?: number | null;
  averageConsecutiveLosses?: number | null;
  zScore?: number | null;
  ahpr?: number | null;
  ghpr?: number | null;
  finalBalance?: number | null;
}

export interface Mt5OrderInput {
  openTime?: Date | null;
  orderId?: string | null;
  symbol?: string | null;
  type?: string | null;
  volume?: number | null;
  price?: number | null;
  sl?: number | null;
  tp?: number | null;
  closeTime?: Date | null;
  state?: string | null;
  comment?: string | null;
  raw: Record<string, CellValue>;
}

export interface Mt5DealInput {
  time?: Date | null;
  dealId?: string | null;
  symbol?: string | null;
  type?: string | null;
  direction?: string | null;
  positionId?: string | null;
  volume?: number | null;
  price?: number | null;
  orderId?: string | null;
  commission?: number | null;
  swap?: number | null;
  profit?: number | null;
  balance?: number | null;
  comment?: string | null;
  raw: Record<string, CellValue>;
}

export interface Mt5ReconstructedTrade {
  entryTime?: Date | null;
  exitTime?: Date | null;
  entryDealId?: string | null;
  exitDealId?: string | null;
  orderId?: string | null;
  side: string;
  entryPrice?: number | null;
  exitPrice?: number | null;
  volume?: number | null;
  commission: number;
  swap: number;
  profit: number;
  netProfit: number;
  warning?: string | null;
}

export interface Mt5ParsedReport {
  summary: Mt5ReportSummary;
  settings: Record<string, CellValue>;
  results: Record<string, CellValue>;
  orders: Mt5OrderInput[];
  deals: Mt5DealInput[];
  trades: Mt5ReconstructedTrade[];
  warnings: string[];
}

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

interface SheetData {
  name: string;
  rows: RowMap;
}

interface WorkbookData {
  sheets: SheetData[];
  sharedStrings: string[];
}

interface SectionRows {
  strategyTesterReport: number | null;
  settings: number | null;
  results: number | null;
  orders: number | null;
  deals: number | null;
}

export interface Mt5WorksheetDebug {
  name: string;
  nonEmptyRows: number;
  firstNonEmptyRows: Array<{ row: number; cells: CellMap }>;
  sectionRows: SectionRows;
}

export interface Mt5ParseDebug {
  bufferLength: number;
  isZip: boolean;
  zipEntries: string[];
  worksheetFiles: string[];
  sheetNames: string[];
  selectedSheetName: string | null;
  sharedStringsCount: number;
  firstSharedStrings: string[];
  worksheets: Mt5WorksheetDebug[];
  detectedSectionRows: SectionRows | null;
  warnings: string[];
}

const REPORT_PAIR_COLUMNS: Array<[string, string]> = [['A', 'D'], ['E', 'H'], ['I', 'L']];
const ORDER_COLUMNS = ['A', 'B', 'C', 'D', 'E', 'G', 'H', 'I', 'J', 'L', 'M'];
const DEAL_COLUMNS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'];

function readUInt16(buffer: Buffer, offset: number): number {
  return buffer.readUInt16LE(offset);
}

function readUInt32(buffer: Buffer, offset: number): number {
  return buffer.readUInt32LE(offset);
}

function parseZip(buffer: Buffer): Map<string, Buffer> {
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0; i--) {
    if (readUInt32(buffer, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Invalid XLSX file: ZIP directory not found.');

  const entryCount = readUInt16(buffer, eocd + 10);
  const centralDirectoryOffset = readUInt32(buffer, eocd + 16);
  const entries: ZipEntry[] = [];
  let cursor = centralDirectoryOffset;

  for (let i = 0; i < entryCount; i++) {
    if (readUInt32(buffer, cursor) !== 0x02014b50) break;
    const method = readUInt16(buffer, cursor + 10);
    const compressedSize = readUInt32(buffer, cursor + 20);
    const uncompressedSize = readUInt32(buffer, cursor + 24);
    const fileNameLength = readUInt16(buffer, cursor + 28);
    const extraLength = readUInt16(buffer, cursor + 30);
    const commentLength = readUInt16(buffer, cursor + 32);
    const localHeaderOffset = readUInt32(buffer, cursor + 42);
    const name = buffer.toString('utf8', cursor + 46, cursor + 46 + fileNameLength);
    entries.push({ name, method, compressedSize, uncompressedSize, localHeaderOffset });
    cursor += 46 + fileNameLength + extraLength + commentLength;
  }

  const files = new Map<string, Buffer>();
  for (const entry of entries) {
    const local = entry.localHeaderOffset;
    if (readUInt32(buffer, local) !== 0x04034b50) continue;
    const nameLength = readUInt16(buffer, local + 26);
    const extraLength = readUInt16(buffer, local + 28);
    const start = local + 30 + nameLength + extraLength;
    const compressed = buffer.subarray(start, start + entry.compressedSize);
    if (entry.method === 0) files.set(entry.name, compressed);
    if (entry.method === 8) files.set(entry.name, zlib.inflateRawSync(compressed, { finishFlush: zlib.constants.Z_SYNC_FLUSH }));
    if (entry.method !== 0 && entry.method !== 8 && entry.uncompressedSize > 0) {
      throw new Error(`Unsupported XLSX compression method ${entry.method} for ${entry.name}.`);
    }
  }
  return files;
}

function decodeXmlBuffer(buffer: Buffer): string {
  if (buffer.length >= 2) {
    if (buffer[0] === 0xff && buffer[1] === 0xfe) return buffer.toString('utf16le', 2);
    if (buffer[0] === 0xfe && buffer[1] === 0xff) {
      const swapped = Buffer.alloc(buffer.length - 2);
      for (let i = 2; i + 1 < buffer.length; i += 2) {
        swapped[i - 2] = buffer[i + 1];
        swapped[i - 1] = buffer[i];
      }
      return swapped.toString('utf16le');
    }
  }

  const utf16Guess = buffer.toString('utf16le');
  if (utf16Guess.includes('<?xml') || utf16Guess.includes('<worksheet') || utf16Guess.includes('<sst')) {
    return utf16Guess.replace(/^\ufeff/, '');
  }

  return buffer.toString('utf8').replace(/^\ufeff/, '');
}

function xmlDecode(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function attr(xml: string, name: string): string | null {
  const match = xml.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`, 'i'));
  return match ? xmlDecode(match[1]) : null;
}

function splitCellRef(ref: string): { col: string; row: number } | null {
  const match = ref.match(/^([A-Z]+)(\d+)$/i);
  if (!match) return null;
  return { col: match[1].toUpperCase(), row: Number(match[2]) };
}

function parseSharedStrings(xml: string): string[] {
  const strings: string[] = [];
  for (const item of xml.matchAll(/<si\b[\s\S]*?<\/si>/g)) {
    const pieces = [...item[0].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => xmlDecode(m[1]));
    strings.push(pieces.join(''));
  }
  return strings;
}

function cellText(body: string, type: string | null, sharedStrings: string[]): string {
  const inlinePieces = [...body.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => xmlDecode(m[1]));
  if (inlinePieces.length) return inlinePieces.join('').trim();
  const valueMatch = body.match(/<v>([\s\S]*?)<\/v>/);
  const raw = valueMatch ? xmlDecode(valueMatch[1]) : '';
  if (type === 's') return (sharedStrings[Number(raw)] || '').trim();
  return raw.trim();
}

function parseSheetRows(xml: string, sharedStrings: string[]): RowMap {
  const rows: RowMap = {};
  for (const rowMatch of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const explicitRow = Number(attr(rowMatch[1], 'r'));
    const rowCells: CellMap = {};
    for (const cellMatch of rowMatch[2].matchAll(/<c\b([^>]*?)\/>|<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      if (cellMatch[1] !== undefined) continue;
      const attributes = cellMatch[2] || '';
      const body = cellMatch[3] || '';
      const ref = attr(attributes, 'r');
      if (!ref) continue;
      const address = splitCellRef(ref);
      if (!address) continue;
      const type = attr(attributes, 't');
      const value = cellText(body, type, sharedStrings);
      if (value !== '') rowCells[address.col] = value;
      if (!rows[address.row]) rows[address.row] = {};
    }
    if (Object.keys(rowCells).length) {
      const rowNumber = explicitRow || Math.min(...Object.keys(rowCells).map(() => 0));
      rows[Number.isFinite(rowNumber) && rowNumber > 0 ? rowNumber : Object.keys(rows).length + 1] = rowCells;
    }
  }
  return rows;
}

function getWorkbookData(files: Map<string, Buffer>): WorkbookData {
  const sharedStrings = files.get('xl/sharedStrings.xml') ? parseSharedStrings(decodeXmlBuffer(files.get('xl/sharedStrings.xml')!)) : [];
  const workbook = files.get('xl/workbook.xml') ? decodeXmlBuffer(files.get('xl/workbook.xml')!) : '';
  const workbookRels = files.get('xl/_rels/workbook.xml.rels') ? decodeXmlBuffer(files.get('xl/_rels/workbook.xml.rels')!) : '';
  const rels = new Map<string, string>();

  for (const rel of workbookRels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(rel[0], 'Id');
    const target = attr(rel[0], 'Target');
    if (!id || !target) continue;
    const cleanTarget = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^xl\//, '')}`;
    rels.set(id, cleanTarget.replace(/\/\.\//g, '/'));
  }

  const sheets: SheetData[] = [];
  for (const sheet of workbook.matchAll(/<sheet\b[^>]*>/g)) {
    const name = attr(sheet[0], 'name') || `Sheet ${sheets.length + 1}`;
    const relId = attr(sheet[0], 'r:id');
    const path = relId ? rels.get(relId) : null;
    const xml = path && files.get(path) ? decodeXmlBuffer(files.get(path)!) : null;
    if (xml) sheets.push({ name, rows: parseSheetRows(xml, sharedStrings) });
  }

  if (!sheets.length) {
    for (const [name, data] of files) {
      if (/^xl\/worksheets\/sheet\d+\.xml$/i.test(name)) {
        sheets.push({ name, rows: parseSheetRows(decodeXmlBuffer(data), sharedStrings) });
      }
    }
  }

  return { sheets, sharedStrings };
}

function normalize(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/:/g, '')
    .replace(/\s+/g, ' ');
}

function rowText(row: CellMap): string {
  return Object.keys(row).sort().map((col) => row[col]).filter(Boolean).join(' ');
}

function findSectionRow(rows: RowMap, label: string): number | null {
  const wanted = normalize(label);
  for (const rowNumber of Object.keys(rows).map(Number).sort((a, b) => a - b)) {
    for (const value of Object.values(rows[rowNumber])) {
      if (normalize(value) === wanted) return rowNumber;
    }
  }
  return null;
}

function parseNumber(value: unknown): number | null {
  const text = String(value ?? '').replace(/\u00a0/g, ' ').trim();
  if (!text || text === '-') return null;
  const parenNegative = /^\(.*\)$/.test(text);
  const normalized = text.replace(/,/g, '').replace(/\s+/g, ' ');
  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  if (!Number.isFinite(parsed)) return null;
  return parenNegative ? -parsed : parsed;
}

function parseDate(value: unknown): Date | null {
  const text = String(value ?? '').trim();
  const match = text.match(/(\d{4})[./-](\d{2})[./-](\d{2})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!match) return null;
  const [, y, m, d, hh = '00', mm = '00', ss = '00'] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss)));
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseMoneyPercent(value: unknown): { amount: number | null; pct: number | null } {
  const text = String(value ?? '');
  const first = parseNumber(text);
  const paren = text.match(/\(([-+]?[\d.,]+)\s*%?\)/);
  const parenNumber = paren ? parseNumber(paren[1]) : null;
  if (/%\s*\(/.test(text)) return { amount: parenNumber, pct: first };
  if (/\(\s*[-+]?[\d.,]+\s*%\s*\)/.test(text)) return { amount: first, pct: parenNumber };
  return { amount: first, pct: null };
}

function parseCountPercent(value: unknown): { count: number | null; pct: number | null } {
  const text = String(value ?? '');
  const count = parseNumber(text);
  const pct = parseNumber(text.match(/\(([-+]?[\d.,]+)\s*%\)/)?.[1]);
  return { count, pct };
}

function parseCountAmount(value: unknown): { count: number | null; amount: number | null } {
  const text = String(value ?? '');
  const count = parseNumber(text);
  const amount = parseNumber(text.match(/\(([-+]?[\d.,]+)\)/)?.[1]);
  return { count, amount };
}

function rawValue(row: CellMap, col: string): string | null {
  const value = row[col]?.trim();
  return value || null;
}

function parseSettings(rows: RowMap, sections: SectionRows): Record<string, CellValue> {
  if (!sections.settings || !sections.results) return {};
  const settings: Record<string, CellValue> = {};
  const inputs: string[] = [];

  for (let rowNumber = sections.settings + 1; rowNumber < sections.results; rowNumber++) {
    const row = rows[rowNumber] || {};
    const label = rawValue(row, 'A');
    const value = rawValue(row, 'D');
    const key = normalize(label);

    if (key === 'inputs') {
      if (value) inputs.push(value);
      continue;
    }
    if (!label && value && inputs.length) {
      inputs.push(value);
      continue;
    }
    if (label && value) {
      settings[label.replace(/:\s*$/, '')] = value;
    }
  }

  if (inputs.length) settings.Inputs = inputs;
  return settings;
}

function parseResults(rows: RowMap, sections: SectionRows): Record<string, CellValue> {
  if (!sections.results) return {};
  const end = sections.orders || sections.deals || Math.max(...Object.keys(rows).map(Number)) + 1;
  const results: Record<string, CellValue> = {};

  for (let rowNumber = sections.results + 1; rowNumber < end; rowNumber++) {
    const row = rows[rowNumber] || {};
    for (const [labelCol, valueCol] of REPORT_PAIR_COLUMNS) {
      const label = rawValue(row, labelCol);
      const value = rawValue(row, valueCol);
      if (label && value !== null) results[label.replace(/:\s*$/, '')] = value;
    }
  }
  return results;
}

function resultValue(results: Record<string, CellValue>, labels: string[]): CellValue | null {
  for (const [key, value] of Object.entries(results)) {
    const normalized = normalize(key);
    if (labels.some((label) => normalized === label || normalized.includes(label))) return value;
  }
  return null;
}

function settingValue(settings: Record<string, CellValue>, labels: string[]): CellValue | null {
  for (const [key, value] of Object.entries(settings)) {
    const normalized = normalize(key);
    if (labels.some((label) => normalized === label || normalized.includes(label))) return value;
  }
  return null;
}

function parseSummary(settings: Record<string, CellValue>, results: Record<string, CellValue>): Mt5ReportSummary {
  const period = String(settingValue(settings, ['period']) ?? '');
  const periodMatch = period.match(/^([^\s(]+)\s*(?:\((\d{4}[./-]\d{2}[./-]\d{2})\s*-\s*(\d{4}[./-]\d{2}[./-]\d{2})\))?/);
  const short = parseCountPercent(resultValue(results, ['short trades won %', 'short trades']));
  const long = parseCountPercent(resultValue(results, ['long trades won %', 'long trades']));
  const profitTrades = parseCountPercent(resultValue(results, ['profit trades % of total', 'profit trades']));
  const lossTrades = parseCountPercent(resultValue(results, ['loss trades % of total', 'loss trades']));
  const balanceDd = parseMoneyPercent(resultValue(results, ['balance drawdown maximal']));
  const equityDd = parseMoneyPercent(resultValue(results, ['equity drawdown maximal']));
  const maxWins = parseCountAmount(resultValue(results, ['maximum consecutive wins']));
  const maxLosses = parseCountAmount(resultValue(results, ['maximum consecutive losses']));

  return {
    expertName: String(settingValue(settings, ['expert']) ?? '') || null,
    symbol: String(settingValue(settings, ['symbol']) ?? '') || null,
    timeframe: periodMatch?.[1] || null,
    periodStart: periodMatch?.[2] ? parseDate(periodMatch[2]) : null,
    periodEnd: periodMatch?.[3] ? parseDate(periodMatch[3]) : null,
    initialDeposit: parseNumber(settingValue(settings, ['initial deposit'])),
    currency: String(settingValue(settings, ['currency']) ?? '') || null,
    leverage: String(settingValue(settings, ['leverage']) ?? '') || null,
    totalNetProfit: parseNumber(resultValue(results, ['total net profit'])),
    grossProfit: parseNumber(resultValue(results, ['gross profit'])),
    grossLoss: parseNumber(resultValue(results, ['gross loss'])),
    profitFactor: parseNumber(resultValue(results, ['profit factor'])),
    expectedPayoff: parseNumber(resultValue(results, ['expected payoff'])),
    recoveryFactor: parseNumber(resultValue(results, ['recovery factor'])),
    sharpeRatio: parseNumber(resultValue(results, ['sharpe ratio'])),
    totalTrades: parseNumber(resultValue(results, ['total trades'])),
    totalDeals: parseNumber(resultValue(results, ['total deals'])),
    winrate: profitTrades.pct,
    profitTrades: profitTrades.count,
    lossTrades: lossTrades.count,
    shortTrades: short.count,
    shortWinrate: short.pct,
    longTrades: long.count,
    longWinrate: long.pct,
    balanceDrawdownMax: balanceDd.amount,
    balanceDrawdownPct: balanceDd.pct,
    equityDrawdownMax: equityDd.amount,
    equityDrawdownPct: equityDd.pct,
    largestProfitTrade: parseNumber(resultValue(results, ['largest profit trade'])),
    largestLossTrade: parseNumber(resultValue(results, ['largest loss trade'])),
    averageProfitTrade: parseNumber(resultValue(results, ['average profit trade'])),
    averageLossTrade: parseNumber(resultValue(results, ['average loss trade'])),
    maxConsecutiveWins: maxWins.count,
    maxConsecutiveLosses: maxLosses.count,
    averageConsecutiveWins: parseNumber(resultValue(results, ['average consecutive wins'])),
    averageConsecutiveLosses: parseNumber(resultValue(results, ['average consecutive losses'])),
    zScore: parseNumber(resultValue(results, ['z-score', 'z score'])),
    ahpr: parseNumber(resultValue(results, ['ahpr'])),
    ghpr: parseNumber(resultValue(results, ['ghpr'])),
    finalBalance: null,
  };
}

function headerName(value: string): string {
  return normalize(value);
}

function findHeaderRow(rows: RowMap, start: number, end: number, required: string[]): number | null {
  for (let rowNumber = start + 1; rowNumber < end; rowNumber++) {
    const row = rows[rowNumber] || {};
    const headers = Object.values(row).map(headerName);
    if (required.every((label) => headers.some((header) => header.includes(label)))) return rowNumber;
  }
  return null;
}

function tableRecords(rows: RowMap, headerRow: number, columns: string[], end: number): Array<Record<string, string>> {
  const headers: Record<string, string> = {};
  for (const col of columns) {
    const header = rawValue(rows[headerRow] || {}, col);
    if (header) headers[col] = header;
  }

  const records: Array<Record<string, string>> = [];
  for (let rowNumber = headerRow + 1; rowNumber < end; rowNumber++) {
    const row = rows[rowNumber] || {};
    if (!Object.keys(row).length) continue;
    const firstCell = rawValue(row, 'A');
    if (firstCell && ['orders', 'deals'].includes(normalize(firstCell))) break;
    const record: Record<string, string> = {};
    for (const col of columns) {
      const header = headers[col];
      if (header) record[header] = rawValue(row, col) || '';
    }
    if (Object.values(record).some(Boolean)) records.push(record);
  }
  return records;
}

function pick(row: Record<string, string>, names: string[]): string | null {
  for (const [key, value] of Object.entries(row)) {
    const normalized = headerName(key);
    if (names.some((name) => normalized === name) && value.trim()) return value;
  }
  for (const [key, value] of Object.entries(row)) {
    const normalized = headerName(key);
    if (names.some((name) => normalized.includes(name)) && value.trim()) return value;
  }
  return null;
}

function parseOrders(rows: RowMap, sections: SectionRows): Mt5OrderInput[] {
  if (!sections.orders) return [];
  const end = sections.deals || Math.max(...Object.keys(rows).map(Number)) + 1;
  const headerRow = findHeaderRow(rows, sections.orders, end, ['open time', 'order', 'symbol', 'type']);
  if (!headerRow) return [];

  return tableRecords(rows, headerRow, ORDER_COLUMNS, end).map((row) => ({
    openTime: parseDate(pick(row, ['open time'])),
    orderId: pick(row, ['order']),
    symbol: pick(row, ['symbol']),
    type: pick(row, ['type']),
    volume: parseNumber(pick(row, ['volume'])),
    price: parseNumber(pick(row, ['price'])),
    sl: parseNumber(pick(row, ['s / l', 'sl'])),
    tp: parseNumber(pick(row, ['t / p', 'tp'])),
    closeTime: parseDate(pick(row, ['time'])),
    state: pick(row, ['state']),
    comment: pick(row, ['comment']),
    raw: row,
  }));
}

function parseDeals(rows: RowMap, sections: SectionRows): Mt5DealInput[] {
  if (!sections.deals) return [];
  const end = Math.max(...Object.keys(rows).map(Number)) + 1;
  const headerRow = findHeaderRow(rows, sections.deals, end, ['time', 'deal', 'type']);
  if (!headerRow) return [];

  return tableRecords(rows, headerRow, DEAL_COLUMNS, end).map((row) => ({
    time: parseDate(pick(row, ['time'])),
    dealId: pick(row, ['deal']),
    symbol: pick(row, ['symbol']),
    type: pick(row, ['type']),
    direction: pick(row, ['direction']),
    positionId: pick(row, ['position']),
    volume: parseNumber(pick(row, ['volume'])),
    price: parseNumber(pick(row, ['price'])),
    orderId: pick(row, ['order']),
    commission: parseNumber(pick(row, ['commission'])),
    swap: parseNumber(pick(row, ['swap'])),
    profit: parseNumber(pick(row, ['profit'])),
    balance: parseNumber(pick(row, ['balance'])),
    comment: pick(row, ['comment']),
    raw: row,
  }));
}

function reconstructTrades(deals: Mt5DealInput[]): Mt5ReconstructedTrade[] {
  const trades: Mt5ReconstructedTrade[] = [];
  const openDeals: Mt5DealInput[] = [];
  const sorted = deals
    .filter((deal) => normalize(deal.type) !== 'balance')
    .sort((a, b) => (a.time?.getTime() || 0) - (b.time?.getTime() || 0));

  for (const deal of sorted) {
    const direction = normalize(deal.direction);
    if (direction === 'in') {
      openDeals.push(deal);
      continue;
    }
    if (direction !== 'out') continue;

    const matchIndex = openDeals.findIndex((entry) => (
      (!deal.symbol || !entry.symbol || deal.symbol === entry.symbol)
      && (deal.volume === null || entry.volume === null || deal.volume === entry.volume)
    ));
    const entry = matchIndex >= 0 ? openDeals.splice(matchIndex, 1)[0] : openDeals.shift();
    if (!entry) continue;

    const commission = (entry.commission || 0) + (deal.commission || 0);
    const swap = (entry.swap || 0) + (deal.swap || 0);
    const profit = (entry.profit || 0) + (deal.profit || 0);
    trades.push({
      entryTime: entry.time,
      exitTime: deal.time,
      entryDealId: entry.dealId,
      exitDealId: deal.dealId,
      orderId: deal.orderId || entry.orderId,
      side: normalize(entry.type) === 'sell' ? 'SHORT' : 'LONG',
      entryPrice: entry.price,
      exitPrice: deal.price,
      volume: entry.volume || deal.volume,
      commission,
      swap,
      profit,
      netProfit: profit + commission + swap,
      warning: null,
    });
  }

  return trades;
}

function sectionRows(rows: RowMap): SectionRows {
  return {
    strategyTesterReport: findSectionRow(rows, 'Strategy Tester Report'),
    settings: findSectionRow(rows, 'Settings'),
    results: findSectionRow(rows, 'Results'),
    orders: findSectionRow(rows, 'Orders'),
    deals: findSectionRow(rows, 'Deals'),
  };
}

function debugRows(rows: RowMap, from: number, to: number): Array<{ row: number; cells: CellMap }> {
  const out: Array<{ row: number; cells: CellMap }> = [];
  for (let row = from; row <= to; row++) {
    if (rows[row] && Object.keys(rows[row]).length) out.push({ row, cells: rows[row] });
  }
  return out;
}

function firstNonEmptyRows(rows: RowMap, limit = 30): Array<{ row: number; cells: CellMap }> {
  return Object.keys(rows)
    .map(Number)
    .sort((a, b) => a - b)
    .filter((row) => rows[row] && Object.keys(rows[row]).length)
    .slice(0, limit)
    .map((row) => ({ row, cells: rows[row] }));
}

function worksheetScore(rows: RowMap): number {
  const sections = sectionRows(rows);
  return [
    sections.strategyTesterReport,
    sections.settings,
    sections.results,
    sections.orders,
    sections.deals,
  ].filter(Boolean).length;
}

function bestSheet(sheets: SheetData[]): SheetData | null {
  return sheets
    .map((sheet, index) => ({ sheet, index, score: worksheetScore(sheet.rows) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)[0]?.sheet || null;
}

function parseSelectedWorksheet(buffer: Buffer): { files: Map<string, Buffer>; workbook: WorkbookData; sheet: SheetData } {
  const files = parseZip(buffer);
  const workbook = getWorkbookData(files);
  const sheet = bestSheet(workbook.sheets);
  if (!sheet) throw new Error('No worksheet found in XLSX file.');
  return { files, workbook, sheet };
}

export function parseMt5XlsxReport(buffer: Buffer): Mt5ParsedReport {
  const { workbook, sheet } = parseSelectedWorksheet(buffer);
  const sections = sectionRows(sheet.rows);
  const settings = parseSettings(sheet.rows, sections);
  const results = parseResults(sheet.rows, sections);
  const orders = parseOrders(sheet.rows, sections);
  const deals = parseDeals(sheet.rows, sections);
  const summary = parseSummary(settings, results);
  const warnings: string[] = [];

  if (!sections.strategyTesterReport) warnings.push('Strategy Tester Report section was not detected.');
  if (!sections.settings || !Object.keys(settings).length) warnings.push('Settings section was not detected.');
  if (!sections.results || !Object.keys(results).length) warnings.push('Results section was not detected.');
  if (!orders.length) warnings.push('Orders table was not detected or had no rows.');
  if (!deals.length) warnings.push('Deals table was not detected or had no rows.');

  if (process.env.NODE_ENV === 'development' && (!Object.keys(settings).length || !Object.keys(results).length)) {
    console.debug('MT5 XLSX parser debug', {
      sheetNames: workbook.sheets.map((s) => s.name),
      sharedStrings: workbook.sharedStrings.length,
      firstSharedStrings: workbook.sharedStrings.slice(0, 20),
      sections,
      rows1To70: debugRows(sheet.rows, 1, 70),
      rows80To180: debugRows(sheet.rows, 80, 180),
    });
  }

  return {
    summary,
    settings,
    results,
    orders,
    deals,
    trades: reconstructTrades(deals),
    warnings,
  };
}

export function debugMt5XlsxReport(buffer: Buffer): Mt5ParseDebug {
  const isZip = buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
  const warnings: string[] = [];

  try {
    const { files, workbook, sheet } = parseSelectedWorksheet(buffer);
    const parsed = parseMt5XlsxReport(buffer);
    warnings.push(...parsed.warnings);
    const selectedSections = sectionRows(sheet.rows);
    return {
      bufferLength: buffer.length,
      isZip,
      zipEntries: [...files.keys()].sort(),
      worksheetFiles: [...files.keys()].filter((name) => /^xl\/worksheets\/.*\.xml$/i.test(name)).sort(),
      sheetNames: workbook.sheets.map((s) => s.name),
      selectedSheetName: sheet.name,
      sharedStringsCount: workbook.sharedStrings.length,
      firstSharedStrings: workbook.sharedStrings.slice(0, 20),
      worksheets: workbook.sheets.map((s) => ({
        name: s.name,
        nonEmptyRows: Object.keys(s.rows).length,
        firstNonEmptyRows: firstNonEmptyRows(s.rows, 80),
        sectionRows: sectionRows(s.rows),
      })),
      detectedSectionRows: selectedSections,
      warnings,
    };
  } catch (error: any) {
    return {
      bufferLength: buffer.length,
      isZip,
      zipEntries: [],
      worksheetFiles: [],
      sheetNames: [],
      selectedSheetName: null,
      sharedStringsCount: 0,
      firstSharedStrings: [],
      worksheets: [],
      detectedSectionRows: null,
      warnings: [error.message || 'Failed to inspect MT5 XLSX report.'],
    };
  }
}
