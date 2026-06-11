import { z } from 'zod';

import { epochMillisNullableSchema, epochMillisSchema } from './lib/epoch';
import { uidString } from './lib/uid';
import {
  apiTypeSchema,
  modelCapabilitySchema,
  modelFamilySchema,
  providerStatusSchema,
  type ApiType,
  type ModelCapability,
  type ModelFamily,
  type ProviderStatus,
} from './enums';

/**
 * `provider_model`：归属某 Provider 的「上游模型实体」。
 * `modelName` 是上游 HTTP 请求体里的 `model` 字段；其余是模型技术属性。
 */
export const providerModelSchema = z.object({
  uid: uidString,
  modelName: z.string().min(1).max(128),
  family: modelFamilySchema,
  capabilities: z.array(modelCapabilitySchema),
  visibleMinTier: z.number().int().min(1).max(99),
  maxContextTokens: z.number().int().positive(),
  maxOutputTokens: z.number().int().positive().nullable().optional(),
});
export type ProviderModel = z.infer<typeof providerModelSchema>;

/**
 * `provider_model_mappings`：Provider 下的「对外上架条目」。
 * 通过 `providerModelUid` 指向同一 Provider 内的某个 `ProviderModel`；
 * `displayName` 是对终端用户展示的名称，与上游 `modelName` 解耦。
 */
export const providerModelMappingSchema = z.object({
  uid: uidString,
  providerModelUid: uidString,
  displayName: z.string().min(1).max(128),
  enabled: z.boolean(),
  notes: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
  /** 多条映射共存时的相对权重（100 为中立默认） */
  mappingWeight: z.number().int().positive().optional(),
});
export type ProviderModelMapping = z.infer<typeof providerModelMappingSchema>;

/**
 * 模型渠道（上游凭据 + 模型实体 + 上架映射）。
 * `apiKeyMasked` 是脱敏快照；完整密钥仅写入时存在内存，管理台从不展示原文。
 * `auto_disabled` 由 BFF 调度侧自动写入，恢复必须人工 `setStatus('enabled')`。
 */
export const providerSchema = z.object({
  /** 数据库自增主键（int）。业务唯一标识仍是 `uid`；高吞吐日志 / 调度统计用 `id` 作外键。 */
  id: z.number().int().positive(),
  uid: uidString,
  /** 渠道名称（全局唯一，用户只填这一项） */
  name: z.string().min(1).max(128),
  apiType: apiTypeSchema,
  baseUrl: z.string(),
  /** 脱敏快照，仅展示用；真实密钥不出 BFF。 */
  apiKeyMasked: z.string(),
  /** 备注，≤ 500 字 */
  notes: z.string().nullable().optional(),
  status: providerStatusSchema,
  /** auto_disabled 时填，枚举码：`upstream_5xx_burst` / `auth_failed` / `quota_exceeded` 等。 */
  autoDisabledCode: z.string().nullable().optional(),
  /** 最近一次 ping 延迟，仅参考。 */
  testLatencyMs: z.number().int().nullable().optional(),
  testSucceededAtUtc: epochMillisNullableSchema.optional(),
  /** 24h 错误率（0..1），由 BFF 聚合写回。 */
  errorRate24h: z.number().min(0).max(1).optional(),
  /** 24h 调用次数，用于 UI 排序参考 */
  callCount24h: z.number().int().nonnegative().optional(),
  /** 模型渠道内登记的「上游模型实体」（per upstream model_name） */
  providerModels: z.array(providerModelSchema),
  /** 对外上架映射（displayName → providerModel） */
  modelMappings: z.array(providerModelMappingSchema),
  createdAtUtc: epochMillisSchema,
  updatedAtUtc: epochMillisSchema,
});

export type Provider = z.infer<typeof providerSchema>;

/** 草稿态的 ProviderModel —— 表单里临时维护用。 */
export interface ProviderModelDraft {
  uid: string;
  modelName: string;
  family: ModelFamily;
  capabilities: ModelCapability[];
  visibleMinTier: number;
  maxContextTokens: number;
  maxOutputTokens?: number | null;
}

/** 草稿态的 ProviderModelMapping。 */
export interface ProviderModelMappingDraft {
  uid?: string;
  providerModelUid: string;
  displayName: string;
  enabled: boolean;
  notes?: string | null;
  sortOrder?: number;
  mappingWeight?: number;
}

export interface CreateProviderInput {
  name: string;
  apiType: ApiType;
  baseUrl: string;
  /** 写入时是明文，BFF 入库前 hash + 加密；前端绝不缓存。 */
  apiKey: string;
  notes?: string | null;
  providerModels: ProviderModelDraft[];
  modelMappings: ProviderModelMappingDraft[];
}

export interface UpdateProviderInput {
  name?: string;
  baseUrl?: string;
  /** 不变更密钥时省略；为空字符串视为"清空"，仅在解绑场景使用。 */
  apiKey?: string;
  notes?: string | null;
  /** 整体覆盖式提交：传入的就是「当前保存意图下的全集」。BFF 端 diff 出增 / 改 / 删。 */
  providerModels?: ProviderModelDraft[];
  modelMappings?: ProviderModelMappingDraft[];
}

export interface ProviderTestResult {
  /** 整体连通性 */
  ok: boolean;
  latencyMs: number;
  /** 探测时拉取到的可用模型列表（用于建议拉取） */
  reachableModelNames: string[];
  /** 失败时的枚举码 */
  errorCode?: string;
  errorMessage?: string;
}

export interface FetchUpstreamModelsResult {
  /** 上游 `/v1/models` 返回的 `model` 技术名列表（= `provider_model.model_name`） */
  upstreamModelNames: string[];
}

export interface ListProvidersFilter {
  /** 模糊匹配 name / baseUrl */
  keyword: string;
  apiType: ApiType | 'all';
  status: ProviderStatus | 'all';
}

/** 调度自动停用枚举码（前端只做 i18n 映射，绝不存自由文本） */
export const providerAutoDisabledCodeLabel: Readonly<Record<string, string>> = {
  upstream_5xx_burst: '上游 5xx 突发',
  auth_failed: '认证失败',
  quota_exceeded: '额度耗尽',
  network_unreachable: '网络不可达',
  rate_limited: '上游限流',
  manual_recovery_required: '需人工恢复',
};
