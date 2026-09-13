import './style.css';
import {
  DEFAULT_MATCH_LIMIT,
  type EvalOutcome,
  type MatchResult,
  type ReplacementOutcome,
} from './core/engine';
import { explainPattern } from './core/explain';
import { decodeState, estimateUrlLength, serializeHash, type SharedState } from './core/share';
import type { EvalRequest, EvalResponse } from './worker/protocol';

const EVAL_DEBOUNCE_MS = 120;
const HASH_DEBOUNCE_MS = 400;
const EVAL_TIMEOUT_MS = 1000;
const MAX_HIGHLIGHT_MARKS = 500;
const LARGE_URL_THRESHOLD = 4000;

const DEFAULT_STATE: SharedState = {
  pattern: '(\\w+)@(\\w+)\\.com',
  flags: 'gi',
  text: [
    'Contact us at hello@example.com or support@company.com for help.',
    'These are not emails: admin@@example, bob@localhost, or carol@invalid.',
  ].join('\n'),
  replacement: '$1 [at] $2',
};

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

const els = {
  pattern: byId<HTMLInputElement>('pattern-input'),
  preview: byId<HTMLElement>('pattern-preview'),
  flags: {
    g: byId<HTMLInputElement>('flag-g'),
    i: byId<HTMLInputElement>('flag-i'),
    m: byId<HTMLInputElement>('flag-m'),
    s: byId<HTMLInputElement>('flag-s'),
    u: byId<HTMLInputElement>('flag-u'),
  },
  error: byId<HTMLElement>('pattern-error'),
  explainToggle: byId<HTMLButtonElement>('explain-toggle'),
  explainCard: byId<HTMLElement>('explain-card'),
  explainList: byId<HTMLUListElement>('explain-list'),
  explainWarnings: byId<HTMLUListElement>('explain-warnings'),
  text: byId<HTMLTextAreaElement>('text-input'),
  highlight: byId<HTMLElement>('highlight'),
  status: byId<HTMLElement>('match-status'),
  workerStatus: byId<HTMLElement>('worker-status'),
  matchList: byId<HTMLOListElement>('match-list'),
  replacement: byId<HTMLInputElement>('replacement-input'),
  replacementNote: byId<HTMLElement>('replacement-note'),
  replacementPreview: byId<HTMLElement>('replacement-preview'),
  copyShare: byId<HTMLButtonElement>('copy-share'),
  shareWarning: byId<HTMLElement>('share-warning'),
  copyPattern: byId<HTMLButtonElement>('copy-pattern'),
  copyMatches: byId<HTMLButtonElement>('copy-matches'),
  copyReplacement: byId<HTMLButtonElement>('copy-replacement'),
};

// --- Worker management -------------------------------------------------------

let worker: Worker | null = null;
let workerSeq = 0;
let pendingId: number | null = null;
let pendingTimer: number | undefined;
let lastMatches: MatchResult[] = [];

function spawnWorker(): Worker {
  const w = new Worker(new URL('./worker/eval.worker.ts', import.meta.url), { type: 'module' });
  w.onmessage = (ev: MessageEvent<EvalResponse>) => {
    const res = ev.data;
    if (res.id !== pendingId) return; // stale response
    window.clearTimeout(pendingTimer);
    pendingId = null;
    els.workerStatus.hidden = true;
    lastMatches = res.eval.ok ? res.eval.matches : [];
    renderEval(res.eval);
    if (res.replacement) renderReplacement(res.replacement);
  };
  w.onerror = () => {
    els.workerStatus.hidden = false;
    els.workerStatus.textContent = 'Background evaluation failed unexpectedly.';
  };
  return w;
}

function getWorker(): Worker {
  if (!worker) worker = spawnWorker();
  return worker;
}

// --- State helpers -----------------------------------------------------------

function currentFlags(): string {
  return Object.entries(els.flags)
    .filter(([, cb]) => cb.checked)
    .map(([flag]) => flag)
    .join('');
}

function currentState(): SharedState {
  return {
    pattern: els.pattern.value,
    flags: currentFlags(),
    text: els.text.value,
    replacement: els.replacement.value,
  };
}

function applyState(state: SharedState): void {
  els.pattern.value = state.pattern;
  els.text.value = state.text;
  els.replacement.value = state.replacement;
  for (const [flag, cb] of Object.entries(els.flags)) {
    cb.checked = state.flags.includes(flag);
  }
}

// --- Debounce / scheduling ---------------------------------------------------

let evalTimer: number | undefined;
let hashTimer: number | undefined;

function scheduleEvaluate(): void {
  window.clearTimeout(evalTimer);
  evalTimer = window.setTimeout(evaluate, EVAL_DEBOUNCE_MS);
}

