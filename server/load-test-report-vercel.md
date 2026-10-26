# Concurrent load test (deployed Vercel site): aggregate over 2 run(s)

Each run creates 30 victims, 30 donors, 15 volunteers and 1 admin (real throwaway accounts), then fires each phase's requests at the same instant against the real Express + Firestore backend. Latencies are successful requests only, in milliseconds. "mean ± sd" is the mean and standard deviation of that statistic **across runs** (run-to-run variance); with n = 2 run(s) treat the sd as indicative, not a confidence interval.

| Phase | Requests | Success | p50 (ms) | p95 (ms) | p99 (ms) | Worst (ms) |
|---|---|---|---|---|---|---|
| 1. Submit requests | 60 | 100.0% | 1984 ± 1439 | 2289 ± 1362 | 2325 ± 1401 | 3315 |
| 1b. Approve requests | 60 | 100.0% | 1293 ± 448 | 2204 ± 73 | 2479 ± 22 | 2494 |
| 2. Register donations | 60 | 100.0% | 742 ± 283 | 1601 ± 537 | 1706 ± 680 | 2186 |
| 3. Match donations (race probe) | 60 | 100.0% | 1807 ± 310 | 2387 ± 491 | 2492 ± 489 | 2837 |
| 4. Volunteers accept | 30 | 100.0% | 1183 ± 190 | 1681 ± 276 | 1681 ± 276 | 1876 |
| 5. Read burst | 100 | 100.0% | 728 ± 334 | 962 ± 384 | 1240 ± 187 | 1372 |

Double-matched request items across all runs: **0** (race-condition probe, Phase 3; matching now runs inside a Firestore transaction).

Caveats: the 'Read burst' phase mixes three cached endpoints, so its tail reflects cache misses on a cold serverless-style start rather than steady-state latency. Run-to-run spread is also affected by Firebase Auth/Firestore rate limiting when runs are launched back to back (each run creates and deletes 76 accounts); the runs were spaced apart for this reason.
