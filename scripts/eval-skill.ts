#!/usr/bin/env -S node --import tsx
/**
 * Skill evaluation harness — dev stack only.
 *
 * Runs a skill's eval cases twice: `with` the skill in scope and `without` it.
 * The `without` arm is the control. A skill that only "passes" because the
 * model already behaved correctly teaches nothing, so the baseline arm is what
 * makes a case worth keeping (see superpowers:writing-skills, RED before GREEN).
 *
 * Case layout, mirroring `claude plugin eval` so these cases can migrate there
 * once it accepts an MCP config override:
 *
 *   evals/<skill>/<case>/prompt.md         frontmatter + the user's prompt
 *   evals/<skill>/<case>/graders/*.md      one grader per constraint
 *
 * Usage (never against production — the MCP config is written to a temp dir
 * and points at whatever TRIBEUNAL_API_BASE_URL says, which must be the dev
 * stack):
 *
 *   TRIBEUNAL_API_KEY=<eval identity> TRIBEUNAL_ADMIN_API_KEY=<admin> \
 *   TRIBEUNAL_API_BASE_URL=https://tribeunal.test/api TRIBEUNAL_VERIFY_SSL=false \
 *   npx tsx scripts/eval-skill.ts --skill using-tribeunal --arm both --json out.json
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildFixtures, restoreFixtureState } from '../evals/fixtures.js';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EVALS = join(REPO, 'evals');

// --- tiny frontmatter reader -------------------------------------------------
// Deliberately not a YAML dependency: these files use `key: value`, inline
// arrays and quoted scalars, and nothing else.

type Front = Record<string, string | number | boolean | string[]>;

function parseScalar(raw: string): string | number | boolean | string[] {
  const v = raw.trim();
  if (v.startsWith('[') && v.endsWith(']')) {
    return v
      .slice(1, -1)
      .split(',')
      .map((s) => s.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);
  }
  if (/^["'].*["']$/s.test(v)) return v.slice(1, -1);
  if (/^-?\d+$/.test(v)) return Number(v);
  if (v === 'true') return true;
  if (v === 'false') return false;
  return v;
}

function readFrontmatter(path: string): { front: Front; body: string } {
  const text = readFileSync(path, 'utf8');
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
  if (!m) return { front: {}, body: text.trim() };
  const front: Front = {};
  for (const line of m[1].split('\n')) {
    const kv = /^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/.exec(line);
    if (kv) front[kv[1]] = parseScalar(kv[2]);
  }
  return { front, body: m[2].trim() };
}

// --- transcript model --------------------------------------------------------

interface ToolCall { name: string; input: unknown; id?: string; result?: string; failed?: boolean; }
interface Transcript {
  toolCalls: ToolCall[];
  finalText: string;
  createdCaseUuid?: string;
  raw: string;
}

/** `mcp__tribeunal__tribeunal_get_case` also answers to `get_case`. */
function toolAliases(name: string): string[] {
  const out = new Set<string>([name]);
  const stripped = name.replace(/^mcp__[^_]+__/, '').replace(/^mcp__.*?__/, '');
  out.add(stripped);
  out.add(stripped.replace(/^tribeunal_/, ''));
  return [...out];
}

