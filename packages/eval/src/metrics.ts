/**
 * Aggregation over a completed run: per-category accuracy, retrieval recall,
 * judge confidence, and judge-vs-human agreement.
 */
import { readFile } from "node:fs/promises";
import {
  CATEGORIES,
  GRADES,
  type Category,
  type CategoryStats,
  type Grade,
  type KappaResult,
  type RunResult,
} from "./types.js";

function tally(category: Category | "overall", rows: RunResult[]): CategoryStats {
  const correct = rows.filter((r) => r.verdict.grade === "CORRECT").length;
  const partial = rows.filter((r) => r.verdict.grade === "PARTIAL").length;
  const wrong = rows.filter((r) => r.verdict.grade === "WRONG").length;

  // "Abstained" counts cases the eval set *expects* to be refused, which is a
  // property of the question, not of how it graded. Reading it off the grade
  // instead would make a failed abstention look like it never existed.
  const abstained = rows.filter((r) => r.question.ground_truth === "ABSTAIN").length;

  return {
    category: category as Category,
    n: rows.length,
    correct,
    partial,
    wrong,
    abstained,
    accuracy: rows.length === 0 ? 0 : correct / rows.length,
  };
}

/** Per-category stats, in the fixed CATEGORIES order, skipping empty ones. */
export function aggregateByCategory(results: RunResult[]): CategoryStats[] {
  return CATEGORIES.map((c) =>
    tally(
      c,
      results.filter((r) => r.question.category === c),
    ),
  ).filter((s) => s.n > 0);
}

export function aggregateOverall(results: RunResult[]): CategoryStats {
  return tally("overall", results);
}

/** Mean recall@k across the questions that opted into retrieval scoring. */
export function meanRecall(results: RunResult[]): { mean: number | null; count: number } {
  const scored = results.filter((r) => r.retrieval !== null);
  if (scored.length === 0) return { mean: null, count: 0 };

  const total = scored.reduce((sum, r) => sum + r.retrieval!.recallAtK, 0);
  return { mean: total / scored.length, count: scored.length };
}

export function meanConfidence(results: RunResult[]): number {
  if (results.length === 0) return 0;
  return results.reduce((sum, r) => sum + r.verdict.confidence, 0) / results.length;
}

export function lowConfidence(results: RunResult[], threshold: number): RunResult[] {
  return results
    .filter((r) => r.verdict.confidence < threshold)
    .sort((a, b) => a.verdict.confidence - b.verdict.confidence);
}

export function wrongAnswers(results: RunResult[]): RunResult[] {
  return results.filter((r) => r.verdict.grade === "WRONG");
}

/**
 * Optional hand-grades, read from packages/eval/labels.json as
 * `{ "q001": "CORRECT", "q002": "WRONG" }`.
 *
 * This is what makes kappa meaningful. Cohen's kappa measures agreement
 * between two *raters*, and a run only has one — so until some questions are
 * hand-graded there is no second rater and the statistic is undefined, not
 * zero. Grading a sample of ~20 by hand is enough to tell whether the judge
 * can be trusted on the rest.
 */
export async function loadHumanLabels(file: string): Promise<Map<string, Grade>> {
  try {
    const raw = await readFile(file, "utf8");
    const parsed = JSON.parse(raw) as Record<string, string>;
    const labels = new Map<string, Grade>();

    for (const [id, grade] of Object.entries(parsed)) {
      const upper = grade.toUpperCase() as Grade;
      if (GRADES.includes(upper)) labels.set(id, upper);
    }
    return labels;
  } catch {
    // No labels file is the normal state, not an error.
    return new Map();
  }
}

/**
 * Cohen's kappa between the judge and the human labels, over the questions
 * that have both. Returns kappa: null when there is nothing to compare.
 */
export function cohensKappa(results: RunResult[], human: Map<string, Grade>): KappaResult {
  const pairs: Array<[Grade, Grade]> = [];
  for (const r of results) {
    const h = human.get(r.question.id);
    if (h) pairs.push([r.verdict.grade, h]);
  }

  const n = pairs.length;
  if (n === 0) return { kappa: null, n: 0, observedAgreement: null, expectedAgreement: null };

  const observed = pairs.filter(([a, b]) => a === b).length / n;

  // Chance agreement: how often the two raters would coincide given only their
  // marginal rates for each grade.
  let expected = 0;
  for (const g of GRADES) {
    const pJudge = pairs.filter(([a]) => a === g).length / n;
    const pHuman = pairs.filter(([, b]) => b === g).length / n;
    expected += pJudge * pHuman;
  }

  // Perfect chance agreement (both raters used one grade throughout) leaves
  // kappa undefined — 0/0. Report the agreement instead of dividing by zero.
  const kappa = expected === 1 ? null : (observed - expected) / (1 - expected);

  return { kappa, n, observedAgreement: observed, expectedAgreement: expected };
}
