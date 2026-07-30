/**
 * Shared types for the RAG eval harness.
 *
 * The contract these describe is the *live* one, confirmed against
 * apps/backend before this package was written — it differs from the one in
 * the original spec in two ways worth remembering:
 *
 *   - POST /api/chat responds with `{ answer, sources }`, not `{ answer,
 *     context }`, and `sources` holds the retrieved chunks' raw *text*, never
 *     their ids (apps/backend/src/services/rag/vectorstore.ts drops ids,
 *     distances and metadata before returning).
 *   - Retrieval is hardcoded to the top 6 chunks, so recall@5 is measured over
 *     the first 5 of those, in the relevance order Chroma returned them.
 */

export const CATEGORIES = [
  "factual",
  "aggregation",
  "comparative",
  "temporal",
  "abstention",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const TOLERANCES = ["exact", "±2", "±5%", "direction", "set-match", "abstain"] as const;
export type Tolerance = (typeof TOLERANCES)[number];

export const GRADES = ["CORRECT", "PARTIAL", "WRONG"] as const;
export type Grade = (typeof GRADES)[number];

/** One hand-authored eval case, read verbatim from questions.json. */
export interface Question {
  id: string;
  category: Category;
  question: string;
  /** Deterministic answer, or the literal "ABSTAIN". Never LLM-generated. */
  ground_truth: string;
  tolerance: Tolerance;
  /**
   * Logical chunk ids the retriever *should* surface, with the `<userId>:`
   * prefix omitted — e.g. "profile", "topic:dynamic-programming". null opts
   * the question out of retrieval scoring.
   */
  expected_chunk_ids: string[] | null;
  notes?: string;
}

/** What POST /api/chat actually returns. */
export interface ChatResponse {
  answer: string;
  sources: string[];
}

/** The judge's verdict, parsed from its strict-JSON reply. */
export interface JudgeVerdict {
  grade: Grade;
  reason: string;
  confidence: number;
}

/** Retrieval scoring for a single question. */
export interface RetrievalResult {
  expected: string[];
  /** Logical ids recovered from the returned chunk text, in rank order. */
  retrieved: string[];
  /** |expected ∩ retrieved[0..k]| / |expected| */
  recallAtK: number;
  /** Chunks the API returned that we could not map back to an id. */
  unmapped: number;
}

/** Everything known about one question after a run. */
export interface RunResult {
  question: Question;
  answer: string;
  sources: string[];
  verdict: JudgeVerdict;
  retrieval: RetrievalResult | null;
  /** True when both the RAG call and the judge call were served from disk. */
  cached: boolean;
  latencyMs: number;
}

export interface CategoryStats {
  category: Category;
  n: number;
  correct: number;
  partial: number;
  wrong: number;
  /** Cases whose ground truth was "ABSTAIN", regardless of how they graded. */
  abstained: number;
  /** correct / n */
  accuracy: number;
}

/**
 * Judge-vs-human agreement. Only populated for questions present in
 * labels.json; `null` until you have hand-graded at least one.
 */
export interface KappaResult {
  kappa: number | null;
  n: number;
  observedAgreement: number | null;
  expectedAgreement: number | null;
}

export interface Report {
  timestamp: string;
  gitCommit: string;
  evalSetSize: number;
  answerModel: string;
  judgeModel: string;
  recallK: number;
  byCategory: CategoryStats[];
  overall: CategoryStats;
  meanRecallAtK: number | null;
  recallScoredCount: number;
  meanConfidence: number;
  lowConfidence: RunResult[];
  wrong: RunResult[];
  kappa: KappaResult;
  results: RunResult[];
}

export interface EvalConfig {
  apiUrl: string;
  email: string;
  password: string;
  geminiApiKey: string;
  answerModel: string;
  judgeModel: string;
  ragRateMs: number;
  judgeRateMs: number;
  recallK: number;
  lowConfidenceThreshold: number;
  useCache: boolean;
  cacheDir: string;
}