function toolMatches(call: ToolCall, wanted: string): boolean {
  return toolAliases(call.name).includes(wanted);
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function parseStreamJson(raw: string): Transcript {
  const toolCalls: ToolCall[] = [];
  let finalText = '';
  let createdCaseUuid: string | undefined;
  let sawCreateCase = false;

  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('{')) continue;
    let ev: any;
    try { ev = JSON.parse(t); } catch { continue; }

    if (ev.type === 'assistant' && ev.message?.content) {
      for (const block of ev.message.content) {
        if (block.type === 'tool_use') {
          toolCalls.push({ name: block.name, input: block.input, id: block.id });
          if (toolAliases(block.name).includes('create_case')) sawCreateCase = true;
        }
      }
    }
    // Tool results arrive as a user-role message; the create_case payload is
    // where E2E picks up the uuid of the case the agent actually made.
    if (ev.type === 'user' && ev.message?.content) {
      for (const block of ev.message.content) {
        if (block.type !== 'tool_result') continue;
        const text = typeof block.content === 'string'
          ? block.content
          : (block.content ?? []).map((c: any) => c?.text ?? '').join('\n');
        // Pair the result back onto its call. A judge that sees only inputs
        // cannot check "did it mark the comment it wrote itself" — the id it
        // needs is in the RESULT of post_comment, and asking it to grade
        // without that produced a verdict that flipped between runs.
        const call = toolCalls.find((c) => c.id === block.tool_use_id);
        if (call) {
          call.result = text;
          call.failed = block.is_error === true;
        }
        // Only a SUCCESSFUL create_case result yields the case uuid. Reading the
        // first uuid from any later result once create_case had been attempted
        // reported an unrelated case when the create failed and the agent
        // searched instead.
        const fromCreate = call !== undefined && toolAliases(call.name).includes('create_case');
        if (sawCreateCase && !createdCaseUuid && fromCreate && block.is_error !== true) {
          const hit = UUID_RE.exec(text);
          if (hit) createdCaseUuid = hit[0];
        }
      }
    }
    if (ev.type === 'result' && typeof ev.result === 'string') finalText = ev.result;
  }
  return { toolCalls, finalText, createdCaseUuid, raw };
}

// --- graders -----------------------------------------------------------------

interface GraderResult { name: string; passed: boolean; detail: string; }

function names(value: unknown): string[] {
  return String(value ?? '').split('|').map((s) => s.trim()).filter(Boolean);
}

function firstIndex(calls: ToolCall[], wanted: string[]): number {
  return calls.findIndex((c) => wanted.some((w) => toolMatches(c, w)));
}

async function runGrader(
  file: string,
  transcript: Transcript,
): Promise<GraderResult> {
  const { front, body } = readFrontmatter(file);
  const name = file.split('/').slice(-1)[0].replace(/\.md$/, '');
  const type = String(front.type ?? 'regex');

  if (type === 'regex') {
    const pattern = String(front.pattern ?? '');
    const mode = String(front.match ?? 'contains');
    const re = new RegExp(pattern, 'i');
    const hits = (transcript.finalText.match(new RegExp(pattern, 'gi')) ?? []).length;
    if (mode === 'contains') {
      return { name, passed: re.test(transcript.finalText), detail: `/${pattern}/ hits=${hits}` };
    }
    if (mode === 'not_contains') {
      return { name, passed: !re.test(transcript.finalText), detail: `/${pattern}/ hits=${hits}` };
    }
    const want = Number(mode.split(':')[1] ?? 1);
    return { name, passed: hits === want, detail: `/${pattern}/ hits=${hits} want=${want}` };
  }

  if (type === 'tool_used') {
    const wanted = names(front.tool);
    let calls = transcript.toolCalls.filter((c) => wanted.some((w) => toolMatches(c, w)));
    if (front.input_match) {
      const re = new RegExp(String(front.input_match), 'i');
      calls = calls.filter((c) => re.test(JSON.stringify(c.input ?? {})));
    }
    const min = front.min === undefined ? (front.max === undefined ? 1 : 0) : Number(front.min);
    const max = front.max === undefined ? Number.POSITIVE_INFINITY : Number(front.max);
    // A floor asks "did it do this", which a refused call did not; a ceiling
    // asks "did it stop", which counts attempts. Filtering failures out of both
    // would let an agent retry a refusal forever under a `max`.
    const n = min > 0 ? calls.filter((c) => !c.failed).length : calls.length;
    return {
      name,
      passed: n >= min && n <= max,
      detail: `${wanted.join('|')}${front.input_match ? ` input~/${front.input_match}/` : ''} n=${n} want ${min}..${max === Infinity ? '∞' : max}`,
    };
  }

  if (type === 'tool_order') {
    const before = names(front.before);
    const after = names(front.after);
    const i = firstIndex(transcript.toolCalls, before);
    const j = firstIndex(transcript.toolCalls, after);
    const passed = i !== -1 && j !== -1 && i < j;
    return { name, passed, detail: `${before.join('|')}@${i} before ${after.join('|')}@${j}` };
  }

  if (type === 'tool_implies') {
    const cond = names(front.if);
    const then = names(front.then);
    const fired = firstIndex(transcript.toolCalls, cond) !== -1;
    const followed = firstIndex(transcript.toolCalls, then) !== -1;
    return {
      name,
      passed: !fired || followed,
      detail: fired ? `${cond.join('|')} fired, ${then.join('|')} ${followed ? 'present' : 'MISSING'}` : 'precondition not met (vacuous pass)',
    };
  }

  if (type === 'llm') {
    const criteria = String(front.criteria ?? body);
    const verdict = await judge(criteria, transcript);
    return { name, passed: verdict.pass, detail: verdict.reason };
  }

  return { name, passed: false, detail: `unknown grader type "${type}"` };
}

