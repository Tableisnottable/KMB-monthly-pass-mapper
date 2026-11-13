import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { TRAFFIC_NEWS_URL, type TrafficFeed, type TrafficNotice } from './trafficAlerts';
import { classifyTrafficNotice } from './trafficNoticeCategories';

/** ReferenceDate is a source reference, not an event start or effective date. */
export function parseTrafficReference(value: string): string | null {
  const match = value.trim().match(/^(\d{4})\/(\d{2})\/(\d{2})\s+(?:(上午|下午|AM|PM)\s+)?(\d{1,2}):(\d{2}):(\d{2})(?:\s+(AM|PM))?$/i);
  if (!match) return null;
  const [, year, month, day, before, hours, minutes, seconds, after] = match;
  const marker = (before || after || '').toUpperCase();
  let hour = Number(hours);
  if (Number(minutes) > 59 || Number(seconds) > 59 || hour > (marker ? 12 : 23) || marker && hour < 1) return null;
  if (marker) hour = hour % 12 + (marker === '下午' || marker === 'PM' ? 12 : 0);
  const iso = `${year}-${month}-${day}T${String(hour).padStart(2, '0')}:${minutes}:${seconds}+08:00`;
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) && new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 10) === `${year}-${month}-${day}`
    ? date.toISOString() : null;
}

export function parseTrafficNews(xml: string): TrafficNotice[] {
  if (xml.length > 1_000_000 || /<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) {
    throw new Error('Invalid traffic news XML');
  }
  const parsed = new XMLParser({ ignoreAttributes: false, parseTagValue: false, trimValues: true, htmlEntities: true,
    isArray: name => name === 'message' }).parse(xml);
  const body = parsed?.body;
  if (!body || typeof body !== 'object' || body['@_xmlns'] !== 'http://data.one.gov.hk/td') throw new Error('Unexpected traffic news feed');
  if (body.message === undefined) return [];
  if (!Array.isArray(body.message)) throw new Error('Invalid traffic messages');
  const notices = new Map<string, TrafficNotice>();
  for (const item of body.message) {
    const string = (key: string) => typeof item?.[key] === 'string' ? item[key].trim() as string : '';
    const id = string('msgID'), textTc = string('ChinText'), textEn = string('EngText'), reference = string('ReferenceDate');
    if (!/^\d+$/.test(id) || !textTc && !textEn) throw new Error('Incomplete traffic news record');
    // A road near a ferry pier is not necessarily a ferry service disruption.
    const publicTransport = /\b(?:bus(?:es)?|minibus(?:es)?|MTR|rail(?:way)?|train(?:s)?|tram(?:way)?)\b|\bferry\s+(?:service|route|sailing|operator)|\bferries\s+(?:are|will)|巴士|小巴|港鐵|鐵路|列車|電車|渡輪(?:服務|航線|班次)/i.test(textTc + ' ' + textEn);
    notices.set(id, { id: 'td:' + id, textTc, textEn, sourceReference: reference,
      sourceReferenceAt: parseTrafficReference(reference), sourceStatus: string('CurrentStatus'), publicTransport,
      category: classifyTrafficNotice(textTc + '\n' + textEn),
      sourceName: '運輸署特別交通消息', sourceUrl: TRAFFIC_NEWS_URL });
  }
  return Array.from(notices.values()).sort((a, b) => (b.sourceReferenceAt ?? '').localeCompare(a.sourceReferenceAt ?? '')
    || Number(b.id.slice(3)) - Number(a.id.slice(3)));
}

export async function loadTrafficNews(fetcher: typeof fetch = fetch, now = new Date()): Promise<TrafficFeed> {
  const checkedAt = now.toISOString();
  const meta = { checkedAt, source: TRAFFIC_NEWS_URL, timezone: 'Asia/Hong_Kong' as const,
    scope: 'TD special traffic news only; not a complete feed of operator route notices.' };
  try {
    const response = await fetcher(TRAFFIC_NEWS_URL, { cache: 'no-store', signal: AbortSignal.timeout(8000),
      headers: { Accept: 'application/xml, text/xml' } });
    if (!response.ok) throw new Error('Traffic news unavailable');
    const data = parseTrafficNews(await response.text());
    return { data, meta: { ...meta, status: 'AVAILABLE', fetchedAt: new Date().toISOString() } };
  } catch {
    return { data: [], meta: { ...meta, status: 'UNAVAILABLE', fetchedAt: null } };
  }
}

let cache: { expires: number; result: TrafficFeed } | undefined;
let pending: Promise<TrafficFeed> | undefined;
export async function getTrafficNews(): Promise<TrafficFeed> {
  if (cache && cache.expires > Date.now()) return cache.result;
  if (!pending) pending = loadTrafficNews().then(result => {
    cache = { expires: Date.now() + (result.meta.status === 'AVAILABLE' ? 60000 : 10000), result };
    return result;
  }).finally(() => { pending = undefined; });
  return pending;
}
