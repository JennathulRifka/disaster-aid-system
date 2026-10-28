# Concurrent load test (deployed Vercel site): aggregate over 1 run(s)

Each run creates 30 victims, 30 donors, 15 volunteers and 1 admin (real throwaway accounts), then fires each phase's requests at the same instant against the real Express + Firestore backend. Latencies are successful requests only, in milliseconds. "mean ± sd" is the mean and standard deviation of that statistic **across runs** (run-to-run variance); with n = 1 run(s) treat the sd as indicative, not a confidence interval.

| Phase | Requests | Success | p50 (ms) | p95 (ms) | p99 (ms) | Worst (ms) |
|---|---|---|---|---|---|---|
| 1. Submit requests | 30 | 100.0% | 2725 ± 0 | 3828 ± 0 | 4071 ± 0 | 4071 |
| 1b. Approve requests | 30 | 100.0% | 1357 ± 0 | 1715 ± 0 | 1769 ± 0 | 1769 |
| 2. Register donations | 30 | 100.0% | 782 ± 0 | 1055 ± 0 | 1067 ± 0 | 1067 |
| 3. Match donations (race probe) | 30 | 100.0% | 1881 ± 0 | 5449 ± 0 | 7442 ± 0 | 7442 |
| 4. Volunteers accept | 15 | 100.0% | 1360 ± 0 | 1631 ± 0 | 1631 ± 0 | 1631 |
| 5. Read burst | 50 | 100.0% | 689 ± 0 | 1010 ± 0 | 1071 ± 0 | 1071 |

Double-matched request items across all runs: **0** (race-condition probe, Phase 3; matching now runs inside a Firestore transaction).

Caveats: the 'Read burst' phase mixes three cached endpoints, so its tail reflects cache misses on a cold serverless-style start rather than steady-state latency. Run-to-run spread is also affected by Firebase Auth/Firestore rate limiting when runs are launched back to back (each run creates and deletes 76 accounts); the runs were spaced apart for this reason.
