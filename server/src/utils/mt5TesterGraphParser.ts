export interface Mt5EquityPointInput {
  time: Date;
  balance: number;
  equity: number;
  depositLoad: number | null;
}

function decodeGraphBuffer(buffer: Buffer): string {
  if (buffer.length >= 2) {
    const b0 = buffer[0];
    const b1 = buffer[1];
    if (b0 === 0xff && b1 === 0xfe) return buffer.toString('utf16le', 2);
    if (b0 === 0xfe && b1 === 0xff) {
      const swapped = Buffer.alloc(buffer.length - 2);
      for (let i = 2; i + 1 < buffer.length; i += 2) {
        swapped[i - 2] = buffer[i + 1];
        swapped[i - 1] = buffer[i];
      }
      return swapped.toString('utf16le');
    }
  }

  const utf16Guess = buffer.toString('utf16le');
  if ((utf16Guess.match(/\t/g) || []).length >= 2 && utf16Guess.includes('<DATE>')) {
    return utf16Guess;
  }

  return buffer.toString('utf8');
}

function parseMt5Date(value: string): Date | null {
  const trimmed = value.trim().replace(/^"|"$/g, '');
  const match = trimmed.match(/^(\d{4})[./-](\d{2})[./-](\d{2})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!match) return null;
  const [, y, m, d, hh = '00', mm = '00', ss = '00'] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss)));
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseNumber(value: string | undefined): number | null {
  if (value === undefined) return null;
  const normalized = value.replace(/^"|"$/g, '').replace(/%/g, '').replace(/\s/g, '').replace(/,/g, '');
  if (!normalized || normalized === '-') return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export function parseMt5TesterGraph(buffer: Buffer): Mt5EquityPointInput[] {
  const text = decodeGraphBuffer(buffer).replace(/\u0000/g, '');
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split('\t').map((cell) => cell.trim()));

  if (!rows.length) return [];

  const headerIndex = rows.findIndex((row) => row.some((cell) => cell.toUpperCase() === '<DATE>'));
  if (headerIndex < 0) return [];

  const headers = rows[headerIndex].map((h) => h.toUpperCase());
  const dateIdx = headers.indexOf('<DATE>');
  const balanceIdx = headers.indexOf('<BALANCE>');
  const equityIdx = headers.indexOf('<EQUITY>');
  const depositIdx = headers.indexOf('<DEPOSIT LOAD>');

  return rows.slice(headerIndex + 1).flatMap((row) => {
    const time = parseMt5Date(row[dateIdx] || '');
    const balance = parseNumber(row[balanceIdx]);
    const equity = parseNumber(row[equityIdx]);
    if (!time || balance === null || equity === null) return [];
    return [{
      time,
      balance,
      equity,
      depositLoad: parseNumber(row[depositIdx]),
    }];
  });
}
