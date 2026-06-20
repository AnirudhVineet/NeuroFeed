// Heuristic mapping from a document title (or any free text) to one of a
// curated subject list. Pure keyword matching — no AI call — so it's safe to
// run client-side on every feed item.

export const SUBJECTS = [
  'Networking',
  'DBMS',
  'AI',
  'OS',
  'ML',
  'Physics',
  'Chemistry',
  'Mathematics',
  'Other',
] as const;

export type Subject = (typeof SUBJECTS)[number];

const KEYWORDS: Record<Exclude<Subject, 'Other'>, RegExp[]> = {
  Networking: [/\bnetwork(?:ing|s)?\b/i, /\btcp\b/i, /\budp\b/i, /\bip\b/i, /\bdns\b/i, /\bhttp\b/i, /\brouter\b/i, /\bosi\b/i, /\bpacket\b/i],
  DBMS: [/\bdbms\b/i, /\bdatabase\b/i, /\bsql\b/i, /\bnormali[sz]ation\b/i, /\btransaction\b/i, /\brelational\b/i, /\bschema\b/i, /\bjoin\b/i],
  AI: [/\bartificial intelligence\b/i, /\bAI\b/, /\bagent(?:s|ic)?\b/i, /\blogic\b/i, /\bsearch (?:algorithm|tree)\b/i, /\bknowledge representation\b/i],
  OS: [/\boperating system\b/i, /\bOS\b/, /\bscheduling\b/i, /\bprocess(?:es)?\b/i, /\bthread(?:s|ing)?\b/i, /\bsemaphore\b/i, /\bdeadlock\b/i, /\bmutex\b/i, /\bvirtual memory\b/i],
  ML: [/\bmachine learning\b/i, /\bML\b/, /\bneural\b/i, /\bregression\b/i, /\bclassif/i, /\bgradient\b/i, /\btransformer\b/i, /\bcnn\b/i, /\brnn\b/i],
  Physics: [/\bphysics\b/i, /\bmechanics\b/i, /\bthermodynamics\b/i, /\bquantum\b/i, /\bkinematics\b/i, /\belectromagnet/i, /\boptics\b/i],
  Chemistry: [/\bchemistry\b/i, /\borganic\b/i, /\binorganic\b/i, /\bmole(?:cule|cular)?\b/i, /\breaction\b/i, /\bbond(?:ing|s)?\b/i, /\boxidation\b/i],
  Mathematics: [/\bmath(?:ematic(?:s|al))?\b/i, /\balgebra\b/i, /\bcalculus\b/i, /\bgeometry\b/i, /\btopology\b/i, /\bprobability\b/i, /\bstatistic(?:s|al)\b/i, /\bnumber theory\b/i],
};

export function inferSubject(text: string | undefined | null): Subject {
  if (!text) return 'Other';
  for (const [subject, patterns] of Object.entries(KEYWORDS) as [
    Exclude<Subject, 'Other'>,
    RegExp[],
  ][]) {
    if (patterns.some((p) => p.test(text))) return subject;
  }
  return 'Other';
}
