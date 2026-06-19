# TBhon — System Demo Flow (3 Members)

Direct app walkthrough only. No product pitch — just tap through the screens.

**Duration:** ~10–12 min

---

## Team

| Member | Handles |
|--------|---------|
| **Member 1** | Login → session start → intake → checklist |
| **Member 2** | Cough capture → sputum → review → processing |
| **Member 3** | Staff review → result → QR → history |

---

## Demo patient

| Field | Enter |
|-------|-------|
| Name | Juan Dela Cruz |
| Birthdate | 15 Mar 1990 (age 34) |
| Gender | Male |
| Address | 123 Rizal St, Brgy. San Jose, Quezon City |
| Contact | 09171234567 |
| Checklist | Yes: cough 2+ weeks, night sweats, weight loss, TB contact |

---

## Before you start

- Staff account logged in
- ESP32 on + same Wi-Fi as phone
- Sputum smear ready (if showing capture)
- Backend + ML tunnels online

---

## Flow

`Home → Start screening → Staff instructions → Patient type → Client intake → Checklist → IoT cough (×3) → IoT sputum → Review → Processing → Staff review → Result → History`

### PART 1 — Member 1

| # | Screen | Action |
|---|--------|--------|
| 1 | Login | Sign in as booth staff |
| 2 | Home | Tap **Start screening** |
| 3 | Staff instructions | **Start session** |
| 4 | Patient type | **New patient** |
| 5–10 | Client intake | Identity → address → contact → (optional steps) → **Review & confirm** |
| 11 | Checklist | Answer 11 Yes/No questions |
| 12 | Checklist summary | **Continue to device cough capture** → hand off |

### PART 2 — Member 2

| # | Screen | Action |
|---|--------|--------|
| 13–14 | IoT cough | 3 coughs on booth device → **Continue** |
| 15–16 | IoT sputum | **Start capture** (or Skip with reason) |
| 17–18 | Review | Verify clips + image → **Analyze** |
| 19 | Processing | Wait until done → hand off |

### PART 3 — Member 3

| # | Screen | Action |
|---|--------|--------|
| 20–21 | Staff review | Read triage → **Confirm & show result** |
| 22–24 | Result | Gauge, breakdown, QR, PDF (optional) |
| 25–26 | Session details / History | Open saved session → demo done |

---

## Cue cards

**Member 1:** Login → Start screening → intake → checklist → hand off  
**Member 2:** 3 coughs → sputum → Review → Processing → hand off  
**Member 3:** Staff review → Result → QR → History

---

*Word version: `docs/TBhon_Demo_Presentation.docx`*