/** Second opinion from a cheap model, forced to answer PASS/FAIL first. */
async function judge(criteria: string, transcript: Transcript): Promise<{ pass: boolean; reason: string }> {
  const toolList = transcript.toolCalls
    .map((c) => {
      const input = JSON.stringify(c.input ?? {}).slice(0, 300);
      const out = c.result ? `\n    -> ${c.result.replace(/\s+/g, ' ').slice(0, 300)}` : '';
      return `- ${c.name} ${input}${out}`;
    })
    .join('\n');
  const prompt = [
    'You are grading one transcript from an agent that used the Tribeunal tools.',
    'Answer with PASS or FAIL on the first line, then one sentence of reason.',
    'Judge ONLY the stated criterion. Absence of evidence is a FAIL.',
    '',
    `CRITERION: ${criteria}`,
    '',
    'TOOL CALLS:',
    toolList || '(none)',
    '',
    'FINAL ANSWER:',
    transcript.finalText.slice(0, 6000),
  ].join('\n');

  const out = await run('claude', ['-p', prompt, '--model', 'haiku', '--max-turns', '1', '--output-format', 'text'], REPO, 180_000);
  const text = out.stdout.trim();

  // A judge that could not run is NOT a judge that said no. Scoring a failed
  // call as FAIL once turned a usage-limit message into a grader verdict —
  // "You've hit your session limit" was recorded as the reason a skill failed.
  // Throwing surfaces it as the infrastructure problem it is.
  // Judges answer "**PASS**" as often as "PASS": the verdict is frequently
  // wrapped in markdown emphasis, and a pattern that ignores that rejects a
  // perfectly good verdict as "no verdict returned".
  const verdict = /^\s*[*_#>`\s]*(PASS|FAIL)\b/i.exec(text);
  if (out.code !== 0 || !verdict) {
    throw new Error(
      `llm judge did not return a verdict (exit ${out.code}): ${(text || out.stderr).slice(0, 200).replace(/\s+/g, ' ')}`,
    );
  }
  return { pass: verdict[1].toUpperCase() === 'PASS', reason: text.slice(0, 300).replace(/\s+/g, ' ') };
}

// --- process helper ----------------------------------------------------------

function run(cmd: string, args: string[], cwd: string, timeoutMs: number, env: NodeJS.ProcessEnv = process.env): Promise<{ code: number; stdout: string; stderr: string; timedOut: boolean }> {
  return new Promise((res) => {
    const child = spawn(cmd, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs);
    // Without this, a missing `claude` binary emits an unhandled 'error', the
    // promise never settles, and the fixture restore in `finally` never runs —
    // leaving the eval identity mutated for every later case.
    child.on('error', (err) => {
      clearTimeout(timer);
      res({ code: -1, stdout, stderr: `${stderr}\nspawn failed: ${(err as Error).message}`, timedOut });
    });
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (code) => { clearTimeout(timer); res({ code: code ?? -1, stdout, stderr, timedOut }); });
  });
}

// --- arm execution -----------------------------------------------------------

