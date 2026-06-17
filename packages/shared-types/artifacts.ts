// Mirrors apps/api/neurofeed/services/llm/schemas.py. Keep in sync.

export interface Summary {
  tldr: string;
  bullets: string[]; // 5..8
}

export interface KeyConcept {
  name: string;
  definition: string;
  why_it_matters: string;
  source_chunk_ids: number[];
}

export interface SwipeCard {
  title: string;
  body: string; // <= 40 words
  icon: string;
  accent_color: string; // #RRGGBB
  concept_id: string | null;
}

export type Difficulty = 1 | 2 | 3;

export interface Flashcard {
  question: string;
  answer: string;
  concept_id: string | null;
  difficulty: Difficulty;
}

export interface QuizItem {
  stem: string;
  options: [string, string, string, string];
  answer_index: 0 | 1 | 2 | 3;
  explanation: string;
  source_chunk_id: number | null;
}

export interface LearningPathStep {
  order: number;
  concept_id: string;
  goal: string;
  artifact_ids: string[];
}

export interface ReelScene {
  caption: string;
  voiceover: string;
  visual_hint: string;
  duration_sec: number;
}

export interface ReelScript {
  scenes: ReelScene[];
}

export type TutorLevel = 'beg' | 'int' | 'adv';

export interface TutorCitation {
  doc_id: string;
  page_or_slide: number | null;
  chunk_id: number;
}

export interface TutorAnswer {
  answer: string;
  level: TutorLevel;
  citations: TutorCitation[];
  confidence: number;
}
