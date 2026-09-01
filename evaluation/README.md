# Usability Evaluation — SUS + Scenario Testing

This folder holds everything needed to run the usability evaluation for the dissertation's evaluation chapter: task scenarios, a facilitator guide, a consent form, and the SUS + feedback survey.

## Before you recruit anyone

**Check with your supervisor whether NSBM requires ethics approval for this.** Most universities require some form of ethics clearance before testing with human participants, even for a "low-risk" usability study with no real personal data involved. Don't recruit until this is sorted — it can gate the whole evaluation chapter if skipped.

## Files in this folder

| File | Purpose |
|---|---|
| `participant-consent-form.md` | Information sheet + consent form — send or hand to each participant before their session. Fill in the placeholders (your name, supervisor, contact email, ethics approval number) before using. |
| `facilitator-guide-and-scenarios.md` | The session script you (the facilitator) follow — intro, task scenarios per role, task-tracking sheet, debrief questions. |
| `sus-feedback-survey.md` | The standard 10-item SUS questionnaire plus demographic and open-ended questions, ready to copy into a Google Form (or hand out on paper) after each session. Includes the SUS scoring formula. |

## Recruitment

- **Sample size:** 10-15 participants is a reasonable, defensible sample for a BSc dissertation. Nielsen's usability heuristics suggest even 5 participants surface most usability issues; SUS as a *quantitative* score benefits from more, but student dissertations rarely go past 15-20.
- **Who:** You don't need real disaster victims/donors/volunteers — you need people willing to follow a task script and give honest feedback. Classmates, friends, family, coursemates all work. Aim for some spread in age/tech-familiarity if you can, since that's worth reporting in your methodology.
- **How many per role:** If you can, get at least 2-3 participants to test each of the four roles (victim, donor, volunteer, admin) rather than everyone only testing one — that way you can speak to usability across the whole system, not just one flow. If recruiting is hard, prioritize victim and admin (the two most feature-dense roles).
- **Session length:** Budget 20-30 minutes per participant — task scenarios (~15 min) + SUS survey (~5 min) + a couple of debrief questions (~5-10 min).
- **Test data:** Use test/seed accounts, not anyone's real information — the consent form already tells participants this. Reset or note which test accounts you use so sessions don't collide with each other (e.g., two victims submitting requests on the same seeded admin queue at once).

## Recording data

For each session, capture:
1. **Task success/failure and time-on-task** per scenario (tracking sheet is in the facilitator guide) — this is your quantitative usability data.
2. **SUS score** (0-100, formula in the survey file) — your standardized usability score, comparable across participants and against published SUS benchmarks (a score above ~68 is considered "above average").
3. **Qualitative notes** — anything the participant said out loud, hesitations, errors, and their answers to the open-ended questions.

Screen recording (with consent) is genuinely useful here — it lets you re-watch a session to catch usability issues you missed live, and gives you concrete examples to quote in the dissertation. The consent form has a line for this; it's optional, don't require it.
