# OCP Website — Normalized Entity-Relationship Diagram

> **Source:** [OCP-Website Figma design](https://www.figma.com/design/ODfM1yHL263Fjms7uAG6wA/OCP-Website?node-id=0-1)  
> **Derived from:** TBhon mobile/API contracts (`mobile/services/backendApi.ts`), screening constants, and thesis UI documentation (`docs/_extracted_docs.txt` §4.6, §4.9).

The Figma file was not directly readable in this environment (authentication required). This ERD reverse-engineers the **data model implied by every screen** in the OCP/TBhon prototype: authentication, booth staff workflows, patient intake, symptom checklist, IoT capture, ML inference, results, history, patient QR claim, profile/settings, and program-admin facility management.

---

## Design principles

| Principle | How it is applied |
|-----------|-------------------|
| **3NF** | Repeating groups removed (symptom answers → `symptom_responses`; ML outputs → separate prediction tables). Non-key attributes depend only on their entity's PK. |
| **Hub session** | `screening_sessions` is the central aggregate root linking intake, media, symptoms, and results. |
| **Three person concepts** | (1) **Facility account** — `users` with `role ∈ {STAFF, ADMIN}`; (2) **Screened person** — `screening_clients` per visit; (3) **Patient result account** — `users` with `role = PATIENT` linked via `patient_user_id`. |
| **Booth ≠ table** | A screening booth is modeled as **staff user + facility + active session**, not a separate entity. |
| **Lookup vs transactional** | `symptom_questions` and `facilities` are reference data; everything else is transactional. |

---

## Entity-relationship diagram

```mermaid
erDiagram
    facilities ||--o{ users : "employs"
    users ||--o| user_profiles : "has"
    users ||--o{ auth_refresh_tokens : "issues"
    users ||--o{ email_verification_tokens : "requests"
    users ||--o{ password_reset_tokens : "requests"

    users ||--o{ screening_sessions : "operates"
    users ||--o{ screening_sessions : "claims_as_patient"

    screening_sessions ||--o| screening_clients : "intake"
    screening_sessions ||--o{ cough_recordings : "captures"
    screening_sessions ||--o| sputum_images : "captures"
    screening_sessions ||--o{ symptom_responses : "answers"
    screening_sessions ||--o| screening_results : "produces"
    screening_sessions ||--o| patient_access_tokens : "issues"

    cough_recordings ||--o| cough_quality_checks : "validated_by"
    cough_recordings ||--o| tb_audio_predictions : "scored_by"

    sputum_images ||--o| phlegm_predictions : "scored_by"

    symptom_questions ||--o{ symptom_responses : "answered_in"

    facilities {
        varchar facility_id PK
        varchar name
        varchar city
        varchar barangay
        varchar invite_code UK
        boolean is_active
        datetime created_at
    }

    users {
        varchar user_id PK
        varchar email UK
        varchar phone_number
        varchar password_hash
        enum role "STAFF|ADMIN|PATIENT"
        varchar facility_id FK
        varchar patient_public_code UK
        boolean email_verified
        datetime email_verified_at
        datetime created_at
        datetime updated_at
    }

    user_profiles {
        varchar profile_id PK
        varchar user_id FK_UK
        varchar first_name
        varchar last_name
        date birthdate
        varchar gender
        varchar street
        varchar barangay
        varchar city
        varchar country_code
        varchar emergency_contact_name
        varchar emergency_contact_phone
        varchar emergency_contact_relation
        varchar government_id_type
        varchar government_id_number
    }

    auth_refresh_tokens {
        varchar token_id PK
        varchar user_id FK
        varchar token_hash UK
        datetime expires_at
        datetime revoked_at
        datetime created_at
    }

    email_verification_tokens {
        varchar token_id PK
        varchar user_id FK
        varchar token_hash UK
        datetime expires_at
        datetime consumed_at
    }

    password_reset_tokens {
        varchar token_id PK
        varchar user_id FK
        varchar token_hash UK
        datetime expires_at
        datetime consumed_at
    }

    screening_sessions {
        varchar session_id PK
        varchar user_id FK "operator"
        varchar patient_user_id FK "nullable"
        datetime started_at
        datetime completed_at
        enum final_risk_level "low|moderate|high"
        enum preliminary_risk_level
        float average_tb_probability
        boolean upload_error
        varchar api_attempt
        json checklist_payload
        enum result_stage "preliminary|final"
        boolean awaiting_sputum
        varchar sputum_defer_reason
        varchar sputum_skip_reason
        datetime sputum_finalized_at
        text staff_notes
        datetime staff_result_confirmed_at
    }

    screening_clients {
        varchar client_id PK
        varchar session_id FK_UK
        varchar first_name
        varchar middle_name
        varchar last_name
        date birthdate
        varchar gender
        varchar street
        varchar barangay
        varchar city
        varchar contact_number
        varchar emergency_contact_name
        varchar emergency_contact_phone
        varchar emergency_contact_relation
        varchar government_id_type
        varchar government_id_number
    }

    symptom_questions {
        varchar question_id PK
        enum category "symptom|risk"
        text question_text
        text subtext
        int display_order
        boolean is_active
    }

    symptom_responses {
        varchar response_id PK
        varchar session_id FK
        varchar question_id FK
        boolean answer_value
    }

    cough_recordings {
        varchar recording_id PK
        varchar session_id FK
        varchar file_uri
        varchar mime_type
        bigint byte_size
        blob raw_data
        enum source "mobile|iot"
        tinyint cough_attempt "1-3"
        datetime recorded_at
    }

    cough_quality_checks {
        varchar quality_check_id PK
        varchar recording_id FK_UK
        boolean ok
        varchar label
        json reasons_json
    }

    tb_audio_predictions {
        varchar prediction_id PK
        varchar recording_id FK_UK
        boolean spoof
        float prob_no_tb
        float prob_tb
        tinyint predicted_class
        varchar model_path
    }

    sputum_images {
        varchar image_id PK
        varchar session_id FK_UK
        varchar file_uri
        varchar mime_type
        bigint byte_size
        blob raw_data
        enum source "mobile|iot"
        datetime captured_at
    }

    phlegm_predictions {
        varchar prediction_id PK
        varchar image_id FK_UK
        enum predicted_load "none|low|moderate|high"
        float confidence
        json probabilities_json
        varchar model_path
    }

    screening_results {
        varchar result_id PK
        varchar session_id FK_UK
        enum risk_level "low|moderate|high"
        text recommendation
        boolean invalid_audio
        varchar invalid_audio_label
        json invalid_audio_reasons_json
        enum referral_status "none|recommended|documented|completed"
        text referral_notes
        datetime referral_updated_at
        datetime created_at
    }

    patient_access_tokens {
        varchar token_id PK
        varchar session_id FK_UK
        varchar token_hash UK
        varchar claim_url
        datetime expires_at
        datetime claimed_at
        varchar claimed_by_user_id FK
    }
```

---

## Normalization notes (1NF → 3NF)

### First normal form (1NF)
- **Before:** Storing 11 yes/no checklist answers as columns on `screening_sessions`.
- **After:** `symptom_questions` (reference) + `symptom_responses` (one row per question per session).
- **Before:** Storing up to 3 cough clips as `cough_1`, `cough_2`, `cough_3` columns.
- **After:** `cough_recordings` with `cough_attempt` (1–3).

### Second normal form (2NF)
- **Before:** Embedding patient name/address on every `screening_sessions` row.
- **After:** `screening_clients` keyed by `session_id` (visit-specific intake, independent of whether the patient later creates an account).
- **Before:** Storing ML probabilities directly on `cough_recordings`.
- **After:** `tb_audio_predictions` and `cough_quality_checks` as separate 1:1 child tables.

### Third normal form (3NF)
- **Before:** Duplicating operator profile fields on `screening_sessions`.
- **After:** Operator identity lives on `users` + `user_profiles`; session only stores `user_id` FK.
- **Before:** Facility name/invite code copied onto each staff `users` row.
- **After:** `facilities` reference table; `users.facility_id` FK.
- **Before:** Auth credentials mixed with demographic profile.
- **After:** `users` (auth/role) vs `user_profiles` (PII) split.

---

## Entity definitions

### Core identity & access

#### `facilities`
Health facilities (RHUs) that operate screening booths.

| Column | Type | Constraints | UI source |
|--------|------|-------------|-----------|
| `facility_id` | VARCHAR(36) | PK | Admin Facilities screen |
| `name` | VARCHAR(255) | NOT NULL | Admin Facilities screen |
| `city` | VARCHAR(100) | NULL | Sign-up / Admin |
| `barangay` | VARCHAR(100) | NULL | Sign-up / Admin |
| `invite_code` | VARCHAR(64) | UNIQUE, NOT NULL | Staff sign-up (facility code) |
| `is_active` | BOOLEAN | DEFAULT true | Admin toggle |
| `created_at` | DATETIME | NOT NULL | — |

#### `users`
All authenticated accounts: booth staff, program admins, and patient result accounts.

| Column | Type | Constraints | UI source |
|--------|------|-------------|-----------|
| `user_id` | VARCHAR(36) | PK | All auth screens |
| `email` | VARCHAR(255) | UNIQUE, NULL | Login, Sign-up, Patient claim |
| `phone_number` | VARCHAR(30) | NULL | Sign-up, Profile |
| `password_hash` | VARCHAR(255) | NOT NULL | Login, Sign-up |
| `role` | ENUM | STAFF, ADMIN, PATIENT | Account Start page routing |
| `facility_id` | VARCHAR(36) | FK → facilities, NULL for PATIENT | Staff sign-up |
| `patient_public_code` | VARCHAR(64) | UNIQUE, NULL | My QR / returning patient |
| `email_verified` | BOOLEAN | DEFAULT false | Profile verification |
| `email_verified_at` | DATETIME | NULL | Profile verification |
| `created_at` | DATETIME | NOT NULL | — |
| `updated_at` | DATETIME | NOT NULL | — |

#### `user_profiles`
Demographics for any `users` row (staff profile at registration; patient profile at claim).

| Column | Type | Constraints | UI source |
|--------|------|-------------|-----------|
| `profile_id` | VARCHAR(36) | PK | — |
| `user_id` | VARCHAR(36) | FK, UNIQUE | Sign-up Step 1, Profile |
| `first_name` | VARCHAR(100) | NOT NULL | Sign-up, Profile |
| `last_name` | VARCHAR(100) | NOT NULL | Sign-up, Profile |
| `birthdate` | DATE | NOT NULL | Sign-up, Profile |
| `gender` | VARCHAR(30) | NOT NULL | Sign-up, Profile |
| `street` | VARCHAR(255) | NULL | Sign-up, Profile |
| `barangay` | VARCHAR(100) | NULL | Sign-up, Profile |
| `city` | VARCHAR(100) | NULL | Sign-up, Profile |
| `country_code` | VARCHAR(10) | NULL | Profile |
| `emergency_contact_name` | VARCHAR(100) | NULL | Profile (patient) |
| `emergency_contact_phone` | VARCHAR(30) | NULL | Profile (patient) |
| `emergency_contact_relation` | VARCHAR(50) | NULL | Profile (patient) |
| `government_id_type` | VARCHAR(50) | NULL | Profile (patient) |
| `government_id_number` | VARCHAR(100) | NULL | Profile (patient) |

#### `auth_refresh_tokens`
Persistent login sessions (refresh flow).

| Column | Type | Constraints | UI source |
|--------|------|-------------|-----------|
| `token_id` | VARCHAR(36) | PK | — |
| `user_id` | VARCHAR(36) | FK | Login |
| `token_hash` | VARCHAR(255) | UNIQUE | — |
| `expires_at` | DATETIME | NOT NULL | — |
| `revoked_at` | DATETIME | NULL | Logout |
| `created_at` | DATETIME | NOT NULL | — |

#### `email_verification_tokens` / `password_reset_tokens`
Single-use tokens for account security flows.

| Column | Type | Constraints | UI source |
|--------|------|-------------|-----------|
| `token_id` | VARCHAR(36) | PK | — |
| `user_id` | VARCHAR(36) | FK | Verify Email, Forgot Password |
| `token_hash` | VARCHAR(255) | UNIQUE | — |
| `expires_at` | DATETIME | NOT NULL | — |
| `consumed_at` | DATETIME | NULL | — |

---

### Screening workflow (hub)

#### `screening_sessions`
Central record for one booth screening visit.

| Column | Type | Constraints | UI source |
|--------|------|-------------|-----------|
| `session_id` | VARCHAR(36) | PK | Screening flow (all steps) |
| `user_id` | VARCHAR(36) | FK → users (operator) | Home → Start screening |
| `patient_user_id` | VARCHAR(36) | FK → users, NULL | Returning patient / claim link |
| `started_at` | DATETIME | NOT NULL | Draft creation |
| `completed_at` | DATETIME | NULL | Results save |
| `final_risk_level` | ENUM | low, moderate, high | Results gauge |
| `preliminary_risk_level` | ENUM | NULL | Two-phase preliminary result |
| `average_tb_probability` | FLOAT | NULL | Results / History |
| `upload_error` | BOOLEAN | DEFAULT false | Processing screen |
| `api_attempt` | VARCHAR(50) | NULL | — |
| `checklist_payload` | JSON | NULL | Checklist snapshot |
| `result_stage` | ENUM | preliminary, final | Two-phase sputum |
| `awaiting_sputum` | BOOLEAN | DEFAULT false | Defer sputum flow |
| `sputum_defer_reason` | VARCHAR(255) | NULL | Sputum defer modal |
| `sputum_skip_reason` | VARCHAR(255) | NULL | Sputum skip modal |
| `sputum_finalized_at` | DATETIME | NULL | Finalize sputum |
| `staff_notes` | TEXT | NULL | Staff review |
| `staff_result_confirmed_at` | DATETIME | NULL | Staff review confirm |

**Indexes:** `(user_id, completed_at DESC)`, `(patient_user_id, completed_at DESC)`

#### `screening_clients`
Per-visit patient intake (6-step Patient Details UI).

| Column | Type | Constraints | UI source |
|--------|------|-------------|-----------|
| `client_id` | VARCHAR(36) | PK | Patient Details |
| `session_id` | VARCHAR(36) | FK, UNIQUE | Patient Details |
| `first_name` | VARCHAR(100) | NOT NULL | Step 1: Identity |
| `middle_name` | VARCHAR(100) | NULL | Step 1 |
| `last_name` | VARCHAR(100) | NOT NULL | Step 1 |
| `birthdate` | DATE | NOT NULL | Step 1 |
| `gender` | VARCHAR(30) | NOT NULL | Step 1 |
| `street` | VARCHAR(255) | NULL | Step 2: Address |
| `barangay` | VARCHAR(100) | NULL | Step 2 |
| `city` | VARCHAR(100) | NULL | Step 2 |
| `contact_number` | VARCHAR(30) | NOT NULL | Step 3: Contact |
| `emergency_contact_name` | VARCHAR(100) | NULL | Step 4 |
| `emergency_contact_phone` | VARCHAR(30) | NULL | Step 4 |
| `emergency_contact_relation` | VARCHAR(50) | NULL | Step 4 |
| `government_id_type` | VARCHAR(50) | NULL | Step 5: Gov ID |
| `government_id_number` | VARCHAR(100) | NULL | Step 5 |

---

### Symptom checklist

#### `symptom_questions` (seed / lookup)
Canonical 11 questions from the Checklist Symptoms page.

| `question_id` | `category` | Question (abbreviated) |
|---------------|------------|------------------------|
| `symptom_cough_3w` | symptom | Cough ≥ 2 weeks |
| `symptom_blood_sputum` | symptom | Coughing blood/phlegm |
| `symptom_chest_pain` | symptom | Chest pain breathing/coughing |
| `symptom_fever` | symptom | Unexplained fever |
| `symptom_night_sweats` | symptom | Night sweats |
| `symptom_weight_loss` | symptom | Unintentional weight loss |
| `symptom_fatigue` | symptom | Unusual weakness |
| `symptom_loss_appetite` | symptom | Loss of appetite |
| `risk_contact_tb` | risk | Close TB contact |
| `risk_high_burden_travel` | risk | High-burden country travel |
| `risk_congregate_setting` | risk | Crowded/high-risk setting |

#### `symptom_responses`
| Column | Type | Constraints | UI source |
|--------|------|-------------|-----------|
| `response_id` | VARCHAR(36) | PK | — |
| `session_id` | VARCHAR(36) | FK | Checklist |
| `question_id` | VARCHAR(64) | FK | Checklist |
| `answer_value` | BOOLEAN | NOT NULL | Yes/No toggles |

**Unique:** `(session_id, question_id)`

---

### Media capture & ML outputs

#### `cough_recordings`
Up to 3 cough clips per session (IoT or mobile).

| Column | Type | Constraints | UI source |
|--------|------|-------------|-----------|
| `recording_id` | VARCHAR(36) | PK | Record Cough |
| `session_id` | VARCHAR(36) | FK | Record Cough |
| `file_uri` | VARCHAR(512) | NULL | Replay / Review |
| `mime_type` | VARCHAR(100) | NULL | — |
| `byte_size` | BIGINT | NULL | — |
| `raw_data` | LONGBLOB | NULL | Server storage |
| `source` | ENUM | mobile, iot | IoT cough screen |
| `cough_attempt` | TINYINT | 1–3 | Retake slots |
| `recorded_at` | DATETIME | NULL | — |

#### `cough_quality_checks` (1:1)
| Column | Type | UI source |
|--------|------|-----------|
| `ok` | BOOLEAN | Cough quality badge |
| `label` | VARCHAR(50) | Quality feedback |
| `reasons_json` | JSON | Invalid-audio reasons |

#### `tb_audio_predictions` (1:1)
| Column | Type | UI source |
|--------|------|-----------|
| `prob_no_tb` | FLOAT | Processing / fusion |
| `prob_tb` | FLOAT | Gauge chart |
| `spoof` | BOOLEAN | Anti-spoof gate |
| `predicted_class` | TINYINT | 0/1 |
| `model_path` | VARCHAR(255) | Audit trail |

#### `sputum_images` (1 per session)
| Column | Type | UI source |
|--------|------|-----------|
| `image_id` | VARCHAR(36) | PK |
| `session_id` | VARCHAR(36) | FK, UNIQUE |
| `file_uri` | VARCHAR(512) | Capture Sputum preview |
| `raw_data` | LONGBLOB | Server storage |
| `source` | ENUM | mobile, iot |
| `captured_at` | DATETIME | — |

#### `phlegm_predictions` (1:1)
| Column | Type | UI source |
|--------|------|-----------|
| `predicted_load` | ENUM | none, low, moderate, high |
| `confidence` | FLOAT | Results breakdown |
| `probabilities_json` | JSON | Fusion detail |

---

### Results, referral & patient access

#### `screening_results` (1 per session)
| Column | Type | UI source |
|--------|------|-----------|
| `risk_level` | ENUM | Results gauge (Low/Moderate/High) |
| `recommendation` | TEXT | Results explanatory text |
| `invalid_audio` | BOOLEAN | Invalid audio flag |
| `invalid_audio_label` | VARCHAR(100) | — |
| `invalid_audio_reasons_json` | JSON | — |
| `referral_status` | ENUM | none → completed |
| `referral_notes` | TEXT | Staff referral patch |
| `referral_updated_at` | DATETIME | — |
| `created_at` | DATETIME | History timestamp |

#### `patient_access_tokens` (1 per completed session)
QR/deep-link token for "View my screening result" patient onboarding.

| Column | Type | UI source |
|--------|------|-----------|
| `token_id` | VARCHAR(36) | PK |
| `session_id` | VARCHAR(36) | FK, UNIQUE |
| `token_hash` | VARCHAR(255) | UNIQUE |
| `claim_url` | VARCHAR(512) | `tbhon://patient/claim?token=…` |
| `expires_at` | DATETIME | ~90 days |
| `claimed_at` | DATETIME | Patient claim completion |
| `claimed_by_user_id` | VARCHAR(36) | FK → users (PATIENT) |

---

## UI screen → entity mapping

| Figma / prototype screen | Primary entities read/written |
|--------------------------|-------------------------------|
| Account Start (Staff sign in / New booth staff / View result) | `users` (route by `role`) |
| Login | `users`, `auth_refresh_tokens` |
| Staff Sign-up (2 steps + facility code) | `users`, `user_profiles`, `facilities` |
| Home Dashboard | `screening_sessions` (latest), `screening_results` |
| Screening Instructions | — (stateless) |
| Patient Details (6 steps) | `screening_clients` |
| Checklist Symptoms (11 questions) | `symptom_questions`, `symptom_responses` |
| Record Cough (IoT) | `cough_recordings`, `cough_quality_checks` |
| Capture Sputum (IoT) | `sputum_images` |
| Processing / Review Inputs | `tb_audio_predictions`, `phlegm_predictions` |
| Results (gauge) | `screening_results`, `screening_sessions` |
| Staff review / referral | `screening_results`, `screening_sessions.staff_*` |
| Patient result slip / QR | `patient_access_tokens` |
| View my screening result (claim) | `patient_access_tokens`, `users`, `user_profiles` |
| Screening History | `screening_sessions`, `screening_results`, `screening_clients` |
| Profile & Settings | `users`, `user_profiles` |
| Learn | — (static content; no DB) |
| Admin Facilities | `facilities` |
| Returning patient (QR lookup) | `users.patient_public_code`, `screening_sessions` |

---

## Relationship cardinality summary

```
facilities        1 ──< ∞  users (staff/admin)
users             1 ──< 1  user_profiles
users             1 ──< ∞  screening_sessions (as operator)
users             1 ──< ∞  screening_sessions (as patient_user_id, optional)
screening_sessions 1 ──< 1  screening_clients
screening_sessions 1 ──< ∞  cough_recordings (max 3 by app rule)
screening_sessions 1 ──< 1  sputum_images
screening_sessions 1 ──< ∞  symptom_responses (11 per session)
screening_sessions 1 ──< 1  screening_results
screening_sessions 1 ──< 1  patient_access_tokens
cough_recordings   1 ──< 1  cough_quality_checks
cough_recordings   1 ──< 1  tb_audio_predictions
sputum_images      1 ──< 1  phlegm_predictions
symptom_questions  1 ──< ∞  symptom_responses
```

---

## Out of scope (not persisted)

These appear in the UI but are **runtime/ephemeral**, not normalized tables:

| Concept | Why excluded |
|---------|--------------|
| IoT device registry | Device status (`online`, `state`, `pendingCommand`) is polled via API cache, not a Prisma entity in the current backend contract |
| Learn page articles | Static/markdown content |
| Notification inbox | Client-side/local sync in mobile app |
| ML model weights | Files on ML droplet (`model.pt`), not relational rows |
| `prisma_migrations` | Framework metadata only |

---

## Suggested Prisma relation sketch

```prisma
model Facility {
  facilityId  String   @id @default(uuid()) @map("facility_id")
  name        String
  inviteCode  String   @unique @map("invite_code")
  isActive    Boolean  @default(true) @map("is_active")
  users       User[]
  @@map("facilities")
}

model ScreeningSession {
  sessionId       String   @id @default(uuid()) @map("session_id")
  userId          String   @map("user_id")
  patientUserId   String?  @map("patient_user_id")
  operator        User     @relation("OperatorSessions", fields: [userId], references: [userId])
  patient         User?    @relation("PatientSessions", fields: [patientUserId], references: [userId])
  client          ScreeningClient?
  coughRecordings CoughRecording[]
  sputumImage     SputumImage?
  symptomResponses SymptomResponse[]
  result          ScreeningResult?
  patientAccess   PatientAccessToken?
  @@map("screening_sessions")
}
```

---

## Validation against API contract

This ERD aligns with:

- `ApiUserPayload`, `ScreeningClientRecord`, `ScreeningSessionDetail`, `ScreeningHistoryRow` in `mobile/services/backendApi.ts`
- `SCREENING_CHECKLIST_QUESTIONS` in `mobile/constants/screeningChecklist.ts`
- `PatientAccessResponse` / claim flow in `mobile/constants/patientAccess.ts`
- Table 17 entity list in thesis §4.6, extended with `facilities` and `patient_access_tokens` present in the live API but absent from the original thesis table
