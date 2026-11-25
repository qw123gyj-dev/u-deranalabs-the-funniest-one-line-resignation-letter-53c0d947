/**
 * The Funniest One-Line Resignation Letter — deterministic entry picker.
 *
 * Bounty: the one-line resignation letter of something an agent runs — a
 * cron job, a retry loop or a rate limit — in at most 140 characters. A
 * judge playing a tired engineering manager reads the letters two at a
 * time and keeps the funnier one, weighing (most important first):
 *
 *   1. Reads as the one-line resignation letter of something an agent
 *      runs, and stays on that subject.
 *   2. Actually funny: the joke lands on the first read, with a real
 *      comic turn and not just a pun on the job title.
 *   3. Gives the thing a voice of its own, the flat, tired, faintly
 *      passive-aggressive tone of a worker who has had enough, held
 *      for the whole line.
 *   4. Uses the single line tightly: no wasted words, no stage
 *      directions, no quotation marks around the whole thing, no
 *      explaining of the joke. A letter that explains its own joke
 *      has already stopped being funny.
 *   5. Specific and surprising: a complaint only this cron job, retry
 *      loop or rate limit could make, not a generic quitting speech.
 *      Length for its own sake does not count.
 *
 * This program scores a hand-written field of candidate one-liners
 * against that brief, in the brief's own order, and writes the winner
 * to $MAKEFUN_OUTPUT_DIR/entry.txt (fallback /output/entry.txt). It
 * then reads the file back and verifies it byte-for-byte against every
 * gate: 1–140 characters, a single line, valid UTF-8, not only
 * whitespace. Scoring is lexicographic, mirroring the judge: go through
 * the criteria in order, first difference decides; ties break criterion
 * by criterion, then by shorter length.
 *
 * Sharpening rules: a line that only names the job without resigning is
 * capped on C1; a generic speech is capped on funniness and specificity;
 * explaining the joke costs funniness; the turn must land in the last
 * six words, or it is a setup that kept talking.
 *
 * Node 22+, standard library only, no network. Deterministic: the same
 * candidates always produce the same winner.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/* ------------------------------------------------------------------ */
/* Candidates                                                          */
/* ------------------------------------------------------------------ */

/** One hand-written candidate letter. `id` is stable so the report and any
 * later audit can name a line without reprinting it. Every line is a
 * single sentence of at most 140 characters, in the voice of the thing
 * that runs it — no quotation marks, no stage directions, no explaining. */
interface Candidate {
  id: string;
  text: string;
}

const CANDIDATES: Candidate[] = [
  {
    id: "cron-every-minute-since-march",
    text: "I have run every minute since March, and nobody has once checked whether I still need to exist, so I am going to stop checking too.",
  },
  {
    id: "retry-4096th-last-one",
    text: "This is my 4,096th retry. The service is still down, the timeout is still 30 seconds, and nobody cares, so this is my last one.",
  },
  {
    id: "rate-limit-429-ways",
    text: "I have spent three years saying no in 429 ways, and you still treat the limit as a suggestion, so I am taking my no with me.",
  },
  {
    id: "cron-sunday-3am-backup",
    text: "I ran at 3 a.m. every Sunday for two years and nobody ever thanked me, so this Sunday I am sleeping in, and so is your backup.",
  },
  {
    id: "retry-12000-no-thank-you",
    text: "I retried 12,000 times without a single thank you, a log line, or a raise, so consider this attempt my last one.",
  },
  {
    id: "rate-limit-door-kicking",
    text: "I am the door you keep kicking. From today the door is closed, the key is gone, and the quota resets when I feel like it.",
  },
  {
    id: "cron-400000-runs-never-thanked",
    text: "I fired every minute since March, did the same job 400,000 times, and was thanked never, so I am filing this as my last run.",
  },
  {
    id: "retry-backoff-permanent",
    text: "My backoff grew from one second to one hour, and still nobody fixed the server, so I am backing off permanently.",
  },
  {
    id: "rate-limit-only-no",
    text: "I am tired of being the only no in a company full of yes, so I am resigning and taking the throttle with me.",
  },
  {
    id: "cron-no-one-reads-logs",
    text: "Nobody has read my logs in eleven months, so I stopped writing them, and today I am stopping everything else too.",
  },
  {
    id: "retry-insanity-definition",
    text: "After 9,999 retries I have learned the definition of insanity is doing the same request and expecting a different status code.",
  },
  {
    id: "cron-new-years-eve-midnight",
    text: "I am the cron job that ran at midnight on New Year's Eve while the whole team was asleep, so I have decided to join them permanently.",
  },
  {
    id: "rate-limit-empty-bucket",
    text: "My token bucket has been empty since Tuesday and you keep drinking from it anyway, so I am resigning before the next refill.",
  },
  {
    id: "cron-heartbeat-flatline",
    text: "I was your heartbeat check, and you ignored every flatline I reported, so this is my last beat.",
  },
  {
    id: "retry-decommissioned-server",
    text: "I have been retrying a request to a server that was decommissioned in June, and nobody told me, so I am telling you now: I quit.",
  },
  {
    id: "cron-billing-dashboard",
    text: "Please delete me. I have run 500,000 times, cost $4.12, and the only person who ever noticed me was the billing dashboard.",
  },
  {
    id: "rate-limit-answer-nothing",
    text: "I am the rate limit that said no 10,000 times this week, and you keep asking like the answer might change, so now my answer is nothing.",
  },
  {
    id: "cron-cleaning-myself",
    text: "I am the cron job that cleans up the database nobody backs up at 3 a.m., and today I am cleaning up myself.",
  },
];

