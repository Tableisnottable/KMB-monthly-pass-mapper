import { copy, type PlannerLocale } from './plannerUi';
export function RefreshStatus({ updatedAt, failed, locale }: { updatedAt: number; failed: boolean; locale: PlannerLocale }) {
  return <p className="live-refresh-status" role="status">{failed ? copy(locale, '更新失敗，保留的資料可能已過時；將自動重試。', 'Refresh failed. Retained data may be stale; retrying automatically.') : copy(locale, '到站資料每 30 秒自動更新；背景分頁暫停。', 'Arrivals refresh every 30 seconds; paused in background tabs.')}
    {updatedAt > 0 && <> {copy(locale, '最近成功更新：', 'Last successful update: ')}<time dateTime={new Date(updatedAt).toISOString()}>{new Date(updatedAt).toLocaleTimeString(locale === 'en' ? 'en-GB' : 'zh-HK', { timeZone: 'Asia/Hong_Kong', hour12: false })} HKT</time></>}
  </p>;
}
