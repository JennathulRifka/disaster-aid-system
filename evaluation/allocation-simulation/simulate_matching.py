"""
Discrete-event simulation of donation-to-request allocation policies for a
synthetic Ditwah-scale flood response in Sri Lanka.

Replicates the deployed matcher (server/src/routes/donations.js):
  * priority score computed ONCE at submission (wait term ~0, see priorityScore.js)
  * candidates = pending items of the donation's category
  * sort by priorityScore desc, Haversine distance asc (tie-break only)
  * request side all-or-nothing, donation consumes min(remaining, need)
and compares it with baseline and variant policies.

All inputs are synthetic and documented in ASSUMPTIONS below.
"""
import json, math, random, statistics as st, sys

DISTRICTS = [("Colombo",6.9271,79.8612),("Gampaha",7.0917,79.9997),("Kalutara",6.5854,79.9607),("Kandy",7.2906,80.6337),("Matale",7.4675,80.6234),("Nuwara Eliya",6.9497,80.7891),("Galle",6.0535,80.221),("Matara",5.9549,80.555),("Hambantota",6.1241,81.1185),("Jaffna",9.6615,80.0255),("Kilinochchi",9.3803,80.377),("Mannar",8.981,79.9044),("Vavuniya",8.7514,80.4971),("Mullaitivu",9.2671,80.8142),("Batticaloa",7.717,81.7),("Ampara",7.2975,81.6747),("Trincomalee",8.5874,81.2152),("Kurunegala",7.4863,80.3647),("Puttalam",8.0362,79.8283),("Anuradhapura",8.3114,80.4037),("Polonnaruwa",7.9403,81.0188),("Badulla",6.9934,81.055),("Monaragala",6.8714,81.3507),("Ratnapura",6.6828,80.3992),("Kegalle",7.2513,80.3464)]
MODEL = json.load(open(sys.argv[1]))
DEMAND_W = [MODEL["districtOverallRate"][d[0]] for d in DISTRICTS]  # historical flood frequency
URBAN = {"Colombo": 0.30, "Gampaha": 0.15, "Kandy": 0.15}           # donor concentration
CATS = ["food", "water", "medicine", "shelter", "clothing", "baby_formula"]

ASSUMPTIONS = dict(
    horizon_h=72, n_requests=3000, supply_ratio=0.70, cycle_h=1,
    severity_mix={"critical": .15, "high": .30, "medium": .35, "low": .20},
    people_lognormal_median=4, vulnerable_p=0.3, items_per_request="1-3", item_qty="1-5",
    donor_share_urban=0.60, donation_qty="2-20", jitter_deg=0.15,
)

def hav(a, b):
    R = 6371.0
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2-la1)/2)**2 + math.cos(la1)*math.cos(la2)*math.sin((lo2-lo1)/2)**2
    return 2*R*math.asin(math.sqrt(h))

SEV_W = {"critical": 40, "high": 30, "medium": 20, "low": 10}
def score(req, now=None, w=(1, 2, 5, 1.5), caps=(30, 25, 20)):
    sev = SEV_W[req["sev"]] * w[0]
    aff = min(req["people"] * w[1], caps[0])
    vul = min(req["vul"] * w[2], caps[1])
    wait = 0.0 if now is None else min(max(now - req["t"], 0) * w[3], caps[2])
    return sev + aff + vul + wait

def gen(seed):
    r = random.Random(seed)
    reqs, dons = [], []
    for i in range(ASSUMPTIONS["n_requests"]):
        t = min(r.expovariate(1/18), 71.9)                # front-loaded arrivals
        d = r.choices(range(25), weights=DEMAND_W)[0]
        loc = (DISTRICTS[d][1]+r.gauss(0, .15), DISTRICTS[d][2]+r.gauss(0, .15))
        sev = r.choices(list(ASSUMPTIONS["severity_mix"]), weights=list(ASSUMPTIONS["severity_mix"].values()))[0]
        people = max(1, int(round(r.lognormvariate(math.log(4), 1.0))))
        vul = sum(r.random() < .3 for _ in range(4))
        cats = r.sample(CATS, r.randint(1, 3))
        req = dict(id=i, t=t, d=d, loc=loc, sev=sev, people=people, vul=vul)
        req["score0"] = score(req)
        req["items"] = [dict(cat=c, qty=r.randint(1, 5), matched_t=None, dist=None) for c in cats]
        reqs.append(req)
    demand = sum(it["qty"] for q in reqs for it in q["items"])
    supply = 0
    names = [x[0] for x in DISTRICTS]
    while supply < ASSUMPTIONS["supply_ratio"]*demand:
        t = r.uniform(4, 71.9)
        if r.random() < .6:
            dn = r.choices(list(URBAN), weights=list(URBAN.values()))[0]; d = names.index(dn)
        else:
            d = r.randrange(25)
        q = r.randint(2, 20); supply += q
        dons.append(dict(t=t, d=d, loc=(DISTRICTS[d][1]+r.gauss(0, .1), DISTRICTS[d][2]+r.gauss(0, .1)),
                         cat=r.choice(CATS), rem=q))
    dons.sort(key=lambda x: x["t"])
    return reqs, dons