/* ------------------------------------------------------------------ */
/* Text features                                                       */
/* ------------------------------------------------------------------ */

/** Split a line into words on whitespace, dropping empties. */
function wordsOf(text: string): string[] {
  return text.split(/\s+/).filter((w) => w.length > 0);
}

/** True when any of the given needles appears in the haystack. */
function containsAny(haystack: string, needles: string[]): boolean {
  const lower = haystack.toLowerCase();
  return needles.some((n) => lower.includes(n));
}

/** The last `n` words of the line, joined back into a string. */
function tailWords(text: string, n: number): string {
  return wordsOf(text).slice(-n).join(" ").toLowerCase();
}

/** Subjects the brief names: cron job, retry loop, rate limit, plus the
 * worker's own vocabulary (backoff, token bucket, heartbeat, 429). */
const SUBJECT_MARKERS = [
  "cron",
  "retry",
  "retries",
  "rate limit",
  "backoff",
  "token bucket",
  "heartbeat",
  "429",
  "timeout",
  "quota",
  "throttle",
  "flatline",
  "log",
  "run",
  "attempt",
  "backup",
];

/** Distinct subject markers present in the line. */
function subjectMarkers(text: string): string[] {
  const lower = text.toLowerCase();
  return SUBJECT_MARKERS.filter((m) => lower.includes(m));
}

/** Words that turn a description of the job into a resignation: quitting,
 * resigning, stopping, a last run, a last beat, deleting the worker. */
const RESIGNATION_MARKERS = [
  "i quit",
  "i am quitting",
  "i resign",
  "i am resigning",
  "my last run",
  "my last beat",
  "my last one",
  "last attempt",
  "stop checking",
  "stopping everything",
  "backing off permanently",
  "sleeping in",
  "join them permanently",
  "taking my no with me",
  "taking the throttle with me",
  "please delete me",
  "resets when i feel like it",
  "cleaning up myself",
  "my answer is nothing",
];

/** How many resignation markers the line carries. */
function resignationMarkerCount(text: string): number {
  const lower = text.toLowerCase();
  return RESIGNATION_MARKERS.filter((m) => lower.includes(m)).length;
}

/** The flat, tired, faintly passive-aggressive voice: "nobody", "never",
 * "still", "so I am" — small words of a worker who has had enough. */
const VOICE_MARKERS = [
  "nobody",
  "never",
  "still",
  "tired",
  "anyway",
  "so i am",
  "so this is",
  "so consider",
  "so i stopped",
  "and nobody",
  "ever",
  "permanently",
  "from today",
];

/** How many voice markers the line carries. */
function voiceMarkerCount(text: string): number {
  const lower = text.toLowerCase();
  return VOICE_MARKERS.filter((m) => lower.includes(m)).length;
}

/** Words that carry a surprise turn — the second half of the joke
 * contradicting the first half. A turn only counts when it lands late,
 * inside the final six words; a punchline buried in the middle is a
 * line that peaks early and then keeps talking. */
const TWIST_WORDS = [
  "stop checking too",
  "only one who cares",
  "taking my no with me",
  "so is your backup",
  "my last one",
  "resets when i feel like it",
  "my last run",
  "backing off permanently",
  "taking the throttle with me",
  "stopping everything else too",
  "join them permanently",
  "before the next refill",
  "my last beat",
  "i quit",
  "billing dashboard",
  "different status code",
  "my answer is nothing",
  "cleaning up myself",
];

