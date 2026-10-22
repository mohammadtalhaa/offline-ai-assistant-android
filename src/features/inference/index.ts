import { LlamaEngine } from './LlamaEngine';
import { MockEngine } from './MockEngine';
import type { InferenceEngine } from './types';

export * from './types';

let engine: InferenceEngine | null = null;

export function getEngine(): InferenceEngine {
  if (!engine) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('llama.rn');
      if (!mod?.initLlama) throw new Error('llama.rn missing initLlama');
      engine = new LlamaEngine(mod);
    } catch {
      engine = new MockEngine();
    }
  }
  return engine;
}