'use client';

import type { MonthlyPassInsight } from '../../domain/monthlyPass';

/**
 * Answers the question this app exists for: is the monthly pass worth it for
 * the trip currently on screen? Shows how many similar trips break even.
 */
export function PassBreakEvenPanel({ insight }: { insight: MonthlyPassInsight }) {
  if (insight.coveredFare <= 0) {
    return (
      <div className="mt-4 rounded-2xl bg-amber-50 p-3 text-sm font-bold text-amber-900 ring-1 ring-amber-200">
        這條路線由非九巴營辦商行走，月票不適用，需逐程付費 HK${' '}
        {insight.singleTripFare.toFixed(2)}。
      </div>
    );
  }

  const tripsPerWorkdayBothWays = 2;
  const workdaysToBreakEven = insight.breakEvenTrips
    ? Math.ceil(insight.breakEvenTrips / tripsPerWorkdayBothWays)
    : null;

  return (
    <>
      <div className="mt-4 space-y-3">
        <div className="rounded-2xl bg-cm-green/10 p-3">
          <p className="text-xs font-bold text-cm-greenDark">每程可省</p>
          <p className="mt-0.5 text-2xl font-extrabold text-cm-ink">
            HK$ {insight.savingThisTrip.toFixed(2)}
          </p>
          <p className="mt-1 text-xs text-cm-muted">
            {insight.coveredLegCount} 段由月票涵蓋
            {insight.uncoveredLegCount > 0 && `，${insight.uncoveredLegCount} 段需另行付費`}
          </p>
        </div>

        {insight.breakEvenTrips !== null && (
          <div className="rounded-2xl bg-cm-paper p-3">
            <p className="text-xs font-bold text-cm-muted">回本所需</p>
            <p className="mt-0.5 text-lg font-extrabold text-cm-ink">
              {insight.breakEvenTrips} 程
              {workdaysToBreakEven !== null && (
                <span className="ml-1 text-sm font-bold text-cm-muted">
                  （約 {workdaysToBreakEven} 個工作天來回）
                </span>
              )}
            </p>
            <p className="mt-1 text-xs text-cm-muted">
              以每程節省 HK$ {insight.savingThisTrip.toFixed(2)} 計算，月票 HK${' '}
              {insight.passPrice} 需要坐滿上述程數才回本。
            </p>
          </div>
        )}

        {insight.isFullyCovered && (
          <p className="rounded-xl bg-cm-green/10 px-3 py-2 text-xs font-bold text-cm-greenDark">
            全程由月票涵蓋，不需要額外付費。
          </p>
        )}
      </div>
    </>
  );
}
