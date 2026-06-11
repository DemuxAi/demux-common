import { z } from 'zod';

import { epochMillisSchema } from './lib/epoch';
import { uidString } from './lib/uid';
import type { BillingType } from './enums';

/**
 * 模型定价（discriminated union）。与 Model 是 1..1：每个 modelId 一条 Pricing 记录。
 * 顶层 `billingType` 是判别字段；`pricing` 嵌套对象的形状随 `billingType` 变化。
 * 金额单位与钱包同币种（默认元）。
 */

// ---------- pricing 子形状（按 billingType） ----------

/** `per_token` 单价 schema —— 单位：元 / 1M tokens。结构与 `log.cost.input/output` 对称。 */
export const perTokenPricingSchema = z.object({
  input: z.object({
    perMToken: z.number().nonnegative(),
    cachedRead: z.number().nonnegative().optional(),
    cachedWrite: z.number().nonnegative().optional(),
    audio: z.number().nonnegative().optional(),
  }),
  output: z.object({
    perMToken: z.number().nonnegative(),
    reasoning: z.number().nonnegative().optional(),
    audio: z.number().nonnegative().optional(),
  }),
});
export type PerTokenPricing = z.infer<typeof perTokenPricingSchema>;

export const perCallPricingSchema = z.object({
  pricePerCall: z.number().nonnegative(),
  cachedPricePerCall: z.number().nonnegative().optional(),
});
export type PerCallPricing = z.infer<typeof perCallPricingSchema>;

export const perImageTierSchema = z.object({
  /** 例：`"1024x1024"` / `"1792x1024"` */
  size: z.string().min(1),
  /** 例：`"standard"` / `"hd"` / `"draft"`；单档模型填 `"default"`。 */
  quality: z.string().min(1),
  pricePerImage: z.number().nonnegative(),
});
export type PerImageTier = z.infer<typeof perImageTierSchema>;

export const perImagePricingSchema = z
  .object({ tiers: z.array(perImageTierSchema).min(1) })
  .refine(
    (v) => {
      const keys = v.tiers.map((t) => `${t.size}|${t.quality}`);
      return new Set(keys).size === keys.length;
    },
    { message: 'per_image.tiers 不允许 (size, quality) 重复', path: ['tiers'] },
  );
export type PerImagePricing = z.infer<typeof perImagePricingSchema>;

export const perVideoTierSchema = z.object({
  /** 例：`"720p"` / `"1080p"` / `"4k"` */
  resolution: z.string().min(1),
  pricePerSecond: z.number().nonnegative(),
});
export type PerVideoTier = z.infer<typeof perVideoTierSchema>;

export const perVideoPricingSchema = z
  .object({
    tiers: z.array(perVideoTierSchema).min(1),
    minSeconds: z.number().positive().optional(),
    maxSeconds: z.number().positive().optional(),
  })
  .refine((v) => new Set(v.tiers.map((t) => t.resolution)).size === v.tiers.length, {
    message: 'per_video.tiers 不允许 resolution 重复',
    path: ['tiers'],
  })
  .refine((v) => v.minSeconds == null || v.maxSeconds == null || v.minSeconds <= v.maxSeconds, {
    message: 'minSeconds 必须 ≤ maxSeconds',
    path: ['maxSeconds'],
  });
export type PerVideoPricing = z.infer<typeof perVideoPricingSchema>;

export const perAudioMinutePricingSchema = z.object({
  pricePerMinute: z.number().nonnegative(),
});
export type PerAudioMinutePricing = z.infer<typeof perAudioMinutePricingSchema>;

export const perCharacterPricingSchema = z.object({
  pricePerKChar: z.number().nonnegative(),
});
export type PerCharacterPricing = z.infer<typeof perCharacterPricingSchema>;

// ---------- 外层共通字段 ----------

