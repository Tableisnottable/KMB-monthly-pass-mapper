'use client';

import { useMemo, useState } from 'react';

interface TransitRoute {
  route: string;
  bound?: string;
  orig_tc?: string;
  dest_tc?: string;
  orig_en?: string;
  dest_en?: string;
}

interface TransitStop {
  stop: string;
  name_tc: string;
  name_en: string;
  lat: number;
  long: number;
}

interface StopEtaEntry {
  route: string;
  dir?: string;
  dest_tc?: string;
  dest_en?: string;
  eta: string | null;
  eta_seq?: number;
}

interface StopDepartures {
  stopId: string;
  stopName: string;
  entries: { route: string; dest: string; minutes: number[] }[];
  fetchedAt: string;
  error?: string;
}

export function LiveTransitSearch() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [operator, setOperator] = useState<'KMB' | 'CTB'>('KMB');
  const [routes, setRoutes] = useState<TransitRoute[]>([]);
  const [stops, setStops] = useState<TransitStop[]>([]);
  const [selectedFrom, setSelectedFrom] = useState<TransitStop | null>(null);
  const [selectedTo, setSelectedTo] = useState<TransitStop | null>(null);
  const [fromDepartures, setFromDepartures] = useState<StopDepartures | null>(null);
  const [toDepartures, setToDepartures] = useState<StopDepartures | null>(null);
  const [etaLoading, setEtaLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('輸入起點及目的地後按搜尋');

  const filteredRoutes = useMemo(() => {
    const originQuery = from.trim().toLowerCase();
    const destinationQuery = to.trim().toLowerCase();
    return routes.filter((route) => {
      const origin = [route.orig_tc, route.orig_en].filter(Boolean).join(' ').toLowerCase();
      const destination = [route.dest_tc, route.dest_en].filter(Boolean).join(' ').toLowerCase();
      const routeNumber = route.route.toLowerCase();
      const originMatches = !originQuery || origin.includes(originQuery) || routeNumber.includes(originQuery);
      const destinationMatches =
        !destinationQuery || destination.includes(destinationQuery) || routeNumber.includes(destinationQuery);
      return originMatches && destinationMatches;
    });
  }, [from, routes, to]);

  const matchingStops = (query: string) => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return [];
    return stops
      .filter((stop) =>
        [stop.name_tc, stop.name_en, stop.stop].join(' ').toLowerCase().includes(normalizedQuery),
      )
      .slice(0, 8);
  };

  async function search() {
    setLoading(true);
    setStatus('正在讀取官方路線資料...');
    try {
      const [routeResponse, stopResponse] = await Promise.all([
        fetch(`/api/transit?operator=${operator}&resource=routes`, {
          cache: 'no-store',
        }),
        fetch(`/api/transit?operator=${operator}&resource=stops`, {
          cache: 'no-store',
        }),
      ]);
      const response = routeResponse;
      const stopPayload = (await stopResponse.json()) as {
        data?: TransitStop[];
      };
      const payload = (await response.json()) as {
        data?: TransitRoute[];
        error?: string;
      };
      if (!response.ok || !payload.data) {
        throw new Error(payload.error ?? '官方交通 API 暫時未能使用');
      }
      setRoutes(payload.data);
      setStops(stopPayload.data ?? []);
      setSelectedFrom(null);
      setSelectedTo(null);
      setStatus(
        `已載入 ${payload.data.length} 條${operator === 'KMB' ? '九巴' : '城巴'}官方路線及 ${stopPayload.data?.length ?? 0} 個站點`,
      );
    } catch (error) {
      setRoutes([]);
      setStops([]);
      setStatus(error instanceof Error ? error.message : '讀取官方交通 API 失敗');
    } finally {
      setLoading(false);
    }
  }

  function chooseStop(stop: TransitStop, target: 'from' | 'to') {
    if (target === 'from') {
      setFrom(stop.name_tc || stop.name_en);
      setSelectedFrom(stop);
      setFromDepartures(null);
      void fetchStopDepartures(stop, 'from');
    } else {
      setTo(stop.name_tc || stop.name_en);
      setSelectedTo(stop);
      setToDepartures(null);
      void fetchStopDepartures(stop, 'to');
    }
  }

  async function fetchStopDepartures(stop: TransitStop, target: 'from' | 'to') {
    setEtaLoading(true);
    try {
      const response = await fetch(
        `/api/transit?operator=${operator}&resource=stop-eta&stop=${encodeURIComponent(stop.stop)}`,
        { cache: 'no-store' },
      );
      const payload = (await response.json()) as {
        data?: StopEtaEntry[] | Record<string, unknown>;
        error?: string;
      };
      if (!response.ok || !payload.data || Array.isArray(payload.data) === false) {
        throw new Error(payload.error ?? '實時班次暫時未能使用');
      }
      const entries_raw = payload.data as StopEtaEntry[];
      const now = Date.now();
      const grouped = new Map<string, { route: string; dest: string; minutes: number[] }>();
      for (const entry of entries_raw) {
        if (!entry.eta) continue;
        const minutes = Math.max(0, Math.round((new Date(entry.eta).getTime() - now) / 60000));
        const key = `${entry.route}|${entry.dest_tc ?? entry.dest_en ?? ''}`;
        const existing = grouped.get(key);
        if (existing) {
          existing.minutes.push(minutes);
        } else {
          grouped.set(key, {
            route: entry.route,
            dest: entry.dest_tc ?? entry.dest_en ?? '',
            minutes: [minutes],
          });
        }
      }
      const entries = Array.from(grouped.values())
        .map((group) => ({
          ...group,
          minutes: Array.from(new Set(group.minutes)).sort((a, b) => a - b).slice(0, 3),
        }))
        .sort((a, b) => (a.minutes[0] ?? 999) - (b.minutes[0] ?? 999))
        .slice(0, 6);
      const result: StopDepartures = {
        stopId: stop.stop,
        stopName: stop.name_tc || stop.name_en,
        entries,
        fetchedAt: new Date().toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit' }),
      };
      if (target === 'from') {
        setFromDepartures(result);
      } else {
        setToDepartures(result);
      }
    } catch (error) {
      const result: StopDepartures = {
        stopId: stop.stop,
        stopName: stop.name_tc || stop.name_en,
        entries: [],
        fetchedAt: '',
        error: error instanceof Error ? error.message : '讀取實時班次失敗',
      };
      if (target === 'from') {
        setFromDepartures(result);
      } else {
        setToDepartures(result);
      }
    } finally {
      setEtaLoading(false);
    }
  }

  function renderDepartures(departures: StopDepartures | null, label: string) {
    if (!departures) return null;
    return (
      <div className="mt-2 rounded-xl bg-cm-paper/70 p-2">
        <p className="mb-1 text-xs font-bold text-cm-greenDark">
          {label}實時班次
          {departures.fetchedAt ? (
            <span className="ml-2 font-normal text-cm-muted">更新於 {departures.fetchedAt}</span>
          ) : null}
        </p>
        {departures.error ? (
          <p className="text-xs text-cm-muted">{departures.error}</p>
        ) : departures.entries.length === 0 ? (
          <p className="text-xs text-cm-muted">暫時沒有即將到站的班次</p>
        ) : (
          <ul className="space-y-1">
            {departures.entries.map((entry) => (
              <li
                className="flex items-center justify-between gap-2 text-xs"
                key={`${departures.stopId}-${entry.route}-${entry.dest}`}
              >
                <span className="font-extrabold text-cm-greenDark">{entry.route}</span>
                <span className="flex-1 truncate text-cm-muted">{entry.dest}</span>
                <span className="font-bold text-cm-ink">
                  {entry.minutes.map((m) => (m <= 0 ? '即將到站' : `${m} 分`)).join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-2xl border border-cm-line bg-cm-paper/60 p-3">
      <p className="mb-2 text-xs font-bold text-cm-ink">查看車站到站時間</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          aria-label="上車站"
          className="min-w-0 rounded-xl border-0 bg-white px-3 py-2 text-sm ring-1 ring-cm-line"
          onChange={(event) => setFrom(event.target.value)}
          placeholder="輸入車站名稱（如上車站）"
          value={from}
        />
        <input
          aria-label="落車站"
          className="min-w-0 rounded-xl border-0 bg-white px-3 py-2 text-sm ring-1 ring-cm-line"
          onChange={(event) => setTo(event.target.value)}
          placeholder="輸入車站名稱（如落車站）"
          value={to}
        />
        <select
          aria-label="營辦商"
          className="rounded-xl border-0 bg-white px-3 py-2 text-sm ring-1 ring-cm-line"
          onChange={(event) => setOperator(event.target.value as 'KMB' | 'CTB')}
          value={operator}
        >
          <option value="KMB">九巴</option>
          <option value="CTB">城巴</option>
        </select>
        <button
          className="rounded-xl bg-cm-green px-4 py-2 text-sm font-extrabold text-white hover:bg-cm-greenDark"
          disabled={loading}
          onClick={search}
          type="button"
        >
          {loading ? '載入中...' : '查詢車站'}
        </button>
      </div>
      <p className="mt-2 text-xs text-cm-muted">
        只想查看某個車站有哪些路線、下一班幾時到？在這裡輸入車站名稱即可。
        要規劃整個行程，請用下方的「帶我去目的地」。
      </p>
      {stops.length > 0 && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="rounded-xl bg-white p-2">
            <p className="mb-1 text-xs font-bold text-cm-muted">起點站點</p>
            {matchingStops(from).slice(0, 4).map((stop) => (
              <button
                className={`block w-full rounded-lg px-2 py-1 text-left text-xs hover:bg-cm-paper ${
                  selectedFrom?.stop === stop.stop ? 'bg-cm-green/10 text-cm-greenDark' : ''
                }`}
                key={`from-${stop.stop}`}
                onClick={() => chooseStop(stop, 'from')}
                type="button"
              >
                {stop.name_tc} <span className="text-cm-muted">{stop.name_en}</span>
              </button>
            ))}
            {selectedFrom && renderDepartures(fromDepartures, '起點')}
            {etaLoading && !fromDepartures && selectedFrom && (
              <p className="mt-1 text-xs text-cm-muted">載入實時班次中...</p>
            )}
          </div>
          <div className="rounded-xl bg-white p-2">
            <p className="mb-1 text-xs font-bold text-cm-muted">目的地站點</p>
            {matchingStops(to).slice(0, 4).map((stop) => (
              <button
                className={`block w-full rounded-lg px-2 py-1 text-left text-xs hover:bg-cm-paper ${
                  selectedTo?.stop === stop.stop ? 'bg-cm-green/10 text-cm-greenDark' : ''
                }`}
                key={`to-${stop.stop}`}
                onClick={() => chooseStop(stop, 'to')}
                type="button"
              >
                {stop.name_tc} <span className="text-cm-muted">{stop.name_en}</span>
              </button>
            ))}
            {selectedTo && renderDepartures(toDepartures, '目的地')}
            {etaLoading && !toDepartures && selectedTo && (
              <p className="mt-1 text-xs text-cm-muted">載入實時班次中...</p>
            )}
          </div>
        </div>
      )}
      <p className="mt-2 text-xs text-cm-muted">{status}</p>
      {routes.length > 0 && (
        <div className="mt-3 max-h-52 space-y-2 overflow-auto">
          {filteredRoutes.slice(0, 20).map((route, index) => (
            <div className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-sm" key={`${route.route}-${route.bound ?? index}`}>
              <strong className="text-cm-greenDark">{route.route}</strong>
              <span className="ml-3 flex-1 truncate text-right text-cm-muted">
                {route.orig_tc ?? route.orig_en} → {route.dest_tc ?? route.dest_en}
              </span>
            </div>
          ))}
          {filteredRoutes.length === 0 && (
            <p className="rounded-xl bg-white p-3 text-xs text-cm-muted">
              官方目錄沒有符合起點/目的地文字的路線；完整路線已成功載入。
            </p>
          )}
        </div>
      )}
    </div>
  );
}
