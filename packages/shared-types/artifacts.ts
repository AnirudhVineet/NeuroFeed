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

export type AnimationType =
  | 'zoom_in' | 'zoom_out' | 'slide_left' | 'slide_right' | 'slide_up'
  | 'fade' | 'scale_up' | 'kinetic_text' | 'type_writer' | 'highlight'
  | 'split' | 'pulse';

export type VisualKind =
  // legacy / decorative — degraded to educational fallbacks in the renderer
  | 'arrow_flow' | 'icon_grid' | 'comparison' | 'timeline' | 'diagram'
  | 'bar_chart' | 'particles' | 'concept_map' | 'gradient_pulse'
  | 'shape_morph'
  // educational visuals — each one teaches the topic
  | 'network_packets' | 'neural_network' | 'tree_traversal' | 'sorting_bars'
  | 'linked_list' | 'stack_queue' | 'equation' | 'coordinate_graph'
  | 'flowchart' | 'molecule' | 'waveform' | 'supply_demand'
  | 'map_route' | 'process_diagram';

export type MusicMood = 'uplifting' | 'curious' | 'intense' | 'dreamy' | 'playful';

// Structured drawing data the LLM may emit per reel. Every field optional —
// renderers fall back to topic-derived defaults when missing.
export interface VisualSpec {
  // network_packets
  nodes?: { id: string; label: string; x?: number; y?: number; kind?: string }[];
  edges?: { from: string; to: string; label?: string }[];
  packets?: { from: string; to: string; label?: string }[];
  // neural_network
  layers?: number[]; // neurons per layer
  layer_labels?: string[];
  // tree_traversal / linked_list / stack_queue
  values?: (string | number)[];
  traversal_order?: number[]; // indices into values
  operation?: string; // e.g. "push", "pop", "enqueue"
  // sorting_bars
  initial?: number[];
  sorted?: number[];
  algorithm?: string;
  // equation
  latex?: string;
  steps?: string[];
  // coordinate_graph
  x_label?: string;
  y_label?: string;
  curves?: { label?: string; points: [number, number][] }[];
  // flowchart / process_diagram
  steps_labels?: string[];
  // molecule
  atoms?: { el: string; x: number; y: number }[];
  bonds?: { a: number; b: number; order?: number }[];
  // waveform
  wave?: 'sine' | 'square' | 'triangle' | 'pulse';
  frequency?: number;
  // supply_demand
  equilibrium_label?: string;
  // map_route
  route?: { x: number; y: number; label?: string }[];
  // bar_chart (labeled)
  bars?: { label: string; value: number }[];
  // anything else — LLM free-form
  [k: string]: unknown;
}

// One timed visual shot inside a reel. The narration stays continuous; the
// visual cuts to the next beat when the playback ratio (elapsed / duration)
// crosses the beat's at_ratio. The LLM emits at_sec; the player normalises
// it against the actual TTS duration so beats stay synced regardless of
// voice pacing.
export interface VisualBeat {
  at_sec: number;
  visual_kind: VisualKind;
  visual_spec?: VisualSpec | null;
  animation_type?: AnimationType;
  // Optional phrase from the narration this beat illustrates. Not rendered —
  // useful for debugging and future "cue at exact word" sync.
  caption_anchor?: string | null;
}

// A reel is one self-contained micro-lesson on a single topic. Long topics
// get split into multiple reels (part_index / part_total); there is no longer
// an internal scene array.
//
// Visuals: the reel may declare a sequence of timed `visual_beats` that the
// renderer cuts between during playback. When absent, the top-level
// visual_kind / visual_spec render for the entire narration as a single beat.
export interface ReelScript {
  topic: string;
  title: string;
  narration: string;
  subtitle: string;
  highlight_words: string[];
  duration_sec: number;
  visual_kind: VisualKind;
  visual_spec?: VisualSpec | null;
  animation_type: AnimationType;
  music_mood: MusicMood;
  visual_beats?: VisualBeat[] | null;
  part_index?: number | null;
  part_total?: number | null;
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