const pricingBaseShape = {
  /** 定价行主键（PRC-*）。 */
  id: uidString,
  /** 与 Model.modelId 强一致；删除 Model 必须级联删 Pricing。 */
  modelId: z.string().min(1),
  currency: z.string(),
  /** key 是 LV 字符串，value 是该 LV 的倍率（如 `"5" → 0.7`）。 */
  tierMultipliers: z.record(z.string(), z.number().positive()),
  /** 生效时间（UTC）；未来时间 = 预生效。 */
  effectiveFromUtc: epochMillisSchema,
  updatedAtUtc: epochMillisSchema,
  /** 最近一次改动操作人（IAM userId；对应后端 wire `iamUserUid`，由 adapter 映射） */
  updatedBy: z.object({ iamUid: uidString }).nullable().optional(),
};

// ---------- 主 schema（discriminated union） ----------

export const pricingSchema = z.discriminatedUnion('billingType', [
  z.object({ ...pricingBaseShape, billingType: z.literal('per_token'), pricing: perTokenPricingSchema }),
  z.object({ ...pricingBaseShape, billingType: z.literal('per_call'), pricing: perCallPricingSchema }),
  z.object({ ...pricingBaseShape, billingType: z.literal('per_image'), pricing: perImagePricingSchema }),
  z.object({ ...pricingBaseShape, billingType: z.literal('per_video'), pricing: perVideoPricingSchema }),
  z.object({
    ...pricingBaseShape,
    billingType: z.literal('per_audio_minute'),
    pricing: perAudioMinutePricingSchema,
  }),
  z.object({ ...pricingBaseShape, billingType: z.literal('per_character'), pricing: perCharacterPricingSchema }),
]);

export type Pricing = z.infer<typeof pricingSchema>;

// ---------- Upsert 入参（同形状，去掉 id / updatedAtUtc / updatedBy） ----------

const upsertBaseShape = {
  modelId: z.string().min(1),
  currency: z.string(),
  tierMultipliers: z.record(z.string(), z.number().positive()),
  effectiveFromUtc: epochMillisSchema,
};

export const upsertPricingInputSchema = z.discriminatedUnion('billingType', [
  z.object({ ...upsertBaseShape, billingType: z.literal('per_token'), pricing: perTokenPricingSchema }),
  z.object({ ...upsertBaseShape, billingType: z.literal('per_call'), pricing: perCallPricingSchema }),
  z.object({ ...upsertBaseShape, billingType: z.literal('per_image'), pricing: perImagePricingSchema }),
  z.object({ ...upsertBaseShape, billingType: z.literal('per_video'), pricing: perVideoPricingSchema }),
  z.object({
    ...upsertBaseShape,
    billingType: z.literal('per_audio_minute'),
    pricing: perAudioMinutePricingSchema,
  }),
  z.object({ ...upsertBaseShape, billingType: z.literal('per_character'), pricing: perCharacterPricingSchema }),
]);

export type UpsertPricingInput = z.infer<typeof upsertPricingInputSchema>;

// ---------- 列表筛选 / 分组 ----------

export interface ListPricingFilter {
  /** 模糊匹配 modelId */
  keyword: string;
  billingType: BillingType | 'all';
}

export interface AliasPricingEntry {
  alias: string;
  pricing: Pricing;
}

export interface VendorModelGroup {
  vendorKey: string;
  vendorModel: string;
  aliases: AliasPricingEntry[];
}

export interface VendorModelGroupedPage {
  groups: VendorModelGroup[];
  total: number;
}

export interface ListVendorModelGroupsFilter {
  vendorKey: string | 'all';
  keyword: string;
  billingType: BillingType | 'all';
}

export interface VendorPricingStatsEntry {
  configured: number;
  unconfigured: number;
}

export type VendorPricingStatsMap = Record<string, VendorPricingStatsEntry>;

export interface UnconfiguredAlias {
  alias: string;
  vendorKey: string;
  vendorModel: string;
}

export interface UnconfiguredAliasPage {
  items: UnconfiguredAlias[];
  total: number;
}
