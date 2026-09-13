import { applyReplacement, evaluateRegex, type ReplacementOutcome } from '../core/engine';
import type { EvalRequest, EvalResponse } from './protocol';

const ctx = self as unknown as {
  onmessage: ((ev: MessageEvent<EvalRequest>) => void) | null;
  postMessage(msg: EvalResponse): void;
};

ctx.onmessage = (ev) => {
  const req = ev.data;
  try {
    const evalOutcome = evaluateRegex(
      req.pattern,
      req.flags,
      req.text,
      req.limit !== undefined ? { limit: req.limit } : undefined,
    );
    let replacement: ReplacementOutcome | undefined;
    if (req.replacement !== undefined) {
      replacement = applyReplacement(req.pattern, req.flags, req.text, req.replacement);
    }
    ctx.postMessage({ id: req.id, eval: evalOutcome, replacement });
  } catch (error) {
    ctx.postMessage({
      id: req.id,
      eval: { ok: false, error: error instanceof Error ? error.message : String(error) },
    });
  }
};
