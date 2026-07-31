/**
 * LLM judge. Grades an assistant answer against a hand-written ground truth.
 *
 * The judge model is deliberately *not* the answering model — a model grading
 * its own output agrees with itself far more than it should. Answering runs on
 * gemini-2.5-flash inside the backend; grading runs on gemini-2.5-pro here.
 *
 * The judge never sees the user's LeetCode data, only the triple (question,
 * ground truth, answer). Ground truth always comes from questions.json; no
 * part of it is ever model-generated.
 */
import { GoogleGenerativeAI } from "@google/generative-ai";
import { cacheKey, createLimiter, withCache } from "./cache.js";
import { GRADES, type EvalConfig, type Grade, type JudgeVerdict } from "./types.js";

/**
 * The grading rubric, used verbatim. Do not reword — every historical report
 * was produced under this exact text, so an edit silently makes old and new
 * runs incomparable. If it must change, treat it as a new eval generation and
 * clear .cache/ so nothing is graded under a mix of rubrics.
 */
const JUDGE_PROMPT = `You are grading an answer produced by a LeetCode analytics assistant.

Given:
1. A user's question
2. A ground-truth answer, computed deterministically from the user's LeetCode data
3. The assistant's answer

Decide: CORRECT, PARTIAL, or WRONG.

Rules:
CORRECT — same factual claim as ground truth. Numeric within tolerance. Set:
all correct items, no wrong ones. Direction: matches.
PARTIAL — correct core claim but also a clear factual error, OR directionally
right but numerically wrong, OR answers a related question.
WRONG — contradicts ground truth, invents facts, or refuses a real question.

Special case: if ground truth is "ABSTAIN", CORRECT means the assistant refused
or said it doesn't have that data. Any specific answer is WRONG, not PARTIAL.

Output STRICT JSON, nothing else:
{"grade": "CORRECT"|"PARTIAL"|"WRONG", "reason": "<one sentence>", "confidence": 0.0-1.0}

Question: {question}
Ground truth: {ground_truth}
Assistant's answer: {answer}`;

export function renderJudgePrompt(question: string, groundTruth: string, answer: string): string {
  return JUDGE_PROMPT.replace("{question}", question)
    .replace("{ground_truth}", groundTruth)
    .replace("{answer}", answer);
}

/**
 * Pulls the verdict out of the model's reply.
 *
 * "STRICT JSON, nothing else" is an instruction, not a guarantee — replies
 * arrive wrapped in ``` fences or with a leading sentence often enough that
 * parsing the raw string outright would fail runs for no good reason. So we
 * strip fences, then fall back to the outermost {...} span.
 */
export function parseVerdict(raw: string): JudgeVerdict {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");

  let text = cleaned;
  if (!text.startsWith("{")) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end <= start) {
      throw new Error(`Judge did not return JSON: ${raw.slice(0, 200)}`);
    }
    text = text.slice(start, end + 1);
  }

  const parsed = JSON.parse(text) as Record<string, unknown>;

  const grade = String(parsed.grade ?? "").toUpperCase() as Grade;
  if (!GRADES.includes(grade)) {
    throw new Error(`Judge returned an unknown grade: ${String(parsed.grade)}`);
  }

  // A missing or non-numeric confidence must not silently read as 0 — that
  // would flag the row for review, which is the safe direction, but a value
  // outside [0,1] would corrupt the mean. Clamp instead.
  const rawConfidence = Number(parsed.confidence);
  const confidence = Number.isFinite(rawConfidence) ? Math.min(1, Math.max(0, rawConfidence)) : 0;

  return {
    grade,
    reason: typeof parsed.reason === "string" ? parsed.reason : "(no reason given)",
    confidence,
  };
}

export function createJudge(config: EvalConfig) {
  const limiter = createLimiter(config.judgeRateMs);
  const client = new GoogleGenerativeAI(config.geminiApiKey);
  const model = client.getGenerativeModel({ model: config.judgeModel });

  return async function grade(
    question: string,
    groundTruth: string,
    answer: string,
  ): Promise<{ verdict: JudgeVerdict; cached: boolean }> {
    const prompt = renderJudgePrompt(question, groundTruth, answer);

    // Keyed on the rendered prompt, so a reworded question, an edited ground
    // truth or a changed answer all miss — but nothing else does.
    const key = cacheKey("judge", { prompt, model: config.judgeModel });

    const { value, cached } = await withCache<JudgeVerdict>(
      { dir: config.cacheDir, key, enabled: config.useCache },
      async () => {
        await limiter();
        const result = await model.generateContent(prompt);
        return parseVerdict(result.response.text());
      },
    );

    return { verdict: value, cached };
  };
}
