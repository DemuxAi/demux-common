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
    /** 缓存写，5 分钟档。 */
    cachedWrite: z.number().nonnegative().optional(),
    /** 缓存写，1 小时档。缺省时后端按 5 分钟档 × 1.6（官方两档之比 2x / 1.25x）计。 */
    cachedWrite1h: z.number().nonnegative().optional(),
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

/**
 * 每 1 上游积分的单价（币种随所在表：价格表美元、有效价人民币）。
 * 一次调用折多少积分由上游自己报（可以是 0.028 这种小数），平台从不估算，这里只定每点的钱；
 * 所以它不绑模态——生图、对话、视频模型都可以挂这一种。
 */
export const perCreditRateSchema = z.object({
  pricePerCredit: z.number().nonnegative(),
});
export type PerCreditRate = z.infer<typeof perCreditRateSchema>;

// ---------- billingType ↔ rate 形状的 union 组装 ----------

/**
 * 把「共通字段」与各种 `rate` 形状拼成 discriminated union。
 * Rate / ModelPrice / 各类 upsert 入参共用同一份 `rate` 形状，只差外层字段，
 * 所以这里只写一次，不再每处手抄一遍。
 */
function withRateUnion<TShape extends z.ZodRawShape>(shape: TShape) {
  return z.discriminatedUnion('billingType', [
    z.object({ ...shape, billingType: z.literal('per_token'), rate: perTokenRateSchema }),
    z.object({ ...shape, billingType: z.literal('per_call'), rate: perCallRateSchema }),
    z.object({ ...shape, billingType: z.literal('per_credit'), rate: perCreditRateSchema }),
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

/** 只含 `billingType` + `rate` 的最小 union；编辑表单的产出物用它。 */
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
   * 编译审计：这条有效价由价格表里哪个键的基准价 × 哪个倍率算出来。
   * 价格表是号池管理台发布的，没有行号，按键认行。手工写入的有效价、积分渠道编出来的有效价两者皆空。
   */
  sourceModelKey: z.string().nullable().optional(),
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

// ---------- 价格表（基准价，只读） ----------

/**
 * 有效价 / 账单币种。价格表是美元，编译：美元 × 渠道倍率 = 人民币。不再另乘 7。
 */
export const PRICE_CURRENCY = 'CNY' as const;

/** 价格表的币种。号池管理台发布的就是美元，这里不折人民币。 */
export const MODEL_PRICE_CURRENCY = 'USD' as const;

/** 遗留 CNY 牌价折回美元用 1/7。编译不再自动乘这个数——渠道倍率由渠道自己填。 */
export const USD_CNY_FIXED_RATE = 7 as const;

export const modelCapabilitiesSchema = z.object({
  audio: z.boolean().default(false),
  reasoning: z.boolean().default(false),
  /** 向量化 / embedding：只按输入 token 计，没有出、也没有缓存档。 */
  embedding: z.boolean().default(false),
});

export type ModelCapabilities = z.infer<typeof modelCapabilitiesSchema>;

/**
 * 价格表的一行。价格表不归悠米：它在 OneApi 的号池管理台维护、发布，全站一份，这边只读，
 * 所以没有行号（按 `modelKey` 认行）、没有来源和生效时间，也没有写入用的入参类型。
 */
const modelPriceBaseShape = {
  /** 上游模型注册名的规范化键（小写、trim），与 vendor_routes.vendor_model 对齐；表里唯一。 */
  modelKey: z.string().min(1),
  /** 模型厂家键（openai / anthropic / …，见 maker.ts）；价格表按它分组。 */
  maker: z.string().min(1),
  /** 永远是 `MODEL_PRICE_CURRENCY`；保留字段只为让 wire 自描述。 */
  currency: z.literal(MODEL_PRICE_CURRENCY),
  /**
   * 模型能力，官方目录带过来的，不由人挑。
   * `audio` / `reasoning` 决定价格有哪些档；`embedding` 决定类型列是「向量」且只有入价。
   * 为空 = 这条是手加的、没有目录信息。
   */
  capabilities: modelCapabilitiesSchema.nullable().optional(),
  /**
   * 跟着这条基准价走的在用路由数（继承渠道定价、对到这个键上的；积分渠道的不算）。
   * 只有分页的目录视图填；按厂家分组的视图和单条查询不填，是 0。
   */
  routeCount: z.number().int().nonnegative(),
  /** 号池管理台最后一次改这一行的时间。 */
  updatedAtUtc: epochMillisSchema,
};

export const modelPriceSchema = withRateUnion(modelPriceBaseShape);
export type ModelPrice = z.infer<typeof modelPriceSchema>;

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
  /** 有 Compiled 路由在用、但价格表里没有基准价的模型键。价格表是空的时候不列：空表说明不了哪个模型缺价。 */
  unmatchedModelKeys: string[];
  newVersion: number | null;
  /**
   * 手上没有牌价（没读到、或者号池管理台还没发布）：范围里按牌价出价的路由这一遍都没重算，现有的有效价原样在用。
   * 不是「没有变化」——是没法算。
   */
  priceTableEmpty: boolean;
  /**
   * 对上了、但发布出来的那一行不能用（计价方式不认识、价格形状对不上）的价格表键。
   * 用到它们的路由保留现有的有效价；要到号池管理台把这几行改对。
   */
  invalidPriceKeys: string[];
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
