import { z } from 'zod';

import { epochMillisSchema } from './lib/epoch';
import { uidString } from './lib/uid';
import type { BillingType } from './enums';

/**
 * 模型定价（discriminated union）。与 Model 是 1..1：每个 modelId 一条 Rate 记录。
 * 顶层 `billingType` 是判别字段；`rate` 嵌套对象的形状随 `billingType` 变化。
 * 金额单位与钱包同币种（默认元）。
 */

// ---------- rate 子形状（按 billingType） ----------

/** `per_token` 单价 schema —— 单位：元 / 1M tokens。结构与 `log.cost.input/output` 对称。 */
export const perTokenRateSchema = z.object({
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
export type PerTokenRate = z.infer<typeof perTokenRateSchema>;

export const perCallRateSchema = z.object({
  pricePerCall: z.number().nonnegative(),
  cachedPricePerCall: z.number().nonnegative().optional(),
});
export type PerCallRate = z.infer<typeof perCallRateSchema>;

export const perImageTierSchema = z.object({
  /** 例：`"1024x1024"` / `"1792x1024"` */
  size: z.string().min(1),
  /** 例：`"standard"` / `"hd"` / `"draft"`；单档模型填 `"default"`。 */
  quality: z.string().min(1),
  pricePerImage: z.number().nonnegative(),
});
export type PerImageTier = z.infer<typeof perImageTierSchema>;

export const perImageRateSchema = z
  .object({ tiers: z.array(perImageTierSchema).min(1) })
  .refine(
    (v) => {
      const keys = v.tiers.map((t) => `${t.size}|${t.quality}`);
      return new Set(keys).size === keys.length;
    },
    { message: 'per_image.tiers 不允许 (size, quality) 重复', path: ['tiers'] },
  );
export type PerImageRate = z.infer<typeof perImageRateSchema>;

export const perVideoTierSchema = z.object({
  /** 例：`"720p"` / `"1080p"` / `"4k"` */
  resolution: z.string().min(1),
  pricePerSecond: z.number().nonnegative(),
});
export type PerVideoTier = z.infer<typeof perVideoTierSchema>;

export const perVideoRateSchema = z
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
export type PerVideoRate = z.infer<typeof perVideoRateSchema>;

export const perAudioMinuteRateSchema = z.object({
  pricePerMinute: z.number().nonnegative(),
});
export type PerAudioMinuteRate = z.infer<typeof perAudioMinuteRateSchema>;

export const perCharacterRateSchema = z.object({
  pricePerKChar: z.number().nonnegative(),
});
export type PerCharacterRate = z.infer<typeof perCharacterRateSchema>;

// ---------- billingType ↔ rate 形状的 union 组装 ----------

/**
 * 把「共通字段」与六种 `rate` 形状拼成 discriminated union。
 * Rate / ModelPrice / 各类 upsert 入参共用同一份 `rate` 形状，只差外层字段，
 * 所以这里只写一次，不再手抄六行。
 */
function withRateUnion<TShape extends z.ZodRawShape>(shape: TShape) {
  return z.discriminatedUnion('billingType', [
    z.object({ ...shape, billingType: z.literal('per_token'), rate: perTokenRateSchema }),
    z.object({ ...shape, billingType: z.literal('per_call'), rate: perCallRateSchema }),
    z.object({ ...shape, billingType: z.literal('per_image'), rate: perImageRateSchema }),
    z.object({ ...shape, billingType: z.literal('per_video'), rate: perVideoRateSchema }),
    z.object({
      ...shape,
      billingType: z.literal('per_audio_minute'),
      rate: perAudioMinuteRateSchema,
    }),
    z.object({ ...shape, billingType: z.literal('per_character'), rate: perCharacterRateSchema }),
  ]);
}

/** 只含 `billingType` + `rate` 的最小 union；编辑表单产出物、拉价候选都用它。 */
export const rateBodySchema = withRateUnion({});
export type RateBody = z.infer<typeof rateBodySchema>;

// ---------- 有效价（vendor_rates）外层共通字段 ----------

const rateBaseShape = {
  /** 定价行主键（PRC-*）。 */
  id: uidString,
  /** 与 Model.modelId 强一致；删除 Model 必须级联删 Rate。 */
  modelId: z.string().min(1),
  currency: z.string(),
  /**
   * 编译审计：这条有效价由哪条基准价 × 哪个倍率算出来。
   * 手工写入的有效价两者皆空。
   */
  sourcePriceId: uidString.nullable().optional(),
  multiplierApplied: z.number().nullable().optional(),
  /** 生效时间（UTC）；未来时间 = 预生效。 */
  effectiveFromUtc: epochMillisSchema,
  updatedAtUtc: epochMillisSchema,
  /** 最近一次改动操作人（IAM userId；对应后端 wire `iamUserUid`，由 adapter 映射） */
  updatedBy: z.object({ iamUid: uidString }).nullable().optional(),
};

// ---------- 主 schema（discriminated union） ----------

export const rateSchema = withRateUnion(rateBaseShape);

export type Rate = z.infer<typeof rateSchema>;

// ---------- Upsert 入参（同形状，去掉 id / updatedAtUtc / updatedBy / 审计列） ----------

/**
 * 币种和生效时间都不让调用方传：币种永远是 `PRICE_CURRENCY`，
 * 生效时间就是后端落库那一刻——让人在表单里挑一个「未来生效」只会写出对不上账的价。
 */
const upsertBaseShape = {
  modelId: z.string().min(1),
};

export const upsertRateInputSchema = withRateUnion(upsertBaseShape);

export type UpsertRateInput = z.infer<typeof upsertRateInputSchema>;

// ---------- 基准价表（model_prices） ----------

/**
 * 有效价 / 账单币种。价格表是美元，编译时 × 渠道倍率 × 路由倍率，最后 × `USD_CNY_FIXED_RATE`。
 */
export const PRICE_CURRENCY = 'CNY' as const;

/** 价格表 / model_prices 币种。官方源怎么报就怎么收，这里不折人民币。 */
export const MODEL_PRICE_CURRENCY = 'USD' as const;

/** 固定汇率 1 USD = 7 CNY。只在编译有效价时乘，不做运行期配置。 */
export const USD_CNY_FIXED_RATE = 7 as const;

/**
 * 官方价来源。价格表登记的是厂家官方定价，所以来源只有官方源这几种；
 * 运营自己敲进去的价没有「来源」可标，`source` 落成官方源之外的任何值都按未知处理、不展示。
 */
export const priceSourceKindValues = ['models_dev', 'openrouter', 'litellm', 'newapi'] as const;
export type PriceSourceKind = (typeof priceSourceKindValues)[number];

export const PriceSourceKindLabel: Record<PriceSourceKind, string> = {
  models_dev: 'models.dev',
  openrouter: 'OpenRouter',
  litellm: 'LiteLLM',
  newapi: 'NewAPI',
};

export const modelCapabilitiesSchema = z.object({
  audio: z.boolean().default(false),
  reasoning: z.boolean().default(false),
  /** 向量化 / embedding：只按输入 token 计，没有出、也没有缓存档。 */
  embedding: z.boolean().default(false),
});

export type ModelCapabilities = z.infer<typeof modelCapabilitiesSchema>;

const modelPriceBaseShape = {
  id: uidString,
  /** 上游模型注册名的规范化键（小写、trim），与 vendor_routes.vendor_model 对齐。 */
  modelKey: z.string().min(1),
  /** 模型厂家键（openai / anthropic / …，见 maker.ts）；价格表按它分组、按它拉官方价。 */
  maker: z.string().min(1),
  /** 永远是 `MODEL_PRICE_CURRENCY`；保留字段只为让 wire 自描述。 */
  currency: z.literal(MODEL_PRICE_CURRENCY),
  /**
   * 模型能力，官方目录带过来的，不由人挑。
   * `audio` / `reasoning` 决定录价放出哪些档；`embedding` 决定类型列是「向量」且只收入价。
   * 为空 = 这条是手加的、没有目录信息。
   */
  capabilities: modelCapabilitiesSchema.nullable().optional(),
  /** 官方源标识；不在 `priceSourceKindValues` 内的值也接受（后端可能新增源），前端不认就不展示。 */
  source: z.string(),
  sourceRef: z.string().nullable().optional(),
  fetchedAtUtc: epochMillisSchema.nullable().optional(),
  effectiveFromUtc: epochMillisSchema,
};

export const modelPriceSchema = withRateUnion(modelPriceBaseShape);
export type ModelPrice = z.infer<typeof modelPriceSchema>;

/**
 * 录入基准价：金额一律按美元填，没有币种、也没有生效时间——后端以落库时间为生效时间。
 * `maker` 不传时后端按键推断。
 */
const upsertModelPriceBaseShape = {
  modelKey: z.string().min(1),
  maker: z.string().optional(),
  /** 手加向量化时带上；已有行改价不动目录给的 capabilities。 */
  capabilities: modelCapabilitiesSchema.optional(),
  source: z.string().optional(),
  sourceRef: z.string().nullable().optional(),
  reason: z.string().nullable().optional(),
};

export const upsertModelPriceInputSchema = withRateUnion(upsertModelPriceBaseShape);
export type UpsertModelPriceInput = z.infer<typeof upsertModelPriceInputSchema>;

/**
 * 价格表按厂家分好的一组。
 *
 * 只有厂家发布的模型，没有「某个别名还没映射上」这类路由侧的缺口——方向是模型名映射到价格表，
 * 价格表不反过来跟着下游用了什么名字走。缺口在模型页按路由列。
 */
export interface ModelPriceMakerGroup {
  maker: string;
  items: ModelPrice[];
}

// ---------- 倍率 / 编译 ----------

/** 路由有效价的来路：渠道定价（价格表 × 渠道倍率）/ 管理员自己写。 */
export const routePricingModeValues = ['compiled', 'manual'] as const;
export type RoutePricingMode = (typeof routePricingModeValues)[number];

export const RoutePricingModeLabel: Record<RoutePricingMode, string> = {
  compiled: '渠道定价',
  manual: '自定义',
};

export interface PriceCompileResult {
  compiled: number;
  unchanged: number;
  /** 有 Compiled 路由在用、但价格表里没有基准价的模型键。 */
  unmatchedModelKeys: string[];
  newVersion: number | null;
}

export interface ModelPriceWriteResult {
  price: ModelPrice;
  compile: PriceCompileResult;
}

// ---------- 拉取官方价 ----------

export interface PriceSourceSpec {
  kind: PriceSourceKind;
  /** openrouter / newapi 可自定义实例地址。 */
  baseUrl?: string | null;
  apiKey?: string | null;
  /** 展示名，多实例 newapi 时区分。 */
  name?: string | null;
}

export interface FetchPricesInput {
  sources: PriceSourceSpec[];
  /** 只拉这些厂家的模型；空 = 不按厂家过滤。价格表分组里的「拉取 OpenAI 官方价」就是传 `['openai']`。 */
  makers?: string[];
  /** 只看这些模型键；空 = 在用的 + 已定价的全部。 */
  modelKeys?: string[];
  /** 只返回至少有一个候选的模型键。 */
  onlyMatched?: boolean;
  timeoutSeconds?: number;
}

export interface FetchSourceStatus {
  kind: string;
  name: string;
  ok: boolean;
  error: string | null;
  candidateCount: number;
  elapsedMs: number;
}

/**
 * 某个源对某个模型键给出的报价。`rate` 已按本地 rate_json 形状归一，**且是美元**：
 * 价格表不折人民币；`sourceCurrency` 几乎总是 USD，`fxApplied` 为 1（源报 CNY 时为 1/7）。
 */
export type FetchCandidate = RateBody & {
  sourceKind: string;
  sourceName: string;
  sourceRef: string;
  /** 源里给出的厂家（已归一成 maker 键）。 */
  maker: string;
  modelId: string;
  /** exact / normalized / fuzzy —— 匹配到本地键用的是哪一档。 */
  matchKind: string;
  /** 源报价的原币种（几乎总是 USD）。 */
  sourceCurrency: string;
  /** 收到价格表时施加的倍数；USD 源为 1，CNY 源为 1/7。 */
  fxApplied: number;
  /** 与当前基准价（美元）数值相同。 */
  sameAsCurrent: boolean;
  /** 官方目录带来的能力；套用时原样回传，避免只从 rate JSON 再猜一遍。 */
  capabilities?: ModelCapabilities | null;
};

export interface FetchPriceItem {
  modelKey: string;
  /** 本地对这个键的厂家判断（已在价格表里的取它的 maker，否则按键推断）。 */
  maker: string;
  current: ModelPrice | null;
  candidates: FetchCandidate[];
}

export interface FetchPricesResult {
  sources: FetchSourceStatus[];
  items: FetchPriceItem[];
  fetchedAtUtc: number;
}

/** 套用候选：`rate` 就是 fetch 返回的美元数值，原样回传；`maker` 取候选里源给出的厂家。 */
export type ApplyPriceItem = RateBody & {
  modelKey: string;
  maker: string;
  sourceKind: string;
  sourceRef: string;
  capabilities?: ModelCapabilities | null;
};

export interface ApplyPricesInput {
  items: ApplyPriceItem[];
  reason?: string | null;
}

// ---------- 列表筛选 / 分组 ----------

export interface ListRateFilter {
  /** 模糊匹配 modelId */
  keyword: string;
  billingType: BillingType | 'all';
}

export interface RouteRateEntry {
  routeKey: string;
  rate: Rate;
  /** 路由主键；切换定价模式 / 改路由倍率要用。旧后端不下发时为 null。 */
  routeId: string | null;
  pricingMode: RoutePricingMode;
  /** 路由级倍率覆盖；null = 只用渠道倍率。 */
  priceMultiplier: number | null;
}

export interface VendorModelGroup {
  vendorKey: string;
  vendorModel: string;
  routeKeys: RouteRateEntry[];
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

export interface VendorRateStatsEntry {
  configured: number;
  unconfigured: number;
}

export type VendorRateStatsMap = Record<string, VendorRateStatsEntry>;

export interface UnconfiguredRoute {
  routeKey: string;
  vendorKey: string;
  vendorModel: string;
  /** 切到渠道定价要用；旧后端不下发时为 null。 */
  routeId: string | null;
}

export interface UnconfiguredRoutePage {
  items: UnconfiguredRoute[];
  total: number;
}