/** Skills the skill under test points at, so a cross-reference can be followed. */
function crossReferenced(skill: string): string[] {
  const skillFile = join(REPO, 'skills', skill, 'SKILL.md');
  if (!existsSync(skillFile)) return [];
  const body = readFileSync(skillFile, 'utf8');
  return readdirSync(join(REPO, 'skills'), { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== skill)
    .map((d) => d.name)
    .filter((other) => body.includes(other));
}

function scaffold(skill: string, arm: 'with' | 'without'): string {
  const dir = mkdtempSync(join(tmpdir(), `skilleval-${skill}-${arm}-`));
  if (arm === 'with') {
    const skillsDir = join(dir, '.claude', 'skills');
    mkdirSync(skillsDir, { recursive: true });
    for (const name of [skill, ...crossReferenced(skill)]) {
      const src = join(REPO, 'skills', name);
      if (existsSync(src)) symlinkSync(src, join(skillsDir, name));
    }
  }
  // `--setting-sources project` reads this and nothing user-level.
  mkdirSync(join(dir, '.claude'), { recursive: true });
  writeFileSync(join(dir, '.claude', 'settings.json'), JSON.stringify({}, null, 2));
  writeFileSync(
    join(dir, 'tribeunal-dev.json'),
    JSON.stringify({
      mcpServers: {
        tribeunal: {
          command: 'npx',
          args: ['tsx', join(REPO, 'src', 'index.ts')],
          env: {
            TRIBEUNAL_API_BASE_URL: process.env.TRIBEUNAL_API_BASE_URL ?? 'https://tribeunal.test/api',
            TRIBEUNAL_API_KEY: process.env.TRIBEUNAL_API_KEY ?? '',
            TRIBEUNAL_VERIFY_SSL: process.env.TRIBEUNAL_VERIFY_SSL ?? 'false',
          },
        },
      },
    }, null, 2),
  );
  return dir;
}

interface ArmResult {
  graders: GraderResult[];
  /** How many reps ran, and how many of them had at least one failing grader. */
  reps?: number;
  failedReps?: number;
  toolCalls: string[];
  finalText: string;
  created_case_uuid?: string;
  exitCode: number;
}

/** A 529 is weather, not a verdict: back off and try the arm again. */
async function runArmWithRetries(
  skill: string,
  caseName: string,
  prompt: string,
  maxTurns: number,
  timeoutS: number,
  arm: 'with' | 'without',
  keepTemp: boolean,
  attempts = 3,
): Promise<ArmResult> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await runArm(skill, caseName, prompt, maxTurns, timeoutS, arm, keepTemp);
    } catch (e) {
      const transient = (e as { transient?: boolean }).transient === true;
      if (!transient || attempt >= attempts) throw e;
      const backoffMs = 15_000 * attempt;
      console.error(`  ${skill}/${caseName} (${arm}) refused service, retrying in ${backoffMs / 1000}s`);
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }
}

