import type { LiveDeparture } from '../../data/networkTimetable';
import { copy, type PlannerLocale } from './plannerUi';

export function AddedDeparture({ departure, locale }: { departure?: Pick<LiveDeparture, 'scheduleMatch' | 'addedReason'>; locale: PlannerLocale }) {
  if (departure?.scheduleMatch !== 'ADDED') return null;
  return <span className="added-departure" title={departure.addedReason === 'PROVIDER'
    ? copy(locale, '營辦商即時資料標示為加開班次。', 'The live provider identifies this as an extra departure.')
    : copy(locale, '即時班次未列於已匯入時間表的時段內；可能是加班、延誤或時間表更新。', 'Live departure outside the imported timetable windows; this may be an extra trip, a delay or a timetable update.')}>
    {copy(locale, '（新增）', '(Added)')}
  </span>;
}
