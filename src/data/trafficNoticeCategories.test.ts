import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { classifyTrafficNotice, trafficFeedForCategory } from './trafficNoticeCategories';
import { parseTrafficNews } from './officialTrafficNews';
import type { TrafficFeed } from './trafficAlerts';

const feed: TrafficFeed = { data: parseTrafficNews(readFileSync('src/data/fixtures/td-special-traffic-news.xml', 'utf8')),
  meta: { status: 'AVAILABLE', checkedAt: '2026-11-13T18:00:00Z', fetchedAt: '2026-11-13T18:00:00Z',
    source: 'TD recorded fixture', timezone: 'Asia/Hong_Kong', scope: 'Test fixture' } };

describe('Separate bus and road notices', () => {
  it('places a mixed road closure and bus diversion only in bus news', () => {
    const buses = trafficFeedForCategory(feed, 'BUS'), roads = trafficFeedForCategory(feed, 'ROAD');
    expect(buses.data.map(item => item.id)).toEqual(['td:281117']);
    expect(buses.data[0].textTc).toContain('79K');
    expect(buses.data[0].textTc).toContain('全線現已封閉');
    expect(roads.data.some(item => item.id === 'td:281117')).toBe(false);
    expect(roads.data).toHaveLength(5);
    const busIds = new Set(buses.data.map(item => item.id));
    expect(roads.data.some(item => busIds.has(item.id))).toBe(false);
    expect(buses.meta.category).toBe('BUS'); expect(roads.meta.category).toBe('ROAD');
    expect(feed.data).toHaveLength(9);
  });
  it.each([
    '九巴第5號線改道，巴士站暫停使用。',
    'Citybus route A20 has a revised timetable.',
    'Green minibus fares will change.',
    '巴士站將遷移至臨時位置。',
    'The bus stop is temporarily relocated.',
  ])('classifies bus/minibus service updates: %s', text => {
    expect(classifyTrafficNotice(text)).toBe('BUS');
  });
  it.each([
    '因緊急路面維修，東區走廊近北角碼頭的快線現已封閉。',
    'One lane of Nathan Road near a bus stop is closed.',
    '彌敦道近巴士站的行車線封閉。',
    'Emergency road works near MTR Central Station.',
    'Heavy traffic on Tuen Mun Road.',
  ])('keeps road-only notices in road news: %s', text => {
    expect(classifyTrafficNotice(text)).toBe('ROAD');
  });
  it.each([
    'High Speed Rail train trips are cancelled due to traffic control.',
    '港鐵列車服務暫停。',
    'Ferry services are suspended.',
    '渡輪航線暫停服務。',
    'The routine maintenance schedule of the escalator system; use nearby streets.',
  ])('does not mislabel other transport modes as bus or road news: %s', text => {
    expect(classifyTrafficNotice(text)).toBe('OTHER');
  });
  it('preserves provider-unavailable and empty-feed states for both categories', () => {
    for (const category of ['BUS', 'ROAD'] as const) {
      const unavailable = trafficFeedForCategory({ ...feed, data: [], meta: { ...feed.meta, status: 'UNAVAILABLE', fetchedAt: null } }, category);
      expect(unavailable).toMatchObject({ data: [], meta: { status: 'UNAVAILABLE', fetchedAt: null, category } });
      expect(trafficFeedForCategory({ ...feed, data: [] }, category).meta.status).toBe('AVAILABLE');
    }
  });
});