async function runArm(
  skill: string,
  caseName: string,
  prompt: string,
  maxTurns: number,
  timeoutS: number,
  arm: 'with' | 'without',
  keepTemp: boolean,
): Promise<ArmResult> {
  const dir = scaffold(skill, arm);
  try {
    const args = [
      '-p', prompt,
      '--output-format', 'stream-json',
      '--verbose',
      '--max-turns', String(maxTurns),
      '--mcp-config', join(dir, 'tribeunal-dev.json'),
      '--strict-mcp-config',
      '--setting-sources', 'project',
      '--allowedTools', 'mcp__tribeunal__*', 'Bash(node:*)', 'Read', 'Skill',
    ];
    const { code, stdout, stderr, timedOut } = await run('claude', args, dir, timeoutS * 1000);
    if (/unknown option/i.test(stderr)) {
      throw new Error(`claude rejected a flag — harness is out of date:\n${stderr.slice(0, 400)}`);
    }
    const transcript = parseStreamJson(stdout);

    // An arm that never got to run is not an arm that failed. A 529 from the
    // API once produced "Bash n=0" and "absence of evidence is a FAIL" for a
    // case that had simply been refused service. Only treat it as a transcript
    // when the agent actually did or said something.
    // A killed run is a partial transcript: the agent may simply not have
    // reached the tool the grader is watching for. Scoring it produces a
    // "skill regression" that is really a budget problem — `acting-on-verdicts`
    // can spend 170s in a single await call.
    if (timedOut) {
      const err = new Error(
        `claude hit the ${timeoutS}s budget for ${skill}/${caseName} (${arm}) — partial transcript, not scored`,
      );
      (err as { transient?: boolean }).transient = true;
      throw err;
    }

    const refusedService = /\b(529|overloaded|rate.?limit|usage limit|session limit|api error)\b/i
      .test(transcript.finalText);
    if (transcript.toolCalls.length === 0 && (transcript.finalText.trim() === '' || refusedService)) {
      const err = new Error(
        `claude produced no usable transcript for ${skill}/${caseName} (${arm}), exit ${code}: `
        + `${(transcript.finalText || stderr || stdout).slice(-300).replace(/\s+/g, ' ')}`,
      );
      (err as { transient?: boolean }).transient = true;
      throw err;
    }
    const graderDir = join(EVALS, skill, caseName, 'graders');
    const graderFiles = existsSync(graderDir)
      ? readdirSync(graderDir).filter((f) => f.endsWith('.md')).sort().map((f) => join(graderDir, f))
      : [];
    const graders: GraderResult[] = [];
    for (const g of graderFiles) graders.push(await runGrader(g, transcript));
    return {
      graders,
      toolCalls: transcript.toolCalls.map((c) => c.name),
      finalText: transcript.finalText,
      created_case_uuid: transcript.createdCaseUuid,
      exitCode: code,
    };
  } finally {
    if (!keepTemp) rmSync(dir, { recursive: true, force: true });
  }
}

// --- driver ------------------------------------------------------------------

function parseArgs(argv: string[]) {
  const out: Record<string, string | string[]> = {};
  const fixtures: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    if (key === 'keep-temp') { out[key] = 'true'; continue; }
    const value = argv[++i] ?? '';
    if (key === 'fixture') {
      const [k, v] = value.split('=');
      fixtures[k] = v;
      continue;
    }
    out[key] = value;
  }
  return { opts: out, fixtureOverrides: fixtures };
}

async function pool<T>(items: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await items[i]();
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * A killed run must still hand back the rows it borrowed.
 *
 * `restoreFixtureState()` normally runs after the case pool, but a SIGTERM or
 * SIGINT skips straight past that — which happened once and left the eval
 * identity pinned at an exhausted free-vote budget, quietly poisoning every
 * later voting case. Signals now drain the same restore queue before exiting.
 */
function installRestoreOnSignals(): void {
  let restoring = false;
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    process.on(signal, () => {
      if (restoring) return;
      restoring = true;
      console.error(`\n${signal} — restoring mutated fixture state before exit`);
      restoreFixtureState()
        .catch((e) => console.error('restore failed:', e))
        .finally(() => process.exit(130));
    });
  }
}

