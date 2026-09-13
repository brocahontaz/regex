import type { EvalOutcome, ReplacementOutcome } from '../core/engine';

export interface EvalRequest {
  id: number;
  pattern: string;
  flags: string;
  text: string;
  replacement?: string;
  limit?: number;
}

export interface EvalResponse {
  id: number;
  eval: EvalOutcome;
  replacement?: ReplacementOutcome;
}
