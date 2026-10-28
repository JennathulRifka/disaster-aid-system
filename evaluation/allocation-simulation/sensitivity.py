"""Weight-sensitivity analysis of the rule-based priority score (synthetic requests)."""
import json, math, random, sys
import numpy as np
from scipy.stats import kendalltau
sys.argv = [sys.argv[0], sys.argv[1]]
import simulate_matching as sm

reqs = []
for s in range(5):
    reqs += sm.gen(1000 + s)[0]
sev = np.array([sm.SEV_W[q["sev"]] for q in reqs], float)
ppl = np.array([q["people"] for q in reqs], float)
vul = np.array([q["vul"] for q in reqs], float)
N = len(reqs)

def S(sev_scale=1, a=2, b=5, cap_a=30, cap_b=25, people_fn=None):
    aff = np.minimum(ppl * a, cap_a) if people_fn is None else people_fn(ppl)
    return sev * sev_scale + aff + np.minimum(vul * b, cap_b)

base = S()
top = int(0.1 * N)
def topk(x):
    # rank with stable random tie-break so ties do not inflate overlap
    rng = np.random.default_rng(0)
    return set(np.lexsort((rng.random(N), -x))[:top])
base_top = topk(base)

def comp(x):
    tau = kendalltau(base, x).statistic
    return tau, len(base_top & topk(x)) / top

res = {"n_requests": N}
res["effective_max"] = float(40 + 30 + 20)
res["share_people_capped"] = float((ppl >= 15).mean())
vals, counts = np.unique(base, return_counts=True)
res["distinct_scores"] = int(len(vals))
res["share_in_tied_score"] = float(counts[counts > 1].sum() / N)

one_at_a_time = {}
for name, kw in [("severity", "sev_scale"), ("people", "a"), ("vulnerable", "b")]:
    for f in (0.5, 0.75, 1.25, 1.5):
        default = {"sev_scale": 1, "a": 2, "b": 5}[kw]
        t, o = comp(S(**{kw: default * f}))
        one_at_a_time[f"{name} x{f}"] = (round(t, 3), round(o, 3))
res["one_at_a_time"] = one_at_a_time

rng = np.random.default_rng(42)
taus, ovs = [], []
for _ in range(1000):
    f = rng.uniform(0.5, 1.5, 3)
    t, o = comp(S(sev_scale=f[0], a=2 * f[1], b=5 * f[2]))
    taus.append(t); ovs.append(o)
res["joint_random"] = dict(tau_median=float(np.median(taus)), tau_p5=float(np.percentile(taus, 5)),
                           overlap_median=float(np.median(ovs)), overlap_p5=float(np.percentile(ovs, 5)))
t, o = comp(S(people_fn=lambda p: np.minimum(10 * np.log10(1 + p), 30)))
res["log_people_variant"] = (round(t, 3), round(o, 3), float((10 * np.log10(1 + ppl) >= 30).mean()))
json.dump(res, open("sensitivity.json", "w"), indent=1)
print(json.dumps(res, indent=1))