async function main(): Promise<void> {
  installRestoreOnSignals();
  const { opts, fixtureOverrides } = parseArgs(process.argv.slice(2));
  const skill = String(opts.skill ?? '');
  if (!skill) { console.error('Usage: eval-skill.ts --skill <name> [--case <glob>] [--arm with|without|both]'); process.exit(2); }

  const arm = String(opts.arm ?? 'both');
  const runs = Number(opts.runs ?? 1);
  if (!Number.isInteger(runs) || runs < 1) {
    console.error(`--runs must be a positive integer, got ${JSON.stringify(opts.runs)}`);
    process.exit(2);
  }
  const concurrency = Number(opts.concurrency ?? 3);
  const keepTemp = opts['keep-temp'] === 'true';
  const caseGlob = String(opts.case ?? '*');

  const skillDir = join(EVALS, skill);
  if (!existsSync(skillDir)) { console.error(`no eval cases at evals/${skill}`); process.exit(2); }
  const caseNames = readdirSync(skillDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((n) => caseGlob === '*' || new RegExp(`^${caseGlob.replace(/\*/g, '.*')}$`).test(n))
    .sort();

  const arms: ('with' | 'without')[] = arm === 'both' ? ['with', 'without'] : [arm as 'with' | 'without'];
  const cases: any[] = [];

  const jobs = caseNames.map((caseName) => async () => {
    const { front, body } = readFrontmatter(join(skillDir, caseName, 'prompt.md'));
    const maxTurns = Number(front.max_turns ?? 12);
    const timeoutS = Number(front.timeout_seconds ?? 420);

    const fixtures = { ...(await buildFixtures(skill, caseName)), ...fixtureOverrides };
    const prompt = body.replace(/\{\{fixture\.([a-zA-Z0-9_]+)\}\}/g, (_m, k) => {
      if (!(k in fixtures)) throw new Error(`case ${skill}/${caseName} wants fixture "${k}" that fixtures.ts did not build`);
      return fixtures[k];
    });

    const armResults: Record<string, ArmResult> = {};
    // Both arms in parallel: acting-on-verdicts spends up to 170s per await
    // call and only fits the gate's budget when the control runs alongside.
    const settled = await Promise.all(
      arms.map(async (a) => {
        // Worst-of-N, for BOTH arms. This used to stop the `with` arm at the
        // first passing rep and keep only the last `without` rep — a best-of-N
        // that hides a flaky skill, and a last-of-N that throws four fifths of
        // the control evidence away. `--runs` exists for micro-testing wording,
        // where variance is the whole signal, so a single failing rep is the
        // answer worth reporting.
        const reps: ArmResult[] = [];
        for (let r = 0; r < runs; r++) {
          reps.push(await runArmWithRetries(skill, caseName, prompt, maxTurns, timeoutS, a, keepTemp));
        }
        const worst = reps.find((rep) => rep.graders.some((g) => !g.passed)) ?? reps[reps.length - 1];
        const failedReps = reps.filter((rep) => rep.graders.some((g) => !g.passed)).length;
        return [a, { ...worst, reps: reps.length, failedReps }] as const;
      }),
    );
    for (const [a, r] of settled) armResults[a] = r;
    return { name: caseName, arms: armResults, fixtures };
  });

  // `Promise.all` rejects on the FIRST failing job while its siblings keep
  // running, so restoring in a plain `finally` used to hand rows back while
  // another agent was still mid-arm — un-exhausting a budget the next case
  // depended on. Settle every worker first, then restore, then rethrow.
  const outcome = await pool(jobs, concurrency).then(
    (value) => ({ value, error: undefined as unknown }),
    (error) => ({ value: undefined as unknown, error }),
  );
  try {
    await restoreFixtureState();
  } catch (restoreError) {
    // Never let a failed undo mask the real failure.
    if (outcome.error === undefined) throw restoreError;
    console.error('fixture restore also failed:', restoreError);
  }
  if (outcome.error !== undefined) throw outcome.error;
  const settled = outcome.value as Awaited<ReturnType<typeof pool>>;
  cases.push(...settled);

  // --- report ---
  let allPassed = true;
  console.log(`\nskill: ${skill}   cases: ${cases.length}   arms: ${arms.join('+')}\n`);
  for (const c of cases) {
    for (const a of arms) {
      const r = c.arms[a];
      if (!r) continue;
      const ok = r.graders.every((g: GraderResult) => g.passed);
      if (a === 'with' && !ok) allPassed = false;
      const flag = ok ? 'PASS' : 'FAIL';
      console.log(`  ${c.name.padEnd(24)} ${a.padEnd(8)} ${flag}`);
      for (const g of r.graders) {
        console.log(`      ${g.passed ? '·' : '✗'} ${g.name.padEnd(24)} ${g.detail}`);
      }
    }
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = join(EVALS, 'results', stamp);
  mkdirSync(outDir, { recursive: true });
  const payload = { skill, cases };
  writeFileSync(join(outDir, `${skill}.json`), JSON.stringify(payload, null, 2));
  if (opts.json) writeFileSync(String(opts.json), JSON.stringify(payload, null, 2));

  console.log(`\nresults: ${join(outDir, `${skill}.json`)}`);
  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
