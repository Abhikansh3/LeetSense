/**
 * CLI entry point.
 *
 *   pnpm eval run [--dry-run] [--no-cache] [--category <name>]
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { loadHumanLabels } from "./metrics.js";
import { buildReport, updateReadme, writeReport } from "./report.js";
import { runAll } from "./runner.js";
import { CATEGORIES, TOLERANCES, type Category, type EvalConfig, type Question } from "./types.js";

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = path.resolve(PACKAGE_ROOT, "..", "..");

dotenv.config({ path: path.join(REPO_ROOT, ".env") });

interface Flags {
  command: string;
  dryRun: boolean;
  noCache: boolean;
  category: Category | null;
}

function parseArgs(argv: string[]): Flags {
  const flags: Flags = { command: argv[0] ?? "run", dryRun: false, noCache: false, category: null };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") flags.dryRun = true;
    else if (arg === "--no-cache") flags.noCache = true;
    else if (arg === "--category") {
      const value = argv[i + 1];
      if (!value || !CATEGORIES.includes(value as Category)) {
        throw new Error(`--category expects one of: ${CATEGORIES.join(", ")}`);
      }
      flags.category = value as Category;
      i += 1;
    }
  }

  return flags;
}

function env(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) throw new Error(`Missing required env var ${name}`);
  return value;
}

/**
 * Validates questions.json by hand rather than pulling in a schema library —
 * the shape is small, and a typo'd category silently bucketing into nothing is
 * exactly the kind of failure that wastes a paid run.
 */
function validateQuestions(raw: unknown): Question[] {
  if (!Array.isArray(raw)) throw new Error("questions.json must contain a JSON array");

  const seen = new Set<string>();

  return raw.map((entry, i) => {
    const q = entry as Partial<Question>;
    const at = `questions.json[${i}]`;

    if (!q.id) throw new Error(`${at}: missing "id"`);
    if (seen.has(q.id)) throw new Error(`${at}: duplicate id "${q.id}"`);
    seen.add(q.id);

    if (!q.category || !CATEGORIES.includes(q.category)) {
      throw new Error(`${at} (${q.id}): category must be one of ${CATEGORIES.join(", ")}`);
    }
    if (!q.question?.trim()) throw new Error(`${at} (${q.id}): missing "question"`);
    if (typeof q.ground_truth !== "string" || !q.ground_truth.trim()) {
      throw new Error(`${at} (${q.id}): missing "ground_truth"`);
    }
    if (!q.tolerance || !TOLERANCES.includes(q.tolerance)) {
      throw new Error(`${at} (${q.id}): tolerance must be one of ${TOLERANCES.join(", ")}`);
    }
    if (q.expected_chunk_ids !== null && !Array.isArray(q.expected_chunk_ids)) {
      throw new Error(`${at} (${q.id}): expected_chunk_ids must be an array or null`);
    }

    // An abstention case whose ground truth is not the ABSTAIN sentinel would
    // be graded under the ordinary rules, quietly measuring the wrong thing.
    if (q.category === "abstention" && q.ground_truth !== "ABSTAIN") {
      throw new Error(`${at} (${q.id}): category "abstention" requires ground_truth "ABSTAIN"`);
    }

    return q as Question;
  });
}

async function loadQuestions(file: string, category: Category | null): Promise<Question[]> {
  const questions = validateQuestions(JSON.parse(await readFile(file, "utf8")));
  return category ? questions.filter((q) => q.category === category) : questions;
}

function printDryRun(questions: Question[], config: EvalConfig): void {
  console.log("Dry run — no API calls will be made.\n");
  console.log(`Questions:      ${questions.length}`);

  for (const c of CATEGORIES) {
    const n = questions.filter((q) => q.category === c).length;
    if (n > 0) console.log(`  ${c.padEnd(14)}${n}`);
  }

  const labelled = questions.filter((q) => q.expected_chunk_ids?.length).length;
  console.log(`\nRetrieval-scored: ${labelled} question(s) with expected_chunk_ids`);
  console.log(`API:              ${config.apiUrl}`);
  console.log(`Answer model:     ${config.answerModel} (declared; set by the backend)`);
  console.log(`Judge model:      ${config.judgeModel}`);
  console.log(`Cache:            ${config.useCache ? config.cacheDir : "disabled (--no-cache)"}`);
  console.log(`Rate limits:      RAG 1/${config.ragRateMs}ms, judge 1/${config.judgeRateMs}ms`);

  const estimate = questions.length * (config.ragRateMs + config.judgeRateMs);
  console.log(`\nEstimated cold-run floor: ~${Math.ceil(estimate / 1000)}s (rate limits alone)`);
}

