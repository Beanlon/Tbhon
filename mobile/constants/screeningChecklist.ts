export type ChecklistQuestionCategory = "symptom" | "risk";

export type ChecklistQuestionDef = {
  id: string;
  category: ChecklistQuestionCategory;
  question: string;
  subtext?: string;
};

/** Canonical order for checklist UI and detail playback (matches backend seed IDs). */
export const SCREENING_CHECKLIST_QUESTIONS: ChecklistQuestionDef[] = [
  {
    id: "symptom_cough_3w",
    category: "symptom",
    question: "Have you had a cough that has lasted 2 weeks or longer?",
    subtext:
      "A persistent cough that does not go away is one of the most common signs of TB.",
  },
  {
    id: "symptom_blood_sputum",
    category: "symptom",
    question: "Have you been coughing up blood or phlegm from deep in your lungs?",
    subtext: "This includes any blood-streaked mucus or sputum when you cough.",
  },
  {
    id: "symptom_chest_pain",
    category: "symptom",
    question: "Are you experiencing chest pain when you breathe or cough?",
  },
  {
    id: "symptom_fever",
    category: "symptom",
    question: "Have you had an unexplained fever recently?",
    subtext: "A fever that comes and goes without a clear cause.",
  },
  {
    id: "symptom_night_sweats",
    category: "symptom",
    question: "Do you wake up at night drenched in sweat?",
    subtext: "Night sweats severe enough to soak your clothes or bedding.",
  },
  {
    id: "symptom_weight_loss",
    category: "symptom",
    question: "Have you lost weight without trying?",
    subtext: "Unexplained weight loss over the past few weeks or months.",
  },
  {
    id: "symptom_fatigue",
    category: "symptom",
    question: "Do you feel unusually weak or tired most of the time?",
  },
  {
    id: "symptom_loss_appetite",
    category: "symptom",
    question: "Have you noticed a significant loss of appetite?",
  },
  {
    id: "risk_contact_tb",
    category: "risk",
    question: "Have you been in close contact with someone who has or may have TB?",
    subtext:
      "This includes living with, caring for, or spending extended time with someone diagnosed with TB.",
  },
  {
    id: "risk_high_burden_travel",
    category: "risk",
    question: "Were you born in, or have you recently traveled to, a country where TB is common?",
    subtext: "Such as parts of Asia, Africa, Eastern Europe, or Latin America.",
  },
  {
    id: "risk_congregate_setting",
    category: "risk",
    question: "Do you live or work in a crowded or high-risk setting?",
    subtext: "Such as a shelter, prison, jail, nursing home, or hospital.",
  },
];
