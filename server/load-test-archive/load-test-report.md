# Concurrent load test: aggregate over 4 run(s)

Each run creates 30 victims, 30 donors, 15 volunteers and 1 admin (real throwaway accounts), then fires each phase's requests at the same instant against the real Express + Firestore backend. Latencies are successful requests only, in milliseconds. "mean ± sd" is the mean and standard deviation of that statistic **across runs** (run-to-run variance); with n = 4 run(s) treat the sd as indicative, not a confidence interval.

| Phase | Requests | Success | p50 (ms) | p95 (ms) | p99 (ms) | Worst (ms) |
|---|---|---|---|---|---|---|
| 1. Submit requests | 120 | 100.0% | 7541 ± 5091 | 8069 ± 5495 | 8118 ± 5477 | 16130 |
| 1b. Approve requests | 120 | 100.0% | 5277 ± 3924 | 5621 ± 4220 | 5658 ± 4193 | 11932 |
| 2. Register donations | 120 | 100.0% | 2846 ± 2425 | 3164 ± 2593 | 3262 ± 2765 | 7408 |
| 3. Match donations (race probe) | 120 | 100.0% | 52496 ± 53746 | 89251 ± 58343 | 93351 ± 57199 | 167214 |
| 4. Volunteers accept | 57 | 100.0% | 8597 ± 4242 | 9149 ± 4782 | 9149 ± 4782 | 14679 |
| 5. Read burst | 200 | 100.0% | 2415 ± 1877 | 2941 ± 2559 | 2942 ± 2559 | 6542 |

Double-matched request items across all runs: **0** (race-condition probe, Phase 3; matching now runs inside a Firestore transaction).

Caveats: the 'Read burst' phase mixes three cached endpoints, so its tail reflects cache misses on a cold serverless-style start rather than steady-state latency. Run-to-run spread is also affected by Firebase Auth/Firestore rate limiting when runs are launched back to back (each run creates and deletes 76 accounts); the runs were spaced apart for this reason.
