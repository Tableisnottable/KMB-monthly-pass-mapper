export type NotificationTarget = {
  provider: 'KMB' | 'CTB' | 'MTR' | 'LRT' | 'GMB';
  route: string; stop: string; direction?: string; seq?: number; destinations?: string[];
};
export type JourneyWatch = {
  targets: NotificationTarget[]; route: string; stopName: string; destination: string;
  plannedTime: string; locale: 'en' | 'zh';
};
export function targetUrl(target: NotificationTarget): string {
  if (!/^[A-Z0-9+-]{1,20}$/.test(target.route) || !/^[A-Za-z0-9:-]{1,40}$/.test(target.stop)) throw new Error('Invalid route or stop');
  switch (target.provider) {
    case 'KMB': return `https://data.etabus.gov.hk/v1/transport/kmb/stop-eta/${target.stop}`;
    case 'CTB': return `https://rt.data.gov.hk/v2/transport/citybus/eta/CTB/${target.stop}/${target.route}`;
    case 'MTR': return `https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php?line=${target.route}&sta=${target.stop}`;
    case 'LRT': if (!/^\d+$/.test(target.stop)) throw new Error('Invalid station'); return `https://rt.data.gov.hk/v1/transport/mtr/lrt/getSchedule?station_id=${target.stop}`;
    case 'GMB': if (!/^\d+$/.test(target.route) || !/^[12]$/.test(target.direction ?? '') || !Number.isInteger(target.seq) || target.seq! < 1 || target.seq! > 300) throw new Error('Invalid minibus stop');
      return `https://data.etagmb.gov.hk/eta/route-stop/${target.route}/${target.direction}/${target.seq}`;
    default: throw new Error('Unsupported provider');
  }
}
export function parseJourneyWatch(value: unknown, now = Date.now()): JourneyWatch {
  if (!value || typeof value !== 'object') throw new Error('Choose a journey first');
  const v = value as JourneyWatch;
  if (!Array.isArray(v.targets) || v.targets.length > 2 || !['route', 'stopName', 'destination'].every(key => typeof v[key as keyof JourneyWatch] === 'string' && (v[key as 'route'].length > 0) && v[key as 'route'].length <= 160)
    || !Number.isFinite(Date.parse(v.plannedTime)) || Date.parse(v.plannedTime) < now - 60_000 || Date.parse(v.plannedTime) > now + 2 * 3600_000) throw new Error('Notifications support boarding within the next two hours');
  const targets = v.targets.map(t => {
    targetUrl(t);
    if (t.direction && !/^[IO12]$/.test(t.direction) || t.seq !== undefined && (!Number.isInteger(t.seq) || t.seq < 1 || t.seq > 300)
      || t.destinations && (!Array.isArray(t.destinations) || t.destinations.length > 150 || t.destinations.some(d => typeof d !== 'string' || d.length > 80))) throw new Error('Invalid notification target');
    return { provider: t.provider, route: t.route, stop: t.stop, direction: t.direction, seq: t.seq, destinations: t.destinations };
  });
  return { targets, route: v.route, stopName: v.stopName, destination: v.destination, plannedTime: v.plannedTime, locale: v.locale === 'en' ? 'en' : 'zh' };
}
export function pushEndpointAllowed(endpoint: string): boolean {
  try { const url = new URL(endpoint); return url.protocol === 'https:' && !url.port && !url.username && !url.password && !url.hash
    && (['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'push.services.mozilla.com', 'web.push.apple.com'].includes(url.hostname)
      || /^[a-z0-9-]+\.notify\.windows\.com$/.test(url.hostname)); } catch { return false; }
}
