import { create } from 'zustand';
import { api } from '@/lib/api';

export interface GamifyState {
  xp_total: number;
  xp_today: number;
  daily_goal_xp: number;
  daily_goal_pct: number;
  streak: number;
  achievements: string[];
}

interface Store {
  state: GamifyState | null;
  unlocked: string | null;
  fetchFor(userId: string): Promise<void>;
  refreshAfter(userId: string, delayMs?: number): void;
  clearUnlocked(): void;
}

export const useGamify = create<Store>((set, get) => ({
  state: null,
  unlocked: null,
  async fetchFor(userId: string) {
    const prev = get().state?.achievements ?? [];
    const next = await api<GamifyState>(`/api/gamify/state?user_id=${encodeURIComponent(userId)}`);
    const newlyEarned = next.achievements.find((a) => !prev.includes(a));
    set({ state: next, unlocked: newlyEarned ?? get().unlocked });
  },
  refreshAfter(userId: string, delayMs = 400) {
    setTimeout(() => void get().fetchFor(userId), delayMs);
  },
  clearUnlocked() {
    set({ unlocked: null });
  },
}));
