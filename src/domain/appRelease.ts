export const APP_VERSION = '1.1.0';
export const RELEASE_DATE = '2026-11-23';
export const RELEASE_CHANGES = [
  ['預設候車上限 2 小時；步行行程一併參與排序。', 'Default waiting limit of 2 hours; walking journeys also appear in route rankings.'],
  ['班次按過去、現在、未來排列；保留全部可取得的即時預測。', 'Past trips above current and future times; all available live predictions retained.'],
  ['按同時段班數比較可能加班；已確認狀態與推算分開。', 'Compare trip counts in the same window; distinguish possible extras from confirmed statuses.'],
  ['地圖選點先預覽，再選擇起點、目的地或途經點。', 'Preview a map pin, then choose Start, End or Via.'],
  ['重新整理後保留地點、篩選設定及行程。', 'Restore places, filters and journeys after reloading.'],
  ['GO 新增步行、候車、乘車及下車步驟。', 'GO now has walk, wait, ride and alight steps.'],
  ['加速首批路線搜尋；修正自動資料更新的重試及檔案大小問題。', 'Faster first route results; fixed data refresh retries and snapshot size limits.'],
] as const;
