export interface ChatMsg {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GenOptions {
  maxTokens: number;
  temperature: number;
  onToken: (token: string) => void;
}

export interface GenResult {
  text: string;
  tokensPerSecond?: number;
}

/**
 * Runtime-agnostic inference contract. The UI only talks to this interface, so
 * you can swap llama.rn for LiteRT-LM or ExecuTorch by implementing it once.
 */
export interface InferenceEngine {
  readonly name: string;
  /** False for the demo engine, which needs no model file. */
  readonly requiresModel: boolean;
  isLoaded(): boolean;
  loadedPath(): string | null;
  load(modelPath: string, opts: { contextSize: number }): Promise<void>;
  generate(messages: ChatMsg[], opts: GenOptions): Promise<GenResult>;
  stop(): Promise<void>;
  unload(): Promise<void>;
}
