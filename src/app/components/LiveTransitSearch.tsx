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

export function LiveTransitSearch() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [operator, setOperator] = useState<'KMB' | 'CTB'>('KMB');
  const [routes, setRoutes] = useState<TransitRoute[]>([]);
  const [stops, setStops] = useState<TransitStop[]>([]);
  const [selectedFrom, setSelectedFrom] = useState<TransitStop | null>(null);
  const [selectedTo, setSelectedTo] = useState<TransitStop | null>(null);
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
    } else {
      setTo(stop.name_tc || stop.name_en);
      setSelectedTo(stop);
    }
  }

  return (
    <div className="mt-3 rounded-2xl border border-cm-line bg-cm-paper/60 p-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          aria-label="起點"
          className="min-w-0 rounded-xl border-0 bg-white px-3 py-2 text-sm ring-1 ring-cm-line"
          onChange={(event) => setFrom(event.target.value)}
          placeholder="輸入起點"
          value={from}
        />
        <input
          aria-label="目的地"
          className="min-w-0 rounded-xl border-0 bg-white px-3 py-2 text-sm ring-1 ring-cm-line"
          onChange={(event) => setTo(event.target.value)}
          placeholder="輸入目的地"
          value={to}
        />
        <select
          aria-label="營辦商"
          className="rounded-xl border-0 bg-white px-3 py-2 text-sm ring-1 ring-cm-line"
          onChange={(event) => setOperator(event.target.value as 'KMB' | 'CTB')}
          value={operator}
        >
          <option value="KMB">九巴官方 API</option>
          <option value="CTB">城巴官方 API</option>
        </select>
        <button
          className="rounded-xl bg-cm-green px-4 py-2 text-sm font-extrabold text-white hover:bg-cm-greenDark"
          disabled={loading}
          onClick={search}
          type="button"
        >
          {loading ? '載入中...' : '搜尋官方路線及站點'}
        </button>
      </div>
      <p className="mt-2 text-xs text-cm-muted">
        可輸入任意香港地點的中英文名稱；搜尋後會從官方站點目錄揀選實際站點，不需要預設清單。
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
