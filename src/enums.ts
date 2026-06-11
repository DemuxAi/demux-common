import { z } from 'zod';

/**
 * 上游 API 协议类型。一个 Provider 只能选一种 apiType（HTTP 协议族）。
 *
 * 选型逻辑：把"协议族"作为一级分类，具体云厂商 / 自建集群作为二级标签。
 */
export const apiTypeValues = [
  'openai',
  'anthropic',
  'gemini',
  'azure_openai',
  'baidu_qianfan',
  'aliyun_dashscope',
  'volcengine_ark',
  'tencent_hunyuan',
  'zhipu_glm',
  'deepseek',
  'moonshot',
  'minimax',
  'siliconflow',
  'self_hosted_openai_compat',
] as const;
export type ApiType = (typeof apiTypeValues)[number];

export const ApiTypeLabel: Readonly<Record<ApiType, string>> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Google Gemini',
  azure_openai: 'Azure OpenAI',
  baidu_qianfan: '百度千帆',
  aliyun_dashscope: '阿里灵积',
  volcengine_ark: '火山方舟',
  tencent_hunyuan: '腾讯混元',
  zhipu_glm: '智谱 GLM',
  deepseek: 'DeepSeek',
  moonshot: 'Moonshot',
  minimax: 'MiniMax',
  siliconflow: 'SiliconFlow',
  self_hosted_openai_compat: '自建（OpenAI 兼容）',
};

/**
 * Provider 状态。
 * - `enabled`：正常参与路由
 * - `disabled`：人工禁用，路由跳过
 * - `auto_disabled`：调度器探测到连续错误自动停用，必须人工恢复（防止"自愈"波动）
 */
export const providerStatusValues = ['enabled', 'disabled', 'auto_disabled'] as const;
export type ProviderStatus = (typeof providerStatusValues)[number];

export const ProviderStatusLabel: Readonly<Record<ProviderStatus, string>> = {
  enabled: '启用中',
  disabled: '已禁用',
  auto_disabled: '自动停用',
};

export const ProviderStatusTone: Readonly<
  Record<ProviderStatus, 'success' | 'warning' | 'danger' | 'info'>
> = {
  enabled: 'success',
  disabled: 'info',
  auto_disabled: 'danger',
};

/** 别名绑定上线/下线（与后端 isPublished 对齐） */
export function publishedLabel(isPublished: boolean): string {
  return isPublished ? '已上线' : '已下线';
}

export function publishedTone(
  isPublished: boolean,
): 'success' | 'warning' | 'danger' | 'info' {
  return isPublished ? 'success' : 'info';
}

/** 供应商组 QueueGroup → 展示名（与 demuxai-api Providers 对齐） */
export const ProviderGroupLabel: Readonly<Record<string, string>> = {
  kiro: 'Kiro',
  gemini: 'Gemini',
  codex: 'Codex',
  claude: 'Claude',
  openai: 'OpenAI',
  cursor: 'Cursor',
  antigravity: 'Antigravity',
  deepseek: 'DeepSeek',
};

export const providerGroupStatusValues = ['active', 'disabled'] as const;
export type ProviderGroupStatus = (typeof providerGroupStatusValues)[number];
export const providerGroupStatusSchema = z.enum(providerGroupStatusValues);

export const ProviderGroupStatusLabel: Readonly<Record<ProviderGroupStatus, string>> = {
  active: '活跃',
  disabled: '已停用',
};

export const ProviderGroupStatusTone: Readonly<
  Record<ProviderGroupStatus, 'success' | 'warning' | 'danger' | 'info'>
> = {
  active: 'success',
  disabled: 'info',
};

/** 模型族 —— 主要用于 UI 分组 / 图标，不影响路由 */
export const modelFamilyValues = [
  'gpt',
  'claude',
  'gemini',
  'qwen',
  'doubao',
  'glm',
  'deepseek',
  'llama',
  'mistral',
  'embedding',
  'image',
  'audio',
  'other',
] as const;
export type ModelFamily = (typeof modelFamilyValues)[number];

export const ModelFamilyLabel: Readonly<Record<ModelFamily, string>> = {
  gpt: 'GPT 系列',
  claude: 'Claude 系列',
  gemini: 'Gemini 系列',
  qwen: '通义千问',
  doubao: '豆包',
  glm: 'GLM',
  deepseek: 'DeepSeek',
  llama: 'Llama',
  mistral: 'Mistral',
  embedding: '向量嵌入',
  image: '图像生成',
  audio: '音频',
  other: '其它',
};

/** 模型能力（位集合，UI 用 tag 多选展示） */
export const modelCapabilityValues = [
  'chat',
  'completion',
  'embedding',
  'image_generation',
  'image_understanding',
  'audio_transcription',
  'audio_synthesis',
  'tool_use',
  'vision',
  'json_mode',
] as const;
export type ModelCapability = (typeof modelCapabilityValues)[number];

export const ModelCapabilityLabel: Readonly<Record<ModelCapability, string>> = {
  chat: '对话',
  completion: '补全',
  embedding: '向量化',
  image_generation: '文生图',
  image_understanding: '图像理解',
  audio_transcription: '语音识别',
  audio_synthesis: '语音合成',
  tool_use: '函数调用',
  vision: '视觉输入',
  json_mode: 'JSON 模式',
};

