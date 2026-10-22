import type { ChatMsg, GenOptions, GenResult, InferenceEngine } from './types';

/**
 * Demo engine used when the llama.rn native module is missing (Expo Go, web, tests).
 * It streams a canned reply so the UI can be exercised without a model.
 */
export class MockEngine implements InferenceEngine {
  readonly name = 'Demo engine (no native runtime)';
  readonly requiresModel = false;
  private loaded = false;
  private stopped = false;

  isLoaded() {
    return this.loaded;
  }
  loadedPath() {
    return this.loaded ? 'demo' : null;
  }
  async load() {
    this.loaded = true;
  }
  async generate(messages: ChatMsg[], opts: GenOptions): Promise<GenResult> {
    this.stopped = false;
    const last = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
    const text =
      `⚠️ Demo mode: the on-device runtime is not available in this build, so this is a canned reply.\n\n` +
      `You said: "${last.slice(0, 140)}"\n\nBuild a development client (npx expo run:android) to run a real offline model.`;
    let out = '';
    for (const word of text.split(/(\s+)/)) {
      if (this.stopped) break;
      out += word;
      opts.onToken(word);
      await new Promise((r) => setTimeout(r, 25));
    }
    return { text: out };
  }
  async stop() {
    this.stopped = true;
  }
  async unload() {
    this.loaded = false;
  }
}
