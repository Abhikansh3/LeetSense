/**
 * Markdown report writer.
 *
 * Two outputs: a full timestamped report under reports/, and a short summary
 * block spliced into the repo README between HTML markers.
 */
import { execSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  aggregateByCategory,
  aggregateOverall,
  cohensKappa,
  lowConfidence,
  meanConfidence,
  meanRecall,
  wrongAnswers,
} from "./metrics.js";
import type { CategoryStats, EvalConfig, Grade, Report, RunResult } from "./types.js";

const START = "<!-- eval:start -->";
const END = "<!-- eval:end -->";

function gitCommit(): string {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

/** Markdown tables break on unescaped pipes and newlines in cell text. */
const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ").trim();

export function buildReport(
  config: EvalConfig,
  results: RunResult[],
  human: Map<string, Grade>,
): Report {
  const recall = meanRecall(results);

  return {
    timestamp: new Date().toISOString(),
    gitCommit: gitCommit(),
    evalSetSize: results.length,
    answerModel: config.answerModel,
    judgeModel: config.judgeModel,
    recallK: config.recallK,
    byCategory: aggregateByCategory(results),
    overall: aggregateOverall(results),
    meanRecallAtK: recall.mean,
    recallScoredCount: recall.count,
    meanConfidence: meanConfidence(results),
    lowConfidence: lowConfidence(results, config.lowConfidenceThreshold),
    wrong: wrongAnswers(results),
    kappa: cohensKappa(results, human),
    results,
  };
}

function categoryTable(rows: CategoryStats[], overall: CategoryStats): string {
  const lines = [
    "| Category | N | Correct | Partial | Wrong | Abstained | Accuracy |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];

  for (const r of rows) {
    lines.push(
      `| ${r.category} | ${r.n} | ${r.correct} | ${r.partial} | ${r.wrong} | ${r.abstained} | ${pct(r.accuracy)} |`,
    );
  }

  lines.push(
    `| **overall** | **${overall.n}** | **${overall.correct}** | **${overall.partial}** | ` +
      `**${overall.wrong}** | **${overall.abstained}** | **${pct(overall.accuracy)}** |`,
  );

  return lines.join("\n");
}

/** Detail block shared by the review and failure sections. */
function detail(r: RunResult): string {
  const retrieval = r.retrieval
    ? `\n- **Retrieval:** recall@N ${pct(r.retrieval.recallAtK)} — expected \`${r.retrieval.expected.join("`, `")}\`, ` +
      `got \`${r.retrieval.retrieved.join("`, `") || "(none mapped)"}\``
    : "";

  return [
    `#### \`${r.question.id}\` · ${r.question.category} · ${r.verdict.grade} (confidence ${r.verdict.confidence.toFixed(2)})`,
    "",
    `- **Question:** ${cell(r.question.question)}`,
    `- **Ground truth:** ${cell(r.question.ground_truth)}`,
    `- **Answer:** ${cell(r.answer)}`,
    `- **Judge's reason:** ${cell(r.verdict.reason)}${retrieval}`,
  ].join("\n");
}

export function renderReport(report: Report): string {
  const out: string[] = [];

  out.push("# RAG eval report", "");
  out.push(`- **Timestamp:** ${report.timestamp}`);
  out.push(`- **Commit:** \`${report.gitCommit}\``);
  out.push(`- **Eval set size:** ${report.evalSetSize}`);
  // The harness consumes the API, so it cannot pick the answering model — the
  // backend reads GEMINI_CHAT_MODEL from its own env. Recorded, not enforced.
  out.push(`- **Answer model:** \`${report.answerModel}\` _(declared; set by the backend, not by this harness)_`);
  out.push(`- **Judge model:** \`${report.judgeModel}\``);
  out.push("");

  out.push("## Grades by category", "");
  out.push(categoryTable(report.byCategory, report.overall), "");
  out.push(
    `**Overall:** ${report.overall.correct}/${report.overall.n} correct (${pct(report.overall.accuracy)}), ` +
      `${report.overall.partial} partial, ${report.overall.wrong} wrong.`,
    "",
  );

  out.push("## Retrieval", "");
  if (report.meanRecallAtK === null) {
    out.push(
      `No questions have \`expected_chunk_ids\`, so recall@${report.recallK} was not computed.`,
      "",
    );
  } else {
    const unmapped = report.results.reduce((s, r) => s + (r.retrieval?.unmapped ?? 0), 0);
    out.push(
      `- **Mean recall@${report.recallK}:** ${pct(report.meanRecallAtK)} over ${report.recallScoredCount} labelled question(s)`,
    );
    out.push(
      `- **Unmapped chunks:** ${unmapped} _(returned by the API but not matched to an id — stale index if non-zero)_`,
      "",
    );
  }

  out.push("## Judge", "");
  out.push(`- **Mean confidence:** ${report.meanConfidence.toFixed(2)}`);
  out.push(`- **Low-confidence grades (< 0.7):** ${report.lowConfidence.length}`);
  if (report.kappa.kappa === null) {
    out.push(
      `- **Cohen's kappa:** n/a — ${report.kappa.n === 0 ? "no human labels yet (add labels.json to enable)" : "both raters used a single grade"}`,
      "",
    );
  } else {
    out.push(
      `- **Cohen's kappa (judge vs human):** ${report.kappa.kappa.toFixed(3)} over ${report.kappa.n} hand-graded question(s), ` +
        `observed agreement ${pct(report.kappa.observedAgreement!)}`,
      "",
    );
  }

  out.push(`## Low-confidence grades — review by hand`, "");
  if (report.lowConfidence.length === 0) {
    out.push("None.", "");
  } else {
    for (const r of report.lowConfidence) out.push(detail(r), "");
  }

  out.push("## Wrong answers", "");
  if (report.wrong.length === 0) {
    out.push("None.", "");
  } else {
    for (const r of report.wrong) out.push(detail(r), "");
  }

  return out.join("\n");
}

/** Writes the timestamped report and returns its path. */
export async function writeReport(report: Report, reportsDir: string): Promise<string> {
  await mkdir(reportsDir, { recursive: true });
  const stamp = report.timestamp.replace(/[:.]/g, "-");
  const file = path.join(reportsDir, `${stamp}.md`);
  await writeFile(file, renderReport(report), "utf8");
  return file;
}

export function renderReadmeBlock(report: Report): string {
  return [
    START,
    "",
    "### RAG eval",
    "",
    categoryTable(report.byCategory, report.overall),
    "",
    report.meanRecallAtK === null
      ? `_Last run ${report.timestamp} at commit \`${report.gitCommit}\` · judge \`${report.judgeModel}\`._`
      : `_Last run ${report.timestamp} at commit \`${report.gitCommit}\` · judge \`${report.judgeModel}\` · mean recall@${report.recallK} ${pct(report.meanRecallAtK)}._`,
    "",
    END,
  ].join("\n");
}

/**
 * Splices the summary into the repo README. Appends the block (with its
 * markers) when they are absent, so the first run bootstraps itself rather
 * than failing on a README that has never been evaluated.
 */
export async function updateReadme(report: Report, readmePath: string): Promise<void> {
  const block = renderReadmeBlock(report);
  let readme: string;

  try {
    readme = await readFile(readmePath, "utf8");
  } catch {
    await writeFile(readmePath, `${block}\n`, "utf8");
    return;
  }

  const start = readme.indexOf(START);
  const end = readme.indexOf(END);

  if (start === -1 || end === -1 || end < start) {
    const trimmed = readme.replace(/\s+$/, "");
    await writeFile(readmePath, `${trimmed}\n\n${block}\n`, "utf8");
    return;
  }

  const updated = readme.slice(0, start) + block + readme.slice(end + END.length);
  await writeFile(readmePath, updated, "utf8");
}
