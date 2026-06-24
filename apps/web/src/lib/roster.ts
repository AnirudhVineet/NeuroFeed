// Static cohort of other learners so the social UI has people to show
// (profiles, leaderboards, suggestions, activity feed) before any real
// follower/profile backend exists. Names are realistic enough to feel
// alive; XP / streak numbers are deterministic from the username so the
// roster doesn't reshuffle between renders.

import { SUBJECTS, type Subject } from './subjects';

export interface RosterUser {
  username: string;
  display_name: string;
  bio: string;
  college: string;
  subjects: Subject[];
  xp: number;
  streak: number;
  level: number;
  accuracy: number;
  hours: number;
  wins: number;
  losses: number;
  uploads: number;
  reels_watched: number;
  stories_completed: number;
  quizzes_finished: number;
  flashcards_reviewed: number;
  badges: string[];
  online: boolean;
  last_active_min_ago: number;
  rank: number;
}

const SEED: { username: string; display_name: string; bio: string; college: string; subjects: Subject[] }[] = [
  { username: 'anirudh', display_name: 'Anirudh', bio: 'Building NeuroFeed. CS @ BITS.', college: 'BITS Pilani', subjects: ['Networking', 'AI', 'DBMS'] },
  { username: 'rahul', display_name: 'Rahul Sharma', bio: 'OS nerd · 30-day streak addict', college: 'IIT Bombay', subjects: ['OS', 'Networking'] },
  { username: 'aryan', display_name: 'Aryan Mehta', bio: 'DBMS · Distributed systems · Coffee', college: 'IIIT Hyderabad', subjects: ['DBMS', 'Networking'] },
  { username: 'priya', display_name: 'Priya Iyer', bio: 'Quiz battle champion ⚡', college: 'IIT Madras', subjects: ['Mathematics', 'ML', 'AI'] },
  { username: 'sahil', display_name: 'Sahil Khan', bio: 'Flashcards > sleep', college: 'NIT Trichy', subjects: ['Physics', 'Mathematics'] },
  { username: 'meera', display_name: 'Meera Pillai', bio: 'ML researcher in training', college: 'IISc Bangalore', subjects: ['ML', 'AI', 'Mathematics'] },
  { username: 'kabir', display_name: 'Kabir Singh', bio: 'Networking + a lot of caffeine', college: 'DTU', subjects: ['Networking', 'OS'] },
  { username: 'ishita', display_name: 'Ishita Roy', bio: 'Chemistry undergrad, NF beta tester', college: 'St. Xaviers', subjects: ['Chemistry', 'Physics'] },
  { username: 'devraj', display_name: 'Devraj Patel', bio: 'CP + DBMS', college: 'IIT Kanpur', subjects: ['DBMS', 'Mathematics'] },
  { username: 'tara', display_name: 'Tara Krishnan', bio: 'Math olympiad → AI now', college: 'CMI', subjects: ['Mathematics', 'AI'] },
  { username: 'vivaan', display_name: 'Vivaan Joshi', bio: 'OS scheduler enthusiast', college: 'PESU', subjects: ['OS'] },
  { username: 'nidhi', display_name: 'Nidhi Bansal', bio: 'Networking · GATE 2026', college: 'Thapar', subjects: ['Networking', 'OS'] },
];

const BADGE_POOL = [
  '30_day_streak',
  'quiz_master',
  'networking_expert',
  '100_reels',
  '10_uploads',
  'flashcard_champ',
  'perfect_quiz',
  'early_adopter',
];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

let _roster: RosterUser[] | null = null;

export function getRoster(): RosterUser[] {
  if (_roster) return _roster;
  const seeded = SEED.map((s) => {
    const h = hash(s.username);
    const xp = 800 + (h % 9000);
    const streak = 1 + (h % 45);
    const level = Math.max(1, Math.floor(xp / 250));
    const accuracy = 60 + (h % 38);
    const badges = BADGE_POOL.filter((_, i) => ((h >> i) & 1) === 1).slice(0, 4 + (h % 4));
    return {
      ...s,
      xp,
      streak,
      level,
      accuracy,
      hours: 4 + (h % 80),
      wins: h % 40,
      losses: (h >> 3) % 30,
      uploads: 1 + (h % 18),
      reels_watched: 10 + (h % 220),
      stories_completed: h % 18,
      quizzes_finished: 5 + (h % 60),
      flashcards_reviewed: 20 + (h % 400),
      badges,
      online: (h % 3) === 0,
      last_active_min_ago: h % 240,
      rank: 0, // patched below
    } satisfies RosterUser;
  });
  // assign ranks by XP
  seeded.sort((a, b) => b.xp - a.xp);
  seeded.forEach((u, i) => { u.rank = i + 1; });
  _roster = seeded;
  return seeded;
}

export function findByUsername(username: string): RosterUser | undefined {
  return getRoster().find((u) => u.username === username);
}

export function suggestedFor(currentSubjects: string[], following: string[], limit = 5): RosterUser[] {
  const cur = new Set(currentSubjects);
  return getRoster()
    .filter((u) => !following.includes(u.username))
    .map((u) => ({ u, score: u.subjects.filter((s) => cur.has(s)).length + (u.online ? 0.5 : 0) }))
    .sort((a, b) => b.score - a.score || b.u.xp - a.u.xp)
    .slice(0, limit)
    .map(({ u }) => u);
}

export const BADGE_CATALOG: Record<string, { label: string; glyph: string; tone: string; description: string }> = {
  '30_day_streak': { label: '30 Day Streak', glyph: '🔥', tone: 'orange', description: 'Showed up 30 days in a row.' },
  quiz_master: { label: 'Quiz Master', glyph: '🧠', tone: 'violet', description: 'Won 25 quiz challenges.' },
  networking_expert: { label: 'Networking Expert', glyph: '🌐', tone: 'sky', description: 'Mastered the Networking track.' },
  '100_reels': { label: '100 Reels Watched', glyph: '🎬', tone: 'rose', description: 'Watched 100 reels through to the end.' },
  '10_uploads': { label: '10 Documents Uploaded', glyph: '📤', tone: 'emerald', description: 'Uploaded 10 documents.' },
  flashcard_champ: { label: 'Flashcard Champion', glyph: '🎴', tone: 'cyan', description: 'Reviewed 500 flashcards.' },
  perfect_quiz: { label: 'Perfect Quiz', glyph: '🎯', tone: 'amber', description: 'Got every question right in a quiz.' },
  early_adopter: { label: 'Early Adopter', glyph: '⭐', tone: 'fuchsia', description: 'Joined NeuroFeed during the beta.' },
};

export const ALL_SUBJECTS = SUBJECTS;
