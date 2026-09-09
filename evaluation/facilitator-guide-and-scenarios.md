# Facilitator Guide & Task Scenarios

## Before the session

- [ ] Consent form signed (see `participant-consent-form.md`).
- [ ] A test account ready for the role being tested (see per-role setup notes below) — **never use a real account or real personal details**.
- [ ] The app open at the landing page, logged out, in the participant's chosen language if relevant.
- [ ] Screen recording started, if the participant agreed to it.
- [ ] This tracking sheet (or a copy of it) ready to fill in as you go.

## Session script (read aloud / paraphrase)

> "Thanks for helping out. You're going to try out a disaster aid coordination platform I've built for my dissertation, acting as a [victim / donor / volunteer / admin]. I'll give you a few short tasks — just try to complete them as you normally would, and think out loud if you can, so I can hear your reactions as you go. There's no wrong way to do this — if something's confusing, that's useful information for me, not a mistake on your part. You can stop at any time. Any questions before we start?"

Then walk through the scenarios for their assigned role (below). After each task: note success/failure, time taken, and anything they said or struggled with.

After all tasks: hand over `sus-feedback-survey.md` (or its Google Form link), then ask the debrief questions at the end of this document.

---

## Task-tracking sheet

Copy this table once per participant.

| # | Task | Completed? (Y / N / partial) | Time (mm:ss) | Errors / help given | Notes |
|---|------|:---:|:---:|---|---|
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |
| 4 | | | | | |
| 5 | | | | | |

---

## Victim scenarios

**Setup:** Have a fresh victim test account ready, or let them register one during Task 1. If registering during the test, note that NIC/home address fields need *some* value — tell them any made-up value is fine (this is a test account).

**Scenario framing:** *"Imagine your area has just flooded. You and your family are safe but you've lost access to food, clean water, and are running low on medicine."*

1. **Register / log in** as a disaster victim.
2. **Submit an aid request** for the flood, asking for at least food, water, and one more category of your choice. Include how many people are affected.
3. Without prompting, see if they notice/mention the **location capture** step and the **duplicate/possible-emergency-area notices** if either appears.
4. **Check the status** of the request you just submitted.
5. *(Facilitator-led — you may need to approve/match/assign behind the scenes, or use a pre-seeded request that's already at the "delivered" stage)* — **confirm receipt** of a delivery by scanning the QR code shown on a second device or screen.
6. *(Optional, if time allows)* Locate and describe what the **SOS button** is for — don't have them actually submit one unless you want to generate real test data, since it pages every admin.

## Donor scenarios

**Setup:** Fresh donor test account, or register during Task 1.

**Scenario framing:** *"You'd like to donate some supplies to disaster victims."*

1. **Register / log in** as a donor.
2. **Register a donation** (e.g. water or food) — try choosing **self-delivery**.
3. **Check the status** of your donation.
4. *(Facilitator-led — the donation needs to be matched by an admin first)* Once matched, **mark your donation as delivered** and see the QR code that appears.
5. *(Optional)* Register a second donation, this time choosing **volunteer-assisted delivery**, and describe the difference they noticed between the two paths.

## Volunteer scenarios

**Setup:** Fresh volunteer test account. You'll need an admin to have already assigned them a delivery before Task 2 — either do this live between tasks or pre-seed it.

**Scenario framing:** *"You've signed up to help deliver aid to people who need it."*

1. **Register / log in** as a volunteer.
2. Find your **assigned deliveries** and **accept** one (or try **reject** with a reason, then see what happens to it).
3. **Update the delivery status** from picked up through to delivered.
4. Find and use the **availability toggle** — turn yourself unavailable, then back on.
5. *(Optional)* Find and try the **community report** form (road closure / water condition) at the bottom of the deliveries page.

## Admin scenarios

**Setup:** Fresh admin test account. Ideally have at least one pending request and one available donation already seeded so there's something to act on.

**Scenario framing:** *"You're an administrator responsible for reviewing incoming requests and coordinating aid delivery."*

1. **Log in** as an admin and find the **pending aid requests**.
2. **Verify/approve** one request (or reject one, and see what they notice about the flagged/duplicate/medicine-review indicators if any appear).
3. **Match a donation** to a request, then **assign a volunteer** to deliver it.
4. Find the **transparency/KPI overview** — ask them what it's telling them, in their own words.
5. *(Optional)* Open the **Situation Map** and try switching between its different view modes (Requests / Areas Affected / River Gauges / Reservoirs / Flood Risk Forecast / GDACS / Earthquakes) — ask them to **search for and zoom to a specific district** using the search box.

---

## Public visitor scenario (no account needed)

**Added because this is the one surface every participant can test without a login, and the one that's had the most direct usability work done on it — worth deliberately checking whether that work actually landed for someone seeing it cold.**

**Setup:** Open the app at the landing page, **logged out**, with a cleared browser (or a private/incognito window) so the one-time onboarding walkthrough actually triggers — if it's already been dismissed on that browser, clear `localStorage` first or the participant will miss Task 2.

**Scenario framing:** *"You're a member of the public who's heard there's a website with live information about disaster-affected areas in Sri Lanka. You've just opened it for the first time."*

1. **Without any instruction from you**, see whether they notice and interact with the **onboarding walkthrough** that opens automatically. Note whether they read it, skip it, or click through — and whether they can later explain what the colored map markers mean.
2. Ask them to find **flood risk information for a specific district** (name one, e.g. "What's the flood risk in Ratnapura?") using the map's tabs and the **district/country search box**.
3. Ask them to explain, in their own words, what the **colored icons on the map legend** mean (checkmark / warning triangle / exclamation mark) — this checks whether the icon+color+text pairing actually communicates risk level without needing to read a wall of text.
4. Point out the **"How is this calculated?"** expandable link under one of the captions (e.g. Flood Risk Forecast or GDACS) and ask if they'd have found it themselves.
5. Show them the **"Aa" accessibility control** in the header — ask them to try increasing the text size and turning on high contrast, then ask if either felt useful.
6. *(Optional)* Ask them to switch the site to **Sinhala or Tamil** using the language switcher and see if anything looks broken or confusing in that language.

This scenario directly tests the accessibility pass (plain-language captions, icon+color+text legends, the onboarding walkthrough, and the text-size/contrast toggle) built in response to supervisor feedback that the map wasn't user-friendly for people of all knowledge levels — the debrief question "was there anything you expected the system to do that it didn't?" is worth asking again specifically about this scenario.

---

## Debrief questions (ask after the SUS survey)

1. What did you like most about using the system?
2. What was the most confusing or frustrating part?
3. If you were actually affected by a disaster, would you trust a system like this? Why or why not?
4. Was there anything you expected the system to do that it didn't?
5. Any other comments?

Record answers in your notes — these quotes are useful for the dissertation's qualitative findings.
