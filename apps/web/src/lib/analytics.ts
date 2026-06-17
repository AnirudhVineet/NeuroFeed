import { api } from './api';

export interface XpPoint { date: string; xp: number }
export interface ActPoint { date: string; events: number }
export interface MasteryRow { concept_id: string; name: string; score: number; updated_at: string }

export interface AnalyticsPayload {
  xp_series: XpPoint[];
  activity_series: ActPoint[];
  mastery: MasteryRow[];
}

export async function fetchAnalytics(userId: string) {
  return api<AnalyticsPayload>(`/api/analytics?user_id=${encodeURIComponent(userId)}`);
}
