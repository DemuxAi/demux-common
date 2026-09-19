/**
 * 模型厂家（maker）：模型是谁做的——OpenAI / Anthropic / Google …
 *
 * 与「供应商 / 渠道」（vendor、queueGroup）是两回事：同一个 claude 模型可能走 kiro、走 pa 两个渠道，
 * 但厂家都是 Anthropic。价格表按厂家分组、按厂家拉官方价，都用这里的键。
 *
 * 键是开放集合：官方源可能报出我们没列的厂家，那些原样透传、展示时用原串；
 * 只有我们认识的几家有中文标签和排序权重。
 */

export interface MakerInfo {
  key: string;
  label: string;
  /** 分组展示顺序，越小越靠前。 */
  order: number;
  /** 模型键前缀 / 片段；命中即归到该厂家。全部小写。 */
  patterns: readonly string[];
}

export const MAKER_OTHER = 'other' as const;

export const KNOWN_MAKERS: readonly MakerInfo[] = [
  { key: 'openai', label: 'OpenAI', order: 10, patterns: ['gpt-', 'gpt4', 'chatgpt', 'o1', 'o3', 'o4', 'text-embedding-3', 'text-embedding-ada', 'dall-e', 'whisper', 'tts-', 'codex', 'sora'] },
  { key: 'anthropic', label: 'Anthropic', order: 20, patterns: ['claude'] },
  { key: 'google', label: 'Google', order: 30, patterns: ['gemini', 'gemma', 'imagen', 'veo', 'palm'] },
  { key: 'deepseek', label: 'DeepSeek', order: 40, patterns: ['deepseek'] },
  { key: 'qwen', label: '通义千问', order: 50, patterns: ['qwen', 'qwq', 'qvq', 'text-embedding-v', 'tongyi-embedding'] },
  { key: 'moonshot', label: 'Moonshot', order: 60, patterns: ['kimi', 'moonshot'] },
  { key: 'zhipu', label: '智谱', order: 70, patterns: ['glm', 'chatglm', 'cogview', 'cogvideo'] },
  { key: 'xai', label: 'xAI', order: 80, patterns: ['grok'] },
  { key: 'meta', label: 'Meta', order: 90, patterns: ['llama'] },
  { key: 'mistral', label: 'Mistral', order: 100, patterns: ['mistral', 'mixtral', 'codestral', 'pixtral', 'ministral'] },
  { key: 'minimax', label: 'MiniMax', order: 110, patterns: ['minimax', 'abab'] },
  { key: 'doubao', label: '豆包', order: 120, patterns: ['doubao'] },
  { key: 'baidu', label: '百度', order: 130, patterns: ['ernie'] },
  { key: 'tencent', label: '腾讯', order: 140, patterns: ['hunyuan'] },
  { key: 'stepfun', label: '阶跃星辰', order: 150, patterns: ['step-'] },
  { key: 'cohere', label: 'Cohere', order: 160, patterns: ['command-', 'embed-', 'rerank-'] },
  { key: 'ai21', label: 'AI21 Labs', order: 161, patterns: ['jamba'] },
  { key: 'perplexity', label: 'Perplexity', order: 162, patterns: ['sonar'] },
  { key: 'upstage', label: 'Upstage', order: 163, patterns: ['solar-'] },
  { key: 'inception', label: 'Inception', order: 164, patterns: ['mercury'] },
  { key: 'bfl', label: 'Black Forest Labs', order: 170, patterns: ['flux'] },
  { key: 'midjourney', label: 'Midjourney', order: 180, patterns: ['midjourney', 'mj-'] },
];

const byKey = new Map(KNOWN_MAKERS.map((m) => [m.key, m]));

/** 认识的厂家给中文 / 官方名，不认识的原样返回（首字母大写）。 */
export function makerLabel(key: string | null | undefined): string {
  if (!key || key === MAKER_OTHER) return '其他';
  const k = key.trim().toLowerCase();
  const known = byKey.get(k);
  if (known) return known.label;
  return k.charAt(0).toUpperCase() + k.slice(1);
}

/** 分组排序：认识的按 order，不认识的按字母排在后面，`other` 永远最后。 */
export function makerOrder(key: string): number {
  if (key === MAKER_OTHER) return Number.MAX_SAFE_INTEGER;
  return byKey.get(key)?.order ?? 1000;
}

export function compareMakers(a: string, b: string): number {
  const d = makerOrder(a) - makerOrder(b);
  return d !== 0 ? d : a.localeCompare(b);
}

/**
 * 从模型键猜厂家。只做前缀 / 片段匹配，猜不到给 `other`。
 * 官方源会直接告诉我们厂家（models.dev 的 provider、OpenRouter 的 `org/model`），那时不用猜；
 * 这里主要服务手工录入和迁移种子。
 */
export function inferMaker(modelKey: string): string {
  const k = modelKey.trim().toLowerCase();
  if (!k) return MAKER_OTHER;
  // `anthropic/claude-3` 这种带前缀的键，前缀本身就是厂家。
  const slash = k.indexOf('/');
  if (slash > 0) {
    const head = k.slice(0, slash);
    if (byKey.has(head)) return head;
  }
  for (const m of KNOWN_MAKERS) {
    for (const p of m.patterns) {
      if (k.startsWith(p) || k.includes(`-${p}`) || k.includes(`/${p}`) || k.includes(`_${p}`)) return m.key;
    }
  }
  return MAKER_OTHER;
}

/** 后端下发的 maker 归一：空 → 按键推断；否则小写 trim。 */
export function normalizeMaker(raw: string | null | undefined, modelKey: string): string {
  const k = raw?.trim().toLowerCase();
  return k ? k : inferMaker(modelKey);
}
