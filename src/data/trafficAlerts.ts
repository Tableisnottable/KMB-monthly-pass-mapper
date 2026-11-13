/** Official source records only. No generated route numbers or severity. */
export const TRAFFIC_NEWS_URL = 'https://resource.data.one.gov.hk/td/en/specialtrafficnews.xml';
export type TrafficNoticeCategory = 'BUS' | 'ROAD' | 'OTHER';
export interface TrafficNotice {
  id: string;
  textTc: string;
  textEn: string;
  sourceReference: string;
  sourceReferenceAt: string | null;
  sourceStatus: string;
  publicTransport: boolean;
  category: TrafficNoticeCategory;
  sourceName: string;
  sourceUrl: string;
}
export interface TrafficFeed {
  data: TrafficNotice[];
  meta: {
    status: 'AVAILABLE' | 'UNAVAILABLE';
    fetchedAt: string | null;
    checkedAt: string;
    source: string;
    timezone: 'Asia/Hong_Kong';
    scope: string;
    category?: 'BUS' | 'ROAD';
  };
}
export const operatorNoticeLinks = [
  { name: '九巴 KMB', url: 'https://www.kmb.hk/' },
  { name: '城巴 Citybus', url: 'https://www.citybus.com.hk/' },
  { name: '龍運 LWB', url: 'https://www.lwb.hk/' },
  { name: '港鐵巴士 MTR Bus', url: 'https://www.mtr.com.hk/' },
] as const;
