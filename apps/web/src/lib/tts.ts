const BASE = (import.meta.env.VITE_API_BASE_URL as string) || 'http://localhost:8000';

const cache = new Map<string, string>(); // key → blob URL

export async function ttsUrl(text: string, voice = 'en-US-AriaNeural'): Promise<string> {
  const key = `${voice}|${text}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const res = await fetch(`${BASE}/api/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice }),
  });
  if (!res.ok) throw new Error(`tts ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  cache.set(key, url);
  return url;
}
