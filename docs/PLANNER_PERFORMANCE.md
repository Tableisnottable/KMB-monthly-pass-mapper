# First-result performance

Target: ideal first usable choices in 50 ms, average within 300 ms and a 1-second upper target after the browser calculator and its transport snapshot are ready. These are optimization targets, not guarantees for every phone or journey. Cold downloads, data parsing, map tiles, ETA providers, multiple Via stages and complete alternative searches are measured separately. The bounded preview is a provisional ranking, not proof of the globally best journey.

## Reproduce

```
node scripts/build-browser-worker.mjs
node scripts/benchmark-browser-planner.mjs
node scripts/benchmark-browser-planner.mjs --complete
node scripts/benchmark-browser-planner.mjs --runs=20 --uncached
```

The benchmark runs the actual shipped browser bundle in a Node worker shim, including request/reply serialization. Network providers are disabled and a fixed service date keeps timetable fixtures reproducible. It does not measure mobile rendering or mobile network speed. Do not run builds or other CPU-heavy checks at the same time when comparing timings.

## 2026-11-20 local results

Before optimization, airport and cross-harbour preview requests took 1,148–1,659 ms. Afterwards, the same examples took 106–124 ms and rail-only examples took 18–26 ms. A separate rerun produced 107–123 ms and 18–19 ms respectively. Cold handler/data initialization varied from approximately 0.8 to 2.4 seconds and is not included in those preview timings; the planner starts loading that calculator on page entry.

A longer run that also performed complete searches exposed one 442 ms preview outlier. Deadline checks now also run inside stop scanning and transfer-frontier expansion. The final rerun gave 105–120 ms for airport/cross-harbour previews, while the airport complete search took approximately 5.5 seconds and still returned 64 alternatives. These are small local samples, not a percentile guarantee.

The preview scan budget is now 100 ms. Two-ride previews skip the unlimited-network reachability preflight and use the existing stop-to-pattern index to find services reaching the destination. Actual returned legs still go through timetable, company, mode, road and journey-limit validation. An empty or incomplete preview never establishes that there is no full journey.

The complete search still runs after the preview and retains its deep transfer search, topology preflight, scoring, and hard preferences. A first preview may show fewer choices; additional alternatives replace it as the complete search finishes. The 300 ms target does not imply all alternatives or live ETAs are finished in that time.

Closed country and ticket dialogs mount their list content only when opened. Production home-page HTML dropped from 158,142 bytes to approximately 21 KB. Country/city query parameters are resolved before initializing map tiles or area-data requests, avoiding an unnecessary request for the default city.

## 2026-11-23 local results

The short scan budget is now 35 ms. If it finds no valid route, a second 200 ms pass handles slower/busy devices. A cancelled complete search no longer discards the separate warm preview calculator. Preview responses are cached for 5 seconds for leave-now queries and 60 seconds for explicit dates, keyed by all search parameters including hard company, road, mode and time rules. Empty previews are not cached.

A 60-request run with the response cache bypassed measured mean **33.4 ms**, p95 **47.0 ms**, max **63.9 ms**. An earlier three-case run measured airport first results at 49 ms, cross-harbour at 42 ms and rail at 12.8 ms; cached repeats took approximately 1–3 ms. Complete searches still returned 64 alternatives in roughly 3.6–4.1 seconds. Cold initialization varied from 0.6–1.2 seconds in these runs, excluding download time. These local samples do not establish a mobile or global-best guarantee.

The default waiting limit is now 120 minutes across the journey. Walking-only routes participate in the route ranking, and the UI highlights a walking comparison when it is faster than every transit choice. This also prevents overnight waits from dominating a recommended journey list.
