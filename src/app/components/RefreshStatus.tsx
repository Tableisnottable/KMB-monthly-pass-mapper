import { copy, type PlannerLocale } from './plannerUi';
export function RefreshStatus({ updatedAt, failed, locale }: { updatedAt: number; failed: boolean; locale: PlannerLocale }) {
  return <p className="live-refresh-status" role="status" title={copy(locale, '每 30 秒更新，背景分頁暫停。', 'Refreshes every 30 seconds; paused in background tabs.')}>
    {failed ? copy(locale, '更新失敗 · 正在重試', 'Refresh failed · retrying') : copy(locale, '自動更新', 'Auto update')}
    {updatedAt > 0 && <> · <time dateTime={new Date(updatedAt).toISOString()}>{new Date(updatedAt).toLocaleTimeString(locale === 'en' ? 'en-GB' : 'zh-HK', { timeZone: 'Asia/Hong_Kong', hour12: false })}</time></>}
  </p>;
}