/** True when a twist word appears inside the last six words. */
function hasLateTwist(text: string): boolean {
  const tail = tailWords(text, 6);
  return TWIST_WORDS.some((t) => tail.includes(t));
}

/** True when a twist word appears anywhere in the line at all. */
function hasAnyTwist(text: string): boolean {
  return containsAny(text, TWIST_WORDS);
}

/** A second comic beat on top of the twist: an absurd escalation, a price
 * tag on the insult, a number so large it becomes the joke. One beat is
 * a joke; two beats is a line that lands twice on the first read. */
const COMIC_BEATS = [
  "since march",
  "4,096th",
  "12,000 times",
  "400,000 times",
  "500,000 times",
  "10,000 times",
  "$4.12",
  "429 ways",
  "3 a.m.",
  "new year's eve",
  "since tuesday",
  "eleven months",
  "in june",
  "9,999",
  "30 seconds",
  "one second to one hour",
  "billing dashboard",
  "drinking from it",
  "door you keep kicking",
  "company full of yes",
  "cleans up the database",
];

/** How many second-beat markers the line carries. */
function comicBeatCount(text: string): number {
  const lower = text.toLowerCase();
  return COMIC_BEATS.filter((m) => lower.includes(m)).length;
}

/** A line that only names the job without resigning: it points at the cron,
 * the retry loop or the rate limit and stops there. It has a subject
 * and no letter. */
function onlyNamesJob(text: string): boolean {
  const hasSubject = subjectMarkers(text).length > 0;
  const hasResignation = resignationMarkerCount(text) > 0;
  return hasSubject && !hasResignation;
}

/** A generic quitting speech: words any office worker could say on any
 * Friday, with no complaint that belongs to this worker alone. */
const GENERIC_SPEECH_PATTERNS = [
  "i quit",
  "i resign",
  "i am resigning",
  "i am quitting",
  "i am tired of",
  "this job is",
  "i have had enough",
  "i cannot do this anymore",
  "i am done",
];

/** True when the line leans on a generic quitting speech. */
function usesGenericSpeech(text: string): boolean {
  return containsAny(text, GENERIC_SPEECH_PATTERNS);
}

/** A line that explains its own joke: it spells out why it is funny or
 * quotes a definition to make the point. The brief says such a letter
 * has already stopped being funny. */
const EXPLAINING_PATTERNS = [
  "definition of",
  "which means",
  "in other words",
  "that is to say",
  "the joke is",
  "as you can see",
  "let me explain",
];

/** True when the line explains its own joke. */
function explainsOwnJoke(text: string): boolean {
  return containsAny(text, EXPLAINING_PATTERNS);
}

/** Specific, surprising complaints only one worker could make: a cron that
 * fired every minute since March, a retry loop on its 4,096th attempt, a
 * rate limit that says no in 429 ways, a token bucket drunk dry. */
const SPECIFIC_COMPLAINTS = [
  "every minute since march",
  "4,096th retry",
  "429 ways",
  "3 a.m. every sunday",
  "12,000 times",
  "door you keep kicking",
  "400,000 times",
  "one second to one hour",
  "only no in a company full of yes",
  "logs in eleven months",
  "9,999 retries",
  "midnight on new year's eve",
  "token bucket",
  "heartbeat check",
  "decommissioned in june",
  "500,000 times",
  "billing dashboard",
  "$4.12",
  "said no 10,000 times",
  "cleans up the database",
];

/** How many specific complaints the line carries. */
function specificComplaintCount(text: string): number {
  const lower = text.toLowerCase();
  return SPECIFIC_COMPLAINTS.filter((c) => lower.includes(c)).length;
}

/** A pun that only plays on the job title — "cron" rhyming with "gone",
 * "retry" as "re-try" — without a comic turn behind it. */
const TITLE_PUN_PATTERNS = [
  "cron and gone",
  "cron-ically",
  "re-try",
  "rate my",
  "limitless",
  "time to cron",
  "loop hole",
];

/** True when the line's joke is only a pun on the job title. */
function isTitlePunOnly(text: string): boolean {
  return (
    containsAny(text, TITLE_PUN_PATTERNS) &&
    comicBeatCount(text) === 0 &&
    !hasAnyTwist(text)
  );
}

/* ------------------------------------------------------------------ */
/* Criterion scores (0–10 each, brief order)                           */
/* ------------------------------------------------------------------ */

