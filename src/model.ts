import { z } from 'zod';

import { epochMillisSchema } from './lib/epoch';
import { uidString } from './lib/uid';
import {
  modelCapabilitySchema,
  modelFamilySchema,
  type ModelCapability,
  type ModelFamily,
} from './enums';

/**
 * 平台层 Model 条目（`provider_model_mappings.display_name` 的全局视图）。
 * 生命周期完全由 Provider 映射驱动；前端无直接 create / delete 入口，也无 `enabled` 开关。
 * `modelId` = `displayName`，是用户请求体里的 `model` 字段（也是计费 / 配额主键）。
 */
export const modelSchema = z.object({
  uid: uidString,
  modelId: z.string().min(1).max(128),
  displayName: z.string(),
  family: modelFamilySchema,
  capabilities: z.array(modelCapabilitySchema),
  /** 最低可见 LV，默认 1（所有人可见） */
  visibleMinTier: z.number().int().min(1).max(99),
  /** 上下文窗口，单位 tokens */
  maxContextTokens: z.number().int().positive(),
  /** 单次响应上限，单位 tokens；不设置时 = maxContextTokens */
  maxOutputTokens: z.number().int().positive().nullable().optional(),
  supportsStreaming: z.boolean(),
  supportsFunctionCall: z.boolean(),
  description: z.string().nullable().optional(),
  /** 所属渠道（BFF `ModelMetaAdminDto.vendorName`） */
  vendorName: z.string().optional(),
  createdAtUtc: epochMillisSchema,
  updatedAtUtc: epochMillisSchema,
});

export type Model = z.infer<typeof modelSchema>;

export interface ModelCarrierEntry {
  providerUid: string;
  providerName: string;
  modelName: string;
  mappingWeight: number;
  enabled: boolean;
}

export type ModelCarriersMap = Record<string, ModelCarrierEntry[]>;

export interface UpdateModelInput {
  displayName?: string;
  family?: ModelFamily;
  capabilities?: ModelCapability[];
  visibleMinTier?: number;
  maxContextTokens?: number;
  maxOutputTokens?: number | null;
  supportsStreaming?: boolean;
  supportsFunctionCall?: boolean;
  description?: string | null;
}

export interface ListModelsFilter {
  /** 模糊匹配 modelId / displayName */
  keyword: string;
  family: ModelFamily | 'all';
  capability: ModelCapability | 'all';
}
