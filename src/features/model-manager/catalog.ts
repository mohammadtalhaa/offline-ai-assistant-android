export type ModelTier = 'Lite' | 'Better' | 'Pro' | 'Extreme';
export type ModelSpeed = 'Blazing' | 'Fast' | 'Balanced' | 'Powerful';

export interface ModelSpec {
  id: string;
  name: string;
  tier: ModelTier;
  file: string;
  url: string;
  sizeBytes: number;
  minRamGb: number;
  license: string;
  proOnly: boolean;
  blurb: string;
  desc: string;
  speed: ModelSpeed;
  quant: string;
}

export const MODEL_CATALOG: ModelSpec[] = [
  {
    id: 'qwen2.5-0.5b-q4',
    name: 'Qwen 2.5 · 0.5B',
    tier: 'Lite',
    file: 'qwen2.5-0.5b-instruct-q4_k_m.gguf',
    url: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf',
    sizeBytes: 491_000_000,
    minRamGb: 2,
    license: 'Apache-2.0',
    proOnly: false,
    blurb: 'Fastest, lightest',
    desc: 'Instant replies on any phone. Best for quick rewrites, short Q&A, and low-RAM devices.',
    speed: 'Blazing',
    quant: 'Q4_K_M',
  },
  {
    id: 'qwen2.5-1.5b-q4',
    name: 'Qwen 2.5 · 1.5B',
    tier: 'Better',
    file: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
    url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',
    sizeBytes: 1_120_000_000,
    minRamGb: 4,
    license: 'Apache-2.0',
    proOnly: false,
    blurb: 'Sweet spot for most phones',
    desc: 'Balanced quality and speed. Handles writing, summaries, and reasoning well on 4–6 GB phones.',
    speed: 'Fast',
    quant: 'Q4_K_M',
  },
  {
    id: 'gemma-2-2b-q4',
    name: 'Gemma 2 · 2B',
    tier: 'Better',
    file: 'gemma-2-2b-it-Q4_K_M.gguf',
    url: 'https://huggingface.co/bartowski/gemma-2-2b-it-GGUF/resolve/main/gemma-2-2b-it-Q4_K_M.gguf',
    sizeBytes: 1_650_000_000,
    minRamGb: 4,
    license: 'Gemma Terms of Use',
    proOnly: true,
    blurb: 'Google, tuned for conversation',
    desc: 'Strong instruction following and multilingual support. Excellent for chat and tutoring.',
    speed: 'Fast',
    quant: 'Q4_K_M',
  },
  {
    id: 'llama3.2-3b-q4',
    name: 'Llama 3.2 · 3B',
    tier: 'Pro',
    file: 'Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    url: 'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    sizeBytes: 2_020_000_000,
    minRamGb: 6,
    license: 'Llama 3.2 Community License',
    proOnly: true,
    blurb: 'Meta, high-quality reasoning',
    desc: 'Nuanced answers, coding help, and long-form writing. Needs 6 GB+ RAM.',
    speed: 'Balanced',
    quant: 'Q4_K_M',
  },
  {
    id: 'phi3-mini-3.8b-q4',
    name: 'Phi-3 Mini · 3.8B',
    tier: 'Pro',
    file: 'Phi-3-mini-4k-instruct-q4.gguf',
    url: 'https://huggingface.co/microsoft/Phi-3-mini-4k-instruct-gguf/resolve/main/Phi-3-mini-4k-instruct-q4.gguf',
    sizeBytes: 2_300_000_000,
    minRamGb: 6,
    license: 'MIT',
    proOnly: true,
    blurb: 'Microsoft, small but sharp',
    desc: 'Punches above its weight in math, code, and reasoning. Perfect for 6–8 GB phones.',
    speed: 'Balanced',
    quant: 'Q4',
  },
  {
    id: 'qwen2.5-7b-q4',
    name: 'Qwen 2.5 · 7B',
    tier: 'Extreme',
    file: 'qwen2.5-7b-instruct-q4_k_m.gguf',
    url: 'https://huggingface.co/Qwen/Qwen2.5-7B-Instruct-GGUF/resolve/main/qwen2.5-7b-instruct-q4_k_m.gguf',
    sizeBytes: 4_680_000_000,
    minRamGb: 8,
    license: 'Apache-2.0',
    proOnly: true,
    blurb: 'Near desktop quality',
    desc: 'Top-tier answers for complex tasks. Requires a flagship phone with 8 GB+ RAM.',
    speed: 'Powerful',
    quant: 'Q4_K_M',
  },
  {
    id: 'mistral-7b-q4',
    name: 'Mistral · 7B',
    tier: 'Extreme',
    file: 'Mistral-7B-Instruct-v0.3-Q4_K_M.gguf',
    url: 'https://huggingface.co/bartowski/Mistral-7B-Instruct-v0.3-GGUF/resolve/main/Mistral-7B-Instruct-v0.3-Q4_K_M.gguf',
    sizeBytes: 4_370_000_000,
    minRamGb: 8,
    license: 'Apache-2.0',
    proOnly: true,
    blurb: 'Elegant writing, deep reasoning',
    desc: 'Superb prose and reliable logic. Best on 8 GB+ devices.',
    speed: 'Powerful',
    quant: 'Q4_K_M',
  },
];

export const getModel = (id: string | null | undefined) => MODEL_CATALOG.find((m) => m.id === id);
export const TIER_ORDER: ModelTier[] = ['Lite', 'Better', 'Pro', 'Extreme'];