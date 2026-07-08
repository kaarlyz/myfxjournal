export const formatTradeTime = (utcDateStr: string, timezone: string = 'Asia/Jakarta'): string => {
  try {
    const d = new Date(utcDateStr);
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(d);
  } catch (error) {
    return new Date(utcDateStr).toLocaleString();
  }
};