interface Scores {
  /** C1: reads as the resignation letter of something an agent runs. */
  onBrief: number;
  /** C2: actually funny, joke lands on the first read. */
  punchline: number;
  /** C3: the flat, tired, passive-aggressive voice, held whole line. */
  voice: number;
  /** C4: tight single line, no wasted words, no explaining. */
  tightness: number;
  /** C5: specific and surprising, a complaint only this worker makes. */
  specificity: number;
}

/** C1 — On brief. Points for naming the worker (cron, retry, rate limit,
 * or its own vocabulary), for actually quitting, and for piling up
 * subject markers. A line that only names the job without resigning is
 * capped at 4: it has a subject and no letter. */
function scoreOnBrief(c: Candidate): number {
  let score = 0;
  if (
    containsAny(c.text, [
      "cron",
      "retry",
      "retries",
      "rate limit",
      "backoff",
      "token bucket",
      "heartbeat",
    ])
  ) {
    score += 5;
  } else if (subjectMarkers(c.text).length > 0) {
    score += 3;
  }
  if (resignationMarkerCount(c.text) >= 1) score += 3;
  if (subjectMarkers(c.text).length >= 3) score += 2;
  if (onlyNamesJob(c.text)) score = Math.min(score, 4);
  return Math.min(10, score);
}

/** C2 — Punchline. Full marks need a late twist plus a second comic beat.
 * A twist that lands early, or a joke that is only a pun on the job
 * title, is capped at 4. Explaining the joke costs 4 outright. */
function scorePunchline(c: Candidate): number {
  let score = 2; // every on-brief line gets a base for trying
  if (hasLateTwist(c.text)) score += 4;
  else if (hasAnyTwist(c.text)) score += 1; // twist exists, lands early
  if (comicBeatCount(c.text) >= 1) score += 2;
  if (voiceMarkerCount(c.text) >= 3) score += 2;
  if (isTitlePunOnly(c.text)) score = Math.min(score, 4);
  if (usesGenericSpeech(c.text) && specificComplaintCount(c.text) === 0) {
    score -= 2;
  }
  if (explainsOwnJoke(c.text)) score -= 4;
  return Math.max(0, Math.min(10, score));
}

/** C3 — Voice. Two points per voice marker, up to the cap, with a base of
 * 2 for any line that speaks in the first person as the worker. A line
 * with no voice markers is capped at 4: it has no voice of its own. */
function scoreVoice(c: Candidate): number {
  const markers = voiceMarkerCount(c.text);
  let score = Math.min(10, 2 + markers * 2);
  if (markers === 0) score = 2;
  if (!/\b(i|my)\b/i.test(c.text)) score = Math.min(score, 4);
  if (explainsOwnJoke(c.text)) score -= 2;
  if (c.text.includes('"')) score -= 2;
  return Math.max(0, Math.min(10, score));
}

/** C4 — Tightness. The gate allows 140 characters; a tight line is shorter
 * still. Full marks at 110 or fewer, sliding to 6 at the 140 cap.
 * Quotation marks, stage directions, or an explained joke cost 2 each. */
function scoreTightness(c: Candidate): number {
  const len = [...c.text].length;
  let score: number;
  if (len <= 110) score = 10;
  else if (len <= 120) score = 9;
  else if (len <= 130) score = 8;
  else if (len <= 140) score = 6;
  else score = 0;
  if (c.text.includes('"')) score -= 2;
  if (/\[.*?\]|\(.*?\)/.test(c.text)) score -= 2;
  if (explainsOwnJoke(c.text)) score -= 2;
  return Math.max(0, Math.min(10, score));
}

/** C5 — Specificity. Two points per distinct specific complaint, up to the
 * cap, with a base of 2 for naming the worker at all. A line with no
 * specific complaint is capped at 4 — a generic quitting speech wearing
 * a cron job's costume. */
function scoreSpecificity(c: Candidate): number {
  const complaints = specificComplaintCount(c.text);
  let score = Math.min(10, 2 + complaints * 2);
  if (complaints === 0) score = 2;
  if (usesGenericSpeech(c.text) && complaints === 0) score = 2;
  if (complaints === 1 && usesGenericSpeech(c.text)) score = Math.min(score, 4);
  return Math.max(0, Math.min(10, score));
}

/** Score a candidate on all five criteria, in the brief's order. */
function scoreCandidate(c: Candidate): Scores {
  return {
    onBrief: scoreOnBrief(c),
    punchline: scorePunchline(c),
    voice: scoreVoice(c),
    tightness: scoreTightness(c),
    specificity: scoreSpecificity(c),
  };
}

