# Flood-risk model: held-out evaluation

Train 1981-2010 (9000 samples), test 2011-2019 (2700 samples). Positive rate train 0.087, test 0.146.

| Model | AUC-ROC | PR-AUC | Brier | Top-decile precision |
|---|---|---|---|---|
| Logistic regression | 0.787 | 0.397 | 0.111 | 0.452 |
| Climatology (district x month) | 0.687 | 0.267 | 0.123 | 0.300 |
| Climatology (month only) | 0.720 | 0.278 | 0.121 | 0.326 |
| Constant (train base rate) | - | - | 0.128 | - |

## Ablation (drop one feature)

| Dropped | AUC | PR-AUC | Brier |
|---|---|---|---|
| without_monthRainfallMm | 0.693 | 0.245 | 0.128 |
| without_prior30dRainfallMm | 0.790 | 0.431 | 0.105 |
| without_monthSin | 0.788 | 0.397 | 0.111 |
| without_monthCos | 0.787 | 0.397 | 0.111 |

## Calibration (test set)

| Bin | n | Mean predicted | Observed |
|---|---|---|---|
| 0-0.1 | 1566 | 0.047 | 0.060 |
| 0.1-0.2 | 460 | 0.141 | 0.120 |
| 0.2-0.3 | 166 | 0.244 | 0.193 |
| 0.3-0.4 | 124 | 0.355 | 0.395 |
| 0.4-0.5 | 110 | 0.455 | 0.382 |
| 0.5-0.6 | 99 | 0.546 | 0.394 |
| 0.6-0.7 | 57 | 0.642 | 0.333 |
| 0.7-0.8 | 54 | 0.743 | 0.481 |
| 0.8-0.9 | 33 | 0.851 | 0.667 |
| 0.9-1 | 31 | 0.956 | 0.548 |

Hyperparameters: {"epochs":3000,"lr":0.3,"l2":0.001,"standardisation":"z-score (train stats)","classWeighting":"none"}