function updateHashSoon(): void {
  window.clearTimeout(hashTimer);
  hashTimer = window.setTimeout(updateHash, HASH_DEBOUNCE_MS);
}

// --- Evaluation --------------------------------------------------------------

function evaluate(): void {
  const state = currentState();
  try {
    new RegExp(state.pattern, state.flags);
  } catch (error) {
    showPatternError(error instanceof Error ? error.message : String(error));
    els.status.textContent = 'Invalid pattern';
    els.status.classList.add('invalid');
    clearResults();
    return;
  }
  hidePatternError();

  const w = getWorker();
  const id = ++workerSeq;
  pendingId = id;
  const request: EvalRequest = {
    id,
    pattern: state.pattern,
    flags: state.flags,
    text: state.text,
    replacement: state.replacement,
    limit: DEFAULT_MATCH_LIMIT,
  };
  w.postMessage(request);
  window.clearTimeout(pendingTimer);
  pendingTimer = window.setTimeout(() => {
    pendingId = null;
    if (worker) {
      worker.terminate();
      worker = null;
    }
    els.workerStatus.hidden = false;
    els.workerStatus.textContent =
      'Evaluation aborted — expression took too long (possible catastrophic backtracking).';
  }, EVAL_TIMEOUT_MS);
}

function renderEval(outcome: EvalOutcome): void {
  if (!outcome.ok) {
    showPatternError(outcome.error);
    els.status.textContent = 'Invalid pattern';
    els.status.classList.add('invalid');
    clearResults();
    return;
  }
  els.status.classList.remove('invalid');
  const count = outcome.matches.length;
  els.status.textContent = outcome.truncated
    ? `${count} matches — showing the first ${DEFAULT_MATCH_LIMIT}`
    : count === 0
      ? 'No matches'
      : count === 1
        ? '1 match'
        : `${count} matches`;
  renderMatchList(outcome.matches);
  renderHighlight(outcome.matches);
}

function renderReplacement(outcome: ReplacementOutcome): void {
  if (!outcome.ok) {
    els.replacementPreview.textContent = `Replacement error: ${outcome.error}`;
    return;
  }
  els.replacementPreview.textContent = outcome.result === '' ? '—' : outcome.result;
}

function clearResults(): void {
  els.matchList.replaceChildren();
  els.highlight.replaceChildren();
  els.replacementPreview.textContent = '—';
}

function showPatternError(message: string): void {
  els.error.hidden = false;
  els.error.textContent = message;
}

function hidePatternError(): void {
  els.error.hidden = true;
  els.error.textContent = '';
}

// --- Rendering ---------------------------------------------------------------

function renderMatchList(matches: MatchResult[]): void {
  const items = matches.map((match, idx) => {
    const li = document.createElement('li');
    li.className = 'match-row';

    const num = document.createElement('span');
    num.className = 'match-index';
    num.textContent = String(idx + 1);

    const value = document.createElement('code');
    value.className = 'match-value';
    value.textContent = match.value;

    const pos = document.createElement('span');
    pos.className = 'match-pos';
    pos.textContent = `at ${match.index}`;

    li.append(num, value, pos);

    if (match.groups.length > 0 || Object.keys(match.namedGroups).length > 0) {
      const groups = document.createElement('div');
      groups.className = 'match-groups';
      match.groups.forEach((group, gi) => {
        const chip = document.createElement('span');
        chip.className = 'group-chip' + (group === undefined ? ' empty' : '');
        const label = document.createElement('span');
        label.className = 'group-label';
        label.textContent = `$${gi + 1}`;
        const content = document.createElement('code');
        content.textContent = group === undefined ? '(not matched)' : group;
        chip.append(label, content);
        groups.append(chip);
      });
      for (const [name, groupValue] of Object.entries(match.namedGroups)) {
        const chip = document.createElement('span');
        chip.className = 'group-chip named';
        const label = document.createElement('span');
        label.className = 'group-label';
        label.textContent = name;
        const content = document.createElement('code');
        content.textContent = groupValue;
        chip.append(label, content);
        groups.append(chip);
      }
      li.append(groups);
    }
    return li;
  });
  els.matchList.replaceChildren(...items);
}

function renderHighlight(matches: MatchResult[]): void {
  const text = els.text.value;
  const frag = document.createDocumentFragment();
  let cursor = 0;
  let marks = 0;
  for (const match of matches) {
    if (match.value.length === 0) continue; // zero-width matches cannot be painted
    if (marks >= MAX_HIGHLIGHT_MARKS) break;
    if (match.index < cursor) continue; // defensive: skip overlaps
    if (match.index > cursor) frag.append(text.slice(cursor, match.index));
    const mark = document.createElement('mark');
    mark.textContent = match.value;
    frag.append(mark);
    cursor = match.index + match.value.length;
    marks += 1;
  }
  if (cursor < text.length) frag.append(text.slice(cursor));
  els.highlight.replaceChildren(frag);
}

