import type { TrafficFeed, TrafficNoticeCategory } from './trafficAlerts';

/** Each source message belongs to one section; mixed road/bus notices go to buses. */
export function classifyTrafficNotice(text: string): TrafficNoticeCategory {
  const bus = /\b(?:bus(?:es)?|minibus(?:es)?|coach(?:es)?|KMB|Citybus|LWB|NLB)\b|巴士|小巴|九巴|城巴|龍運|新大嶼山/i.test(text);
  const busService = /\b(?:services?|routes?|timetables?|departures?|headways?|frequenc(?:y|ies)|fares?|divert\w*|suspend\w*|cancel\w*|delay\w*|resum\w*|relocat\w*|detours?|disrupt\w*|affected)\b|改道|停駛|暫停|停用|停靠|取消|延誤|恢復|班次|班距|路線|車費|服務|受影響|遷移|搬遷/i.test(text);
  if (bus && busService) return 'BUS';

  // Keep train/ferry/escalator service announcements out of both requested sections.
  // A location such as "near MTR Central Station" or "North Point Ferry Pier"
  // alone does not identify an announcement about that transport service.
  const otherService = /\b(?:high speed rail|train\s+(?:trips?|services?)|rail(?:way)?\s+services?|MTR\s+services?|tram\s+services?|ferry\s+(?:services?|routes?|sailings?)|escalators?|walkway)\b|鐵路|列車|電車(?:服務|班次)|渡輪(?:服務|航線|班次)|自動扶梯/i.test(text);
  if (otherService) return 'OTHER';

  const roadConditions = /\b(?:lanes?|carriageways?|congestion|roadworks|road works|road surface|traffic control|traffic accident|heavy traffic|road closure|expressways?|motorways?|highways?)\b|行車線|路面|道路工程|封路|交通意外|交通擠塞|交通繁忙|交通管制|道路封閉|交通受阻/i.test(text);
  const road = /\b(?:roads?|streets?|tunnels?|bridges?)\b|路|街|隧道|橋/i.test(text);
  const disruption = /\b(?:clos\w*|accidents?|repairs?|works|congestion|traffic|delay\w*)\b|封閉|意外|工程|維修|擠塞|繁忙|管制/i.test(text);
  return roadConditions || road && disruption ? 'ROAD' : 'OTHER';
}

export function trafficFeedForCategory(feed: TrafficFeed, category: 'BUS' | 'ROAD'): TrafficFeed {
  return { ...feed, data: feed.data.filter(item => item.category === category),
    meta: { ...feed.meta, category, scope: category === 'BUS'
      ? 'TD bus and minibus service notices only; mixed bus/road messages appear here, not in road news. Not a complete operator-notice feed.'
      : 'TD road traffic notices only; bus service messages and other transport modes are excluded.' } };
}