async function main(): Promise<void> {
  const flags = parseArgs(process.argv.slice(2));

  if (flags.command !== "run") {
    console.error(`Unknown command "${flags.command}". Usage: pnpm eval run [--dry-run] [--no-cache] [--category <name>]`);
    process.exit(1);
  }

  const questionsFile = path.join(PACKAGE_ROOT, "questions.json");
  const questions = await loadQuestions(questionsFile, flags.category);

  if (questions.length === 0) {
    console.error(flags.category ? `No questions in category "${flags.category}".` : "questions.json is empty.");
    process.exit(1);
  }

  // A dry run must work with nothing configured, so required-secret lookups
  // fall back to "" here and are only enforced on the live path below.
  const config: EvalConfig = {
    apiUrl: env("EVAL_API_URL", "http://localhost:3000").replace(/\/$/, ""),
    email: env("EVAL_USER_EMAIL", ""),
    password: env("EVAL_USER_PASSWORD", ""),
    geminiApiKey: env("GEMINI_API_KEY", ""),
    answerModel: env("EVAL_ANSWER_MODEL", "gemini-2.5-flash"),
    judgeModel: env("EVAL_JUDGE_MODEL", "gemini-2.5-pro"),
    ragRateMs: Number(env("EVAL_RAG_RATE_MS", "1000")),
    judgeRateMs: Number(env("EVAL_JUDGE_RATE_MS", "2000")),
    recallK: Number(env("EVAL_RECALL_K", "5")),
    lowConfidenceThreshold: Number(env("EVAL_LOW_CONFIDENCE", "0.7")),
    useCache: !flags.noCache,
    cacheDir: path.join(PACKAGE_ROOT, ".cache"),
  };

  if (flags.dryRun) {
    printDryRun(questions, config);
    return;
  }

  for (const [name, value] of [
    ["EVAL_USER_EMAIL", config.email],
    ["EVAL_USER_PASSWORD", config.password],
    ["GEMINI_API_KEY", config.geminiApiKey],
  ] as const) {
    if (!value) throw new Error(`Missing required env var ${name} (needed for a live run; --dry-run does not)`);
  }

  console.log(`Running ${questions.length} question(s) against ${config.apiUrl}\n`);

  const results = await runAll(config, questions, (r, i, total) => {
    const review = r.verdict.confidence < config.lowConfidenceThreshold ? "  ← REVIEW" : "";
    const from = r.cached ? "cached" : `${r.latencyMs}ms`;
    console.log(
      `[${String(i + 1).padStart(3)}/${total}] ${r.question.id.padEnd(6)} ` +
        `${r.verdict.grade.padEnd(7)} conf ${r.verdict.confidence.toFixed(2)}  (${from})${review}`,
    );
    if (review) {
      console.log(`          Q: ${r.question.question}`);
      console.log(`          judge: ${r.verdict.reason}`);
    }
  });

  const human = await loadHumanLabels(path.join(PACKAGE_ROOT, "labels.json"));
  const report = buildReport(config, results, human);

  const reportPath = await writeReport(report, path.join(PACKAGE_ROOT, "reports"));
  await updateReadme(report, path.join(REPO_ROOT, "README.md"));

  console.log(
    `\n${report.overall.correct}/${report.overall.n} correct ` +
      `(${(report.overall.accuracy * 100).toFixed(1)}%), ` +
      `${report.overall.partial} partial, ${report.overall.wrong} wrong`,
  );
  if (report.lowConfidence.length > 0) {
    console.log(`${report.lowConfidence.length} grade(s) marked REVIEW — hand-check them in the report.`);
  }
  console.log(`\nReport:  ${path.relative(REPO_ROOT, reportPath)}`);
  console.log(`README:  updated eval:start/eval:end block`);
}

main().catch((err: unknown) => {
  console.error(`\neval failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
