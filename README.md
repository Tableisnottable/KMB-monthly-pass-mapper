# KMB Monthly Pass Mapper

A modern, Citymapper-inspired Hong Kong transit route planner built with Next.js, Cloudflare OpenNext, and an advanced cost-based scoring engine.

## Key Features

- Citymapper Design Language: Dark mode interface with high-contrast operator badges (KMB Red, LWB Orange, MTR Burgundy, Citybus Yellow).
- Upgraded Cost-Based Scoring Engine (UpgradedScoringEngine): Routes are evaluated using a lower-score-is-better model considering time, wait times, transfer friction, walking burden, and operator adjustments.
- Hong Kong Time Multipliers: Dynamically adjusts waiting time sensitivity based on peak, off-peak, and overnight time windows.
- Edge-Ready: Fully optimized for Next.js 15+ deployed on Cloudflare Workers via @opennextjs/cloudflare.

## Upgraded Scoring Logic (UpgradedScoringEngine)

Instead of picking routes strictly by shortest duration, the engine calculates a total cost score:

Final Score = Leg Score Sum + Walk Transfer Time + Long Distance Surcharge + (Transfer Count * 8)

1. Time-of-Day Multipliers
- Overnight (23:00 - 05:50): 1.8
- Peak Hours (07:00-09:30 & 17:00-19:30): 1.0
- Off-Peak: 1.3

2. Segment Calculation
ETA Component:
- If ETA is fresh: Realtime ETA * Time Multiplier
- Otherwise: Scheduled Interval * 0.5 * Time Multiplier

Segment Score = Ride Time + ETA Component + Operator Adjustment

3. Operator Adjustments
- KMB: -1.0
- LWB: -0.46
- MTR: +0.5
- CTB: +1.0

## Development & Deployment

### Build Locally
npm install
npm run build

### Build & Deploy to Cloudflare Workers
npx @opennextjs/cloudflare build
npx wrangler deploy
