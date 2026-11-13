import { DocumentLink as Link } from '../components/DocumentLink';
import coverage from '../../data/transport/manifest.json';
import alignments from '../../data/alignments/manifest.json';
import { operatorInfo } from '../../data/transportOperators';

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
      <p className="mt-3 text-sm text-cm-muted">最多三次轉乘，支援現在、指定出發及最遲抵達時間（香港時間）。改良權重包括車程、候車、步行、轉乘及成人票價。Up to three transfers, with Now, Leave at and Arrive by in Hong Kong time. Enhanced weighting includes time, walking, transfers and adult fare.</p>
      <p className="mt-3"><Link className="font-bold text-cm-greenDark underline" href="/timetables">營辦商及完整班次時間表 Companies & full timetables →</Link></p>
      <p className="mt-3 text-sm text-cm-muted">營辦商名稱取自政府雙語 agency.txt；部分小巴、渡輪及居民服務以服務組別列出。Operator names come from bilingual government agency records; some minibus, ferry and residents’ services are grouped by network.</p>
      <table className="mt-5 w-full text-left text-sm"><thead><tr className="border-b"><th className="py-2">營辦商 Network</th><th>路線／變體 Routes</th><th>資料 Data</th></tr></thead>
        <tbody>{Object.entries(coverage.counts.operators).map(([operator, count]) => <tr key={operator} className="border-b">
          <td className="py-3 pr-3">{operatorInfo(operator) ? operatorInfo(operator)!.nameTc + ' · ' + operatorInfo(operator)!.nameEn : names[operator] ?? operator}</td><td className="pr-3">{count}</td><td>{['KMB','LWB','CTB','MTR','LRT','GMB','KMB+CTB','LWB+CTB'].includes(operator) ? '路線 + 可用即時到站 Topology + available live arrivals' : '路線 + 官方時間表 Topology + timetable'}</td>
        </tr>)}</tbody>
      </table>
      <h2 className="mt-6 text-xl font-bold">使用前須知 Before travelling</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-sm">
        <li>即時資料只用於第一程；轉乘班次以時間表或估算處理。Live predictions apply to initial boarding; later legs use timetables or estimates.</li>
        <li>港鐵及輕鐵車程／班距為估算，無法核實時會標示。Rail journey times and headways are estimated; service availability is marked unverified when live data cannot confirm it.</li>
        <li>巴士、小巴及渡輪時間表來自運輸署；未公布的中途站時間按距離推算。Unpublished intermediate stop times are interpolated between published timepoints.</li>
        <li>完整時間表保留服務日曆、假日例外及翌日凌晨班次。班距區間並非精確開車時間；鐵路來源沒有完整班次表時會標示。Full timetables preserve service calendars, holiday exceptions and after-midnight times. Headway windows are not exact departures; missing full rail timetables remain explicit.</li>
        <li>（新增）表示即時來源標示為加班，或即時班次不在已匯入時間表時段。比較容許約 15 分鐘偏差（中途站 20 分鐘）；仍可能是延誤或時間表更新，並非所有情況均獲營辦商確認為加班。未有時間表或日期不在服務日曆範圍時不據此推斷新增。(Added) identifies provider-marked extras or live departures outside imported timetable windows after a 15-minute tolerance (20 minutes at intermediate stops). This can also reflect a delay or timetable update; missing timetable coverage is not evidence of an extra trip.</li>
        <li>普通成人票價；港鐵、機場快綫及輕鐵使用成人八達通。同一付費區鐵路轉綫只計一次起訖票價，不自動扣除未核實優惠。Normal adult fares, with adult Octopus on MTR, Airport Express and Light Rail. Connected paid-area rail changes share an OD fare; unverified interchange discounts are excluded.</li>
        <li>已匯入 {alignments.roadAlignments.toLocaleString()} 條運輸署道路線形，鐵路、電車、纜車及渡輪使用 OpenStreetMap 實際線形，步行使用路網規劃。缺少路徑時隱藏該段連線。Imported TD road alignments and OpenStreetMap tracks/water routes replace stop-to-stop chords. Walking uses street paths. Missing paths are hidden; accessibility and temporary closures are not verified.</li>
        <li>指定日期不使用現在的即時 ETA；鐵路時間表仍屬估算，請確認營運時間。Selected-date trips never use current live ETAs. Rail schedules remain estimated; confirm operating hours.</li>
        <li>紅色小巴、的士、昂坪360及未有納入固定路線資料的私人服務暫不支援。Red minibuses, taxis, Ngong Ping 360 and private services absent from the imported feeds are not included.</li>
      </ul>
      <h2 className="mt-6 text-xl font-bold">官方來源 Official sources</h2>
      <ul className="mt-3 space-y-2 text-sm">{Object.entries(coverage.sources).map(([name, url]) => <li key={name}><a className="text-cm-greenDark underline" href={url}>{name}</a></li>)}
        <li><a className="text-cm-greenDark underline" href="https://portal.csdi.gov.hk/csdi-webpage/apidoc/LocationSearchAPI">地政總署 Lands Department station coordinates</a></li>
        <li><a className="text-cm-greenDark underline" href="https://portal.csdi.gov.hk/geoportal/?datasetId=td_rcd_1638844988873_41214">運輸署／CSDI 巴士道路線形 TD / CSDI alignments</a></li>
        <li><a className="text-cm-greenDark underline" href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors · ODbL 1.0</a></li>
        <li><Link className="text-cm-greenDark underline" href="/api/sources">完整來源及鳴謝 Full source catalogue</Link></li>
      </ul>
    </section>
  </div></main>;
}