function renderPreview(): void {
  els.preview.textContent = `/${els.pattern.value}/${currentFlags()}`;
}

function renderReplacementNote(): void {
  els.replacementNote.hidden = currentFlags().includes('g');
}

function renderExplain(): void {
  const state = currentState();
  if (state.pattern === '') {
    const li = document.createElement('li');
    li.className = 'explain-hint';
    li.textContent = 'Start typing a pattern to see what each part does.';
    els.explainList.replaceChildren(li);
    els.explainWarnings.replaceChildren();
    return;
  }
  const { tokens, warnings } = explainPattern(state.pattern, state.flags);
  const items = tokens.map((token) => {
    const li = document.createElement('li');
    li.className = `explain-token kind-${token.kind}` + (token.unsupported ? ' unsupported' : '');
    li.style.paddingLeft = `${8 + (token.depth ?? 0) * 14}px`;

    const raw = document.createElement('code');
    raw.className = 'explain-raw';
    raw.textContent = token.raw;
    const title = document.createElement('span');
    title.className = 'explain-title';
    title.textContent = token.title;
    const detail = document.createElement('span');
    detail.className = 'explain-detail';
    detail.textContent = token.detail;
    li.append(raw, title, detail);
    return li;
  });
  els.explainList.replaceChildren(...items);
  const warningItems = warnings.map((warning) => {
    const li = document.createElement('li');
    li.textContent = warning;
    return li;
  });
  els.explainWarnings.replaceChildren(...warningItems);
}

// --- URL sharing -------------------------------------------------------------

function updateHash(): void {
  const state = currentState();
  const hash = serializeHash(state);
  history.replaceState(null, '', hash === '' ? location.pathname + location.search : hash);
  const urlLength = estimateUrlLength(location.origin + location.pathname, state);
  els.shareWarning.hidden = urlLength <= LARGE_URL_THRESHOLD;
}

// --- Clipboard ---------------------------------------------------------------

async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to the legacy path
    }
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.append(textarea);
  textarea.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  textarea.remove();
  return ok;
}

async function copyWithFeedback(
  text: string,
  button: HTMLButtonElement,
  label: string,
): Promise<void> {
  const ok = await copyText(text);
  button.textContent = ok ? 'Copied!' : 'Copy failed';
  window.setTimeout(() => {
    button.textContent = label;
  }, 1200);
}

function bindCopy(button: HTMLButtonElement, getText: () => string): void {
  const label = button.textContent ?? 'Copy';
  button.addEventListener('click', () => {
    void copyWithFeedback(getText(), button, label);
  });
}

// --- Events ------------------------------------------------------------------

function onStateChange(): void {
  renderPreview();
  renderExplain();
  renderReplacementNote();
  scheduleEvaluate();
  updateHashSoon();
}

els.pattern.addEventListener('input', onStateChange);
for (const checkbox of Object.values(els.flags)) {
  checkbox.addEventListener('change', onStateChange);
}
els.text.addEventListener('input', () => {
  scheduleEvaluate();
  updateHashSoon();
});
els.text.addEventListener('scroll', () => {
  els.highlight.scrollTop = els.text.scrollTop;
  els.highlight.scrollLeft = els.text.scrollLeft;
});
els.replacement.addEventListener('input', () => {
  scheduleEvaluate();
  updateHashSoon();
});
els.explainToggle.addEventListener('click', () => {
  const expanded = els.explainToggle.getAttribute('aria-expanded') === 'true';
  els.explainToggle.setAttribute('aria-expanded', String(!expanded));
  els.explainCard.hidden = expanded;
});

bindCopy(els.copyPattern, () => els.pattern.value);
bindCopy(els.copyMatches, () => lastMatches.map((m) => m.value).join('\n'));
bindCopy(els.copyReplacement, () => els.replacementPreview.textContent ?? '');
els.copyShare.addEventListener('click', () => {
  updateHash();
  void copyWithFeedback(location.href, els.copyShare, 'Copy share link');
});

// --- Init --------------------------------------------------------------------

function init(): void {
  const shared = decodeState(location.hash);
  applyState(shared ?? DEFAULT_STATE);
  renderPreview();
  renderExplain();
  renderReplacementNote();
  updateHash();
  els.pattern.focus();
  evaluate();
}

init();