import numpy as np
def hav_vec(p, lat, lon):
    la1, lo1 = math.radians(p[0]), math.radians(p[1])
    la2, lo2 = np.radians(lat), np.radians(lon)
    h = np.sin((la2-la1)/2)**2 + math.cos(la1)*np.cos(la2)*np.sin((lo2-lo1)/2)**2
    return 2*6371.0*np.arcsin(np.sqrt(h))

def run(policy, seed, cap_km=None, w=(1, 2, 5, 1.5)):
    reqs, dons = gen(seed)
    r = random.Random(seed + 999)
    pending = {c: [] for c in CATS}
    order = sorted(reqs, key=lambda q: q["t"]); ri = 0
    di = 0; avail = []
    for step in range(0, ASSUMPTIONS["horizon_h"] + 1):
        now = float(step)
        while ri < len(order) and order[ri]["t"] <= now:
            q = order[ri]; ri += 1
            for it in q["items"]: pending[it["cat"]].append((q, it))
        while di < len(dons) and dons[di]["t"] <= now: avail.append(dons[di]); di += 1
        still = []
        for dn in avail:
            P = pending[dn["cat"]]
            while dn["rem"] > 0 and P:
                lat = np.array([q["loc"][0] for q, _ in P]); lon = np.array([q["loc"][1] for q, _ in P])
                dist = hav_vec(dn["loc"], lat, lon)
                ok = np.ones(len(P), bool) if cap_km is None else dist <= cap_km
                if not ok.any(): break
                idx = np.where(ok)[0]
                if policy in ("priority", "aging"):
                    sc = np.array([score(P[i][0], now if policy == "aging" else None, w) for i in idx])
                    best = idx[sc == sc.max()]
                    k = best[np.argmin(dist[best])]
                    P[int(k)][1]["tie"] = len(best) > 1
                elif policy == "fifo":
                    k = idx[np.argmin([P[i][0]["t"] for i in idx])]
                elif policy == "nearest":
                    k = idx[np.argmin(dist[idx])]
                else:
                    k = r.choice(list(idx))
                q, it = P.pop(int(k))
                it["matched_t"] = now; it["dist"] = float(dist[k])
                dn["rem"] -= min(dn["rem"], it["qty"])
            if dn["rem"] > 0: still.append(dn)
        avail = still
    return reqs

def metrics(reqs):
    items = [(q, it) for q in reqs for it in q["items"]]
    m = [(q, it) for q, it in items if it["matched_t"] is not None]
    crit = [(q, it) for q, it in items if q["sev"] == "critical"]
    low = [(q, it) for q, it in items if q["sev"] == "low"]
    waits = [it["matched_t"] - q["t"] for q, it in m]
    cwaits = [it["matched_t"] - q["t"] for q, it in m if q["sev"] == "critical"]
    dists = [it["dist"] for q, it in m]
    # district coverage ratio = matched items / requested items; Gini across districts with demand
    ratios = []
    for d in range(25):
        di = [it for q, it in items if q["d"] == d]
        if len(di) >= 5: ratios.append(sum(1 for it in di if it["matched_t"] is not None)/len(di))
    ratios.sort(); n = len(ratios)
    gini = (sum((2*(i+1)-n-1)*x for i, x in enumerate(ratios)) / (n*sum(ratios))) if sum(ratios) else 0
    return dict(
        fulfil=len(m)/len(items),
        crit_fulfil=sum(1 for q, it in crit if it["matched_t"] is not None)/len(crit),
        low_fulfil=sum(1 for q, it in low if it["matched_t"] is not None)/len(low),
        med_wait=st.median(waits) if waits else float("nan"),
        crit_med_wait=st.median(cwaits) if cwaits else float("nan"),
        mean_km=st.mean(dists) if dists else float("nan"),
        pct_over150=sum(1 for x in dists if x > 150)/len(dists) if dists else 0,
        gini=gini, min_district=min(ratios),
        tie_rate=sum(1 for q, it in m if it.get("tie"))/len(m) if m else 0,
    )

if __name__ == "__main__":
    SEEDS = range(int(sys.argv[2]) if len(sys.argv)>2 else 30)
    configs = [("Priority-first (deployed)", "priority", None), ("FIFO", "fifo", None),
               ("Nearest-first", "nearest", None), ("Random", "random", None),
               ("Priority + aging", "aging", None), ("Priority + 100 km cap", "priority", 100)]
    out = {"assumptions": ASSUMPTIONS, "results": {}}
    for name, pol, cap in configs:
        runs = [metrics(run(pol, s, cap)) for s in SEEDS]
        agg = {k: (st.mean(r[k] for r in runs), st.stdev(r[k] for r in runs)) for k in runs[0]}
        out["results"][name] = agg
        print(name, {k: f"{v[0]:.3f}±{v[1]:.3f}" for k, v in agg.items()}, flush=True)
    json.dump(out, open("sim_results.json", "w"), indent=1)