/**
 * 计费类型（discriminated union 的判别字段）。
 * 每种 `billingType` 对应一种 `pricing` / `usage` / `cost` 嵌套形状。
 */
export const billingTypeValues = [
  'per_token',
  'per_call',
  'per_image',
  'per_video',
  'per_audio_minute',
  'per_character',
] as const;
export type BillingType = (typeof billingTypeValues)[number];

export const BillingTypeLabel: Readonly<Record<BillingType, string>> = {
  per_token: '按量计费',
  per_call: '按次计费',
  per_image: '图片计费',
  per_video: '视频计费',
  per_audio_minute: '音频计费',
  per_character: '字符计费',
};

/**
 * 调用结算状态（对应后端 `AiUsageStatus` / `AiUsageLogDto.status`），
 * 比二元 `success` 表达力更强：
 * - `pending`   → "调用中"：上游已调用但 Billing 结算尚未成功，待重试结算
 * - `success`   → 成功扣费
 * - `failure`   → 调用失败（未扣费）
 * - `cancelled` → 主动取消（客户端断流 / abort）
 * - `unknown`   → 兜底未知态
 *
 * 旧后端不下发此字段时为 undefined，UI 回退按 `success` 推断（true→success / false→failure）。
 */
export const aiUsageStatusValues = ['pending', 'success', 'failure', 'cancelled', 'unknown'] as const;
export type AiUsageStatus = (typeof aiUsageStatusValues)[number];
export const aiUsageStatusSchema = z.enum(aiUsageStatusValues);

export const AiUsageStatusLabel: Readonly<Record<AiUsageStatus, string>> = {
  pending: '调用中',
  success: '成功',
  failure: '失败',
  cancelled: '已取消',
  unknown: '未知',
};

/**
 * 调用日志错误码（常见值）。`LogEntry.error.code` 保持开放 string，
 * 这里只列前端 UI 已知的典型值用于配色 / 国际化映射；遇到未知码走默认配色。
 */
export const KNOWN_LOG_ERROR_CODES = [
  'upstream_5xx',
  'upstream_4xx',
  'upstream_timeout',
  'rate_limited',
  'context_too_long',
  'cancelled',
  'auth_failed',
  'unknown',
] as const;
export type KnownLogErrorCode = (typeof KNOWN_LOG_ERROR_CODES)[number];

export const LogErrorCodeLabel: Readonly<Record<KnownLogErrorCode, string>> = {
  upstream_5xx: '上游 5xx',
  upstream_4xx: '上游 4xx',
  upstream_timeout: '上游超时',
  rate_limited: '被限流',
  context_too_long: '上下文超长',
  cancelled: '已取消',
  auth_failed: '鉴权失败',
  unknown: '未知错误',
};

/**
 * 日志对应账单的状态（精简版）。完整枚举见 `docs/api/05-billing-bills.md`；
 * demuxai 调用日志这面只需区分是否被驳回：`completed`（已扣费）/ `reversed`（已驳回）。
 */
export const billStatusValues = ['completed', 'reversed'] as const;
export type BillStatus = (typeof billStatusValues)[number];

export const BillStatusLabel: Readonly<Record<BillStatus, string>> = {
  completed: '已扣费',
  reversed: '已驳回',
};

/**
 * 账单驳回原因码（与 `docs/api/05-billing-bills.md` 的 `reversedCode` 完全一致）。
 * 必须是预设枚举，禁止自由文本——财务对账 / BI 聚合按此维度 group by。
 */
export const billReverseCodeValues = [
  'duplicate_charge',
  'metering_error',
  'service_unavailable',
  'customer_compensation',
  'manual_correction',
] as const;
export type BillReverseCode = (typeof billReverseCodeValues)[number];

export const BillReverseCodeLabel: Readonly<Record<BillReverseCode, string>> = {
  duplicate_charge: '重复扣费',
  metering_error: '计量错误',
  service_unavailable: '服务不可用',
  customer_compensation: '客户补偿',
  manual_correction: '人工纠错',
};

/** 驳回原因码的简要说明，提示 admin 该场景何时使用 */
export const BillReverseCodeHint: Readonly<Record<BillReverseCode, string>> = {
  duplicate_charge: '同一次调用被重复入账',
  metering_error: '上游 / 网关上报 token 数错误，导致计费偏差',
  service_unavailable: '调用本身失败但仍扣了费（最常见的驳回场景）',
  customer_compensation: '客服补偿 / SLA 赔付，与计费正确性无关',
  manual_correction: '其它需要人工纠错的场景（兜底）',
};

export const apiTypeSchema = z.enum(apiTypeValues);
export const providerStatusSchema = z.enum(providerStatusValues);
export const modelFamilySchema = z.enum(modelFamilyValues);
export const modelCapabilitySchema = z.enum(modelCapabilityValues);
export const billingTypeSchema = z.enum(billingTypeValues);
export const billStatusSchema = z.enum(billStatusValues);
export const billReverseCodeSchema = z.enum(billReverseCodeValues);