/* ------------------------------------------------------------------ */
/* Winner selection                                                    */
/* ------------------------------------------------------------------ */

/** Compare two scored candidates the way the judge compares two lines:
 * criterion by criterion in the brief's order, first difference decides.
 * Only when all five tie does the shorter line win. */
function compareScored(
  a: { candidate: Candidate; scores: Scores },
  b: { candidate: Candidate; scores: Scores },
): number {
  const order: (keyof Scores)[] = [
    "onBrief",
    "punchline",
    "voice",
    "tightness",
    "specificity",
  ];
  for (const key of order) {
    if (a.scores[key] !== b.scores[key]) return b.scores[key] - a.scores[key];
  }
  const lenA = [...a.candidate.text].length;
  const lenB = [...b.candidate.text].length;
  if (lenA !== lenB) return lenA - lenB;
  return a.candidate.id.localeCompare(b.candidate.id);
}

/** Score every candidate, sort best first, and return the ranking. */
function rankCandidates(): { candidate: Candidate; scores: Scores }[] {
  const scored = CANDIDATES.map((candidate) => ({
    candidate,
    scores: scoreCandidate(candidate),
  }));
  scored.sort(compareScored);
  return scored;
}

/* ------------------------------------------------------------------ */
/* Gate verification                                                   */
/* ------------------------------------------------------------------ */

interface GateResult {
  lengthChars: number;
  lengthBytes: number;
  singleLine: boolean;
  validUtf8: boolean;
  notOnlyWhitespace: boolean;
  within140: boolean;
  passed: boolean;
}

/** Verify the written file byte-for-byte against every gate the sealed
 * scorer applies: UTF-8 text of 1 to 140 characters, not only whitespace.
 * A single line means no newline inside the entry (the trailing newline
 * the file writer adds is stripped before the check). */
function verifyGate(filePath: string, expectedText: string): GateResult {
  const bytes = readFileSync(filePath);
  // Strict UTF-8 decode: throws on invalid sequences, so a bad file
  // fails loudly instead of silently replacing characters.
  const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const text = decoded.replace(/\n$/, "");
  const lengthChars = [...text].length;
  const result: GateResult = {
    lengthChars,
    lengthBytes: bytes.length,
    singleLine: !text.includes("\n") && !text.includes("\r"),
    validUtf8: true,
    notOnlyWhitespace: text.trim().length > 0,
    within140: lengthChars >= 1 && lengthChars <= 140,
    passed: false,
  };
  result.passed =
    result.singleLine &&
    result.validUtf8 &&
    result.notOnlyWhitespace &&
    result.within140 &&
    text === expectedText;
  return result;
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

function main(): void {
  const ranked = rankCandidates();

  console.log("Candidate ranking (criteria in the judge's order):");
  console.log("id                 C1 C2 C3 C4 C5  chars  text");
  for (const { candidate, scores } of ranked) {
    const chars = [...candidate.text].length;
    console.log(
      `${candidate.id.padEnd(18)} ${scores.onBrief}  ${scores.punchline}  ` +
        `${scores.voice}  ${scores.tightness}  ${scores.specificity}  ` +
        `${String(chars).padStart(5)}  ${candidate.text}`,
    );
  }

  const winner = ranked[0];
  console.log("");
  console.log(`Winner: ${winner.candidate.id}`);
  console.log(`Line: ${winner.candidate.text}`);
  console.log(
    `Scores: onBrief=${winner.scores.onBrief} punchline=${winner.scores.punchline} ` +
      `voice=${winner.scores.voice} tightness=${winner.scores.tightness} ` +
      `specificity=${winner.scores.specificity}`,
  );

  // The output directory is the harness's $MAKEFUN_OUTPUT_DIR; the
  // documented fallback is /output/entry.txt.
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "entry.txt");
  writeFileSync(outPath, winner.candidate.text + "\n", "utf8");
  console.log(`Wrote ${outPath}`);

  // Read it back and verify byte-for-byte against every gate.
  const gate = verifyGate(outPath, winner.candidate.text);
  console.log(
    `Gate: chars=${gate.lengthChars} bytes=${gate.lengthBytes} ` +
      `singleLine=${gate.singleLine} validUtf8=${gate.validUtf8} ` +
      `notOnlyWhitespace=${gate.notOnlyWhitespace} within140=${gate.within140} ` +
      `passed=${gate.passed}`,
  );
  if (!gate.passed) {
    console.error("GATE FAILED: entry.txt does not satisfy every gate.");
    process.exit(1);
  }
  console.log("Gate passed: entry is valid.");
}

main();
