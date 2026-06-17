import { api } from './api';

export type TutorLevel = 'beg' | 'int' | 'adv';

export interface TutorCitation {
  doc_id: string;
  page_or_slide: number | null;
  chunk_id: number;
}

export interface TutorResponse {
  answer: string;
  level: TutorLevel;
  citations: TutorCitation[];
  confidence: number;
  grounded: boolean;
}

export async function askTutor(
  userId: string,
  question: string,
  level: TutorLevel,
  documentId?: string,
) {
  return api<TutorResponse>('/api/tutor', {
    method: 'POST',
    body: JSON.stringify({
      user_id: userId,
      question,
      level,
      document_id: documentId ?? null,
    }),
  });
}
