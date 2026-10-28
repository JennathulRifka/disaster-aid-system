# Revision 8: response to the review

The revised paper is **6 pages on A4** in LaTeX (limit 6; page 6 holds only the last reference), still anonymised. The Word version is also 6 pages in LibreOffice; check it in Microsoft Word. All red placeholders are now filled in:

1. **Ethics** (Section III): exempt from formal committee review as a low-risk student evaluation; approved by the supervisor; no identifying data stored.
2. **Language** (Section V-E): English only, so the Sinhala and Tamil interfaces were not tested.
3. **Participants** (Section V-E): a mixed convenience sample (students, family, friends, working adults) recruited by word of mouth.
4. **Domain users** (Section V-E): some had DMC/NGO involvement or had been affected by a disaster; number and roles withheld for anonymity.
5. **Data availability** (Section VII): repository released on acceptance, link withheld for double-blind review.

The flood-model held-out numbers and the post-transaction latency are now filled in from your `ml-heldout-report.md` and `load-test-report.md`.

## What changed, by review point

| Review point | What I did |
|---|---|
| **A. Priority-score inconsistency** | The equation now uses `5·v` (no cap). The text states that the vulnerable term maxes at 20, the 25 cap is unreachable, the effective range is 10–90, and only three criteria are active. |
| A. "Four disclosed criteria" overstated | Reworded everywhere. Aging was simulated: the current 20-point wait cap cannot prevent starvation, because the severity gap is 30 points. Reported as a finding. |
| A. No weight validation | Added a sensitivity analysis (Section V-C). Expert-ranking validation is listed as a threat to validity and future work. The text states that the weights are not taken from Sphere or DMC guidance. |
| A. People term saturates at 15 | Stated explicitly. Tested a log-scaled alternative, which changes the ranking the most (τ = 0.78). |
| A. Race condition | Fixed in code: matching now runs in a Firestore transaction that re-reads the item and the donation balance, and moves to the next candidate if the item has been taken. The race probe was re-run after the change: zero double allocations. The paper (Sections IV-C, V-B, Algorithm 1, abstract) now describes the transaction, and the "cannot prove correctness" threat was removed. |
| A. RQ answered by assertion; DSRM phase 4 missing | New allocation simulation against FIFO, nearest-first and random, plus aging and 100 km cap variants. Reports fulfilment, wait time, distance and Gini. Claims softened to "supports". |
| B. Usability reporting | Rewritten from the original SUS record (19 participants, P2–P20; P1 is the template's example row): mean 76.7, SD 11.9, 95% CI 71.0–82.4, range 55–97.5, Cronbach's α = 0.93. Per-role means (victim 73.8, donor 77.0, volunteer 78.0, admin 77.5), flagged as not interpretable at n = 4–5. Task outcomes: 58/76 unaided, 14 with help, 4 not completed, 16 errors, mean 619 s. Defines "unaided" and notes facilitator and social-desirability bias. |
| B. No domain experts | Stated in Method and Threats to Validity; expert ranking is in future work. |
| B. Load test | Table III reports p50/p95 for each of 2 isolated runs (test volunteers placed offshore; 15/15 acceptances to test accounts). 100% success, zero double matches. Matching p95 25 s and 271 s under a 30-way burst; run-to-run spread large, so figures are indicative. Single local instance; rate limiting is a hypothesis. |
| B. Misleading latency framing | The abstract and text now say about 11 s → 2.4 s, with the 25 s figure explained as the broken intermediate. |
| B. Serverless caveat | States that the cache is per instance and not shared on Vercel. Recommends precomputed aggregates or count queries. |
| B. Traceability | New Table II maps all 33 FRs by area to formal test, development check only, or not tested. |
| B. Ethics and data availability | Ethics exemption with supervisor approval stated; repository promised on acceptance. |
| C. Distance feasibility | The simulation shows 28% of matches are over 150 km and distance broke 72% of ties. The 100 km cap variant was tested. Road-closure-aware routing is listed as future work. |
| C. Per-request priority | Listed under coverage threats. |
| C. QR "proof of co-presence" | Reworded to "evidence of handover". Added a threat model (relayed photo, collusion) and audit sampling. |
| C. Gaming, digital divide, PDPA, people without an NIC, SOS vs. 117, admin bottleneck | All covered in Sections IV-D/E and VI-A. SOS: the code was checked and the app does not show the 117 hotline, so the paper says so and recommends adding it with a no-guarantee disclaimer. The admin bottleneck is named as a threat to validity, with delegating verification to district officers suggested; it was not measured. |
| D. Flood model | Shortened and moved down. States the hyperparameters and that the interface uses risk bands, not the 0.5 threshold. On the held-out years (train 1981–2010, test 2011–2019) the model scores AUC 0.761, PR-AUC 0.354, Brier 0.120 and top-decile precision 0.419, ahead of climatology (AUC 0.687 / 0.720). The ablation shows rainfall carries the skill and that the district-rate feature hurts generalisation (AUC rises to 0.787 without it), so removing it is recommended. Reports overconfidence above about 0.4 and the reporting bias (positive rate 0.087 → 0.146). |
| E. Sahana, FloodSupport, named-system Table I | Table I now compares named systems with defined ✓/P/?/× criteria, applied strictly: × only where the source documents absence, ? where it is silent. The gap claim is narrowed, because Sahana already matches pledges to requests. |
| E. Missing literature | Added Holguín-Veras et al. 2012, Huang/Smilowitz/Balcik 2012, Balcik/Beamon/Smilowitz 2008, Reuter & Kaufhold 2018, Imran et al. (AIDR) 2014, Gregor & Hevner 2013, Venable et al. (FEDS) 2016, and the PDPA. |
| E. Mismatched citations | [5] is now cited only for the health sector. [7] is no longer used for Sri Lanka-specific evidence. The 200 SOS figure is described as demand. The DMC claim now cites the DMC site. |
| E. Statistics | Re-checked online. Ditwah: the OCHA report gives both 1.2 M and 2.2 M affected, so the paper now says "between 1.2 and 2.2 million". 646 deaths, 173 missing, US$4.1 B / 4% GDP and the 2024 flood figures were confirmed. |
| F. Mobile, trilingual, abstract, contribution #4, DSR framing | Mobile is partial in Table II and the text. The translations are stated as unreviewed. The abstract is rewritten. The cache fix is now an "engineering lesson". The paper names the contribution type (improvement) and gives four design principles and the FEDS strategy. |
| G. Presentation | Fig. 1 redrawn as a legible vector figure. The feature list is replaced by the traceability table. New Threats to Validity subsection. No fused-word hyphenation artefacts were found in the final PDF text. |

## New files for the repo

- `evaluation/allocation-simulation/simulate_matching.py`, `sensitivity.py` — run with `python simulate_matching.py ../../server/src/data/flood-risk-model.json 30` (needs numpy and scipy).
- `evaluation/allocation-simulation/sim_results.json`, `sensitivity.json` — the results quoted in the paper.
- `server/scripts/evaluate-flood-model-heldout.js` — writes `ml-heldout-report.md` and `.json`. It does not touch the deployed model.

## Still open

- Expert review of the priority weights, the reviewer's main unaddressed point.
- **Thesis consistency:** the thesis reports 9 participants and SUS 91.1. It must be updated to the 19-participant results, or the examiners will see two different studies.
- Load test: more runs spaced further apart, ideally on the Vercel deployment; matching still selects from all verified requests in the live database.
- App: add the 117 hotline and a disclaimer to the SOS screen, and consider dropping the district-rate feature from the flood model.
- Deliberately unchanged, so the simulation still describes the deployed system: uncapped aging, a distance limit and people-term scaling.
- Before submitting: AI-use disclosure (IEEE policy), a similarity check against the thesis, and a page count in Microsoft Word.
- Fig. 2 (simulation bar chart) was removed to stay within 5 pages; Table IV carries the same numbers.
