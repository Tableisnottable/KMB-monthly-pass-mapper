# First-result performance

Target: first usable route choices within 300 ms after the browser calculator and its transport snapshot are ready. This is an optimization target, not a guarantee for every phone or journey. Cold downloads, data parsing, map tiles, ETA providers, multiple Via stages and complete alternative searches are measured separately.

## Reproduce

```
node scripts/build-browser-worker.mjs
node scripts/benchmark-browser-planner.mjs
node scripts/benchmark-browser-planner.mjs --complete
```

The benchmark runs the actual shipped browser bundle in a Node worker shim, including request/reply serialization. Network providers are disabled and a fixed service date keeps timetable fixtures reproducible. It does not measure mobile rendering or mobile network speed. Do not run builds or other CPU-heavy checks at the same time when comparing timings.

## 2026-11-20 local results

Before optimization, airport and cross-harbour preview requests took 1,148–1,659 ms. Afterwards, the same examples took 106–124 ms and rail-only examples took 18–26 ms. A separate rerun produced 107–123 ms and 18–19 ms respectively. Cold handler/data initialization varied from approximately 0.8 to 2.4 seconds and is not included in those preview timings; the planner starts loading that calculator on page entry.

A longer run that also performed complete searches exposed one 442 ms preview outlier. Deadline checks now also run inside stop scanning and transfer-frontier expansion. The final rerun gave 105–120 ms for airport/cross-harbour previews, while the airport complete search took approximately 5.5 seconds and still returned 64 alternatives. These are small local samples, not a percentile guarantee.

The preview scan budget is now 100 ms. Two-ride previews skip the unlimited-network reachability preflight and use the existing stop-to-pattern index to find services reaching the destination. Actual returned legs still go through timetable, company, mode, road and journey-limit validation. An empty or incomplete preview never establishes that there is no full journey.

The complete search still runs after the preview and retains its deep transfer search, topology preflight, scoring, and hard preferences. A first preview may show fewer choices; additional alternatives replace it as the complete search finishes. The 300 ms target does not imply all alternatives or live ETAs are finished in that time.

Closed country and ticket dialogs mount their list content only when opened. Production home-page HTML dropped from 158,142 bytes to approximately 21 KB. Country/city query parameters are resolved before initializing map tiles or area-data requests, avoiding an unnecessary request for the default city.
