import Link from 'next/link';
import coverage from '../../data/transport/manifest.json';

const names: Record<string, string> = {
  KMB: '九巴 KMB', CTB: '城巴 Citybus', LWB: '龍運 Long Win', 'KMB+CTB': '九巴／城巴聯營 Joint KMB/Citybus',
  'LWB+CTB': '龍運／城巴聯營 Joint LWB/Citybus', GMB: '專線小巴 Green minibuses', NLB: '新大嶼山巴士 New Lantao Bus',
  MTR: '港鐵 MTR', LRT: '輕鐵 Light Rail', LRTFeeder: '港鐵巴士 MTR Bus', TRAM: '電車 Hong Kong Tramways',
  PTRAM: '山頂纜車 Peak Tram', FERRY: '渡輪 Ferries', DB: '愉景灣巴士 Discovery Bay', PI: '珀麗灣巴士 Ma Wan', XB: '跨境巴士 Cross-boundary coaches',
};
export default function CoveragePage() {
  return <main className="min-h-screen bg-cm-paper font-cm text-cm-ink"><div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
    <Link href="/" className="text-sm font-bold text-cm-greenDark">← 返回行程 Back to planner</Link>
    <section className="mt-5 rounded-2xl bg-white p-5 shadow-card">
      <h1 className="text-3xl font-extrabold">交通資料 Transport coverage</h1>
      <p className="mt-3">{coverage.counts.routes.toLocaleString()} 條路線及變體 routes / variants · {coverage.counts.stops.toLocaleString()} 個站點 stops · 匯入日期 imported {coverage.importedOn}</p>
      <p className="mt-3 text-sm text-cm-muted">路線搜尋最多 3 次轉乘，使用原有權重公式。Search compares up to three transfers with your original weighting formula.</p>
      <table className="mt-5 w-full text-left text-sm"><thead><tr className="border-b"><th className="py-2">營辦商 Network</th><th>路線／變體 Routes</th><th>資料 Data</th></tr></thead>
        <tbody>{Object.entries(coverage.counts.operators).map(([operator, count]) => <tr key={operator} className="border-b">
          <td className="py-3 pr-3">{names[operator] ?? operator}</td><td className="pr-3">{count}</td><td>{['KMB','LWB','CTB','MTR','LRT','GMB','KMB+CTB'].includes(operator) ? '路線 + 可用即時到站 Topology + available live arrivals' : '路線 + 官方時間表 Topology + timetable'}</td>
        </tr>)}</tbody>
      </table>
      <h2 className="mt-6 text-xl font-bold">使用前須知 Before travelling</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-sm">
        <li>即時資料只用於第一程；轉乘班次以時間表或估算處理。Live predictions apply to initial boarding; later legs use timetables or estimates.</li>
        <li>港鐵及輕鐵車程／班距為估算，無法核實時會標示。Rail journey times and headways are estimated; service availability is marked unverified when live data cannot confirm it.</li>
        <li>巴士、小巴及渡輪時間表來自運輸署；未公布的中途站時間按距離推算。Unpublished intermediate stop times are interpolated between published timepoints.</li>
        <li>票價按已公布的成人資料估算，優惠及月票仍用原型模型；無資料時不會顯示免費。Published adult fares are estimates; discounts and pass coverage use the prototype model. Missing fares are labelled unavailable.</li>
        <li>步行及地圖連線為示意，未檢查行人通道、無障礙設施或即時封路。Walking links and map lines are schematic, without a pedestrian or accessibility network.</li>
        <li>紅色小巴、的士、昂坪360及未有納入固定路線資料的私人服務暫不支援。Red minibuses, taxis, Ngong Ping 360 and private services absent from the imported feeds are not included.</li>
      </ul>
      <h2 className="mt-6 text-xl font-bold">官方來源 Official sources</h2>
      <ul className="mt-3 space-y-2 text-sm">{Object.entries(coverage.sources).map(([name, url]) => <li key={name}><a className="text-cm-greenDark underline" href={url}>{name}</a></li>)}
        <li><a className="text-cm-greenDark underline" href="https://portal.csdi.gov.hk/csdi-webpage/apidoc/LocationSearchAPI">地政總署 Lands Department station coordinates</a></li>
        <li><Link className="text-cm-greenDark underline" href="/api/sources">完整來源及鳴謝 Full source catalogue</Link></li>
      </ul>
    </section>
  </div></main>;
}
