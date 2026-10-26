# Concurrent load test: aggregate over 2 run(s)

Each run creates 30 victims, 30 donors, 15 volunteers and 1 admin (real throwaway accounts), then fires each phase's requests at the same instant against the real Express + Firestore backend. Latencies are successful requests only, in milliseconds. "mean ± sd" is the mean and standard deviation of that statistic **across runs** (run-to-run variance); with n = 2 run(s) treat the sd as indicative, not a confidence interval.

| Phase | Requests | Success | p50 (ms) | p95 (ms) | p99 (ms) | Worst (ms) |
|---|---|---|---|---|---|---|
| 1. Submit requests | 60 | 100.0% | 4284 ± 1958 | 4632 ± 2038 | 4755 ± 1867 | 6075 |
| 1b. Approve requests | 60 | 100.0% | 6161 ± 4131 | 6423 ± 4419 | 6515 ± 4409 | 9632 |
| 2. Register donations | 60 | 100.0% | 3220 ± 2324 | 3458 ± 2519 | 3462 ± 2522 | 5245 |
| 3. Match donations (race probe) | 60 | 100.0% | 13964 ± 5568 | 148356 ± 173755 | 191326 ± 116673 | 273826 |
| 4. Volunteers accept | 30 | 100.0% | 38811 ± 49825 | 39077 ± 49826 | 39077 ± 49826 | 74309 |
| 5. Read burst | 100 | 100.0% | 1222 ± 803 | 1933 ± 1706 | 1933 ± 1706 | 3139 |

Double-matched request items across all runs: **0** (race-condition probe, Phase 3; matching now runs inside a Firestore transaction).

Caveats: the 'Read burst' phase mixes three cached endpoints, so its tail reflects cache misses on a cold serverless-style start rather than steady-state latency. Run-to-run spread is also affected by Firebase Auth/Firestore rate limiting when runs are launched back to back (each run creates and deletes 76 accounts); the runs were spaced apart for this reason.
