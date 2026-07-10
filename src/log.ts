import { z } from 'zod';

import { epochMillisSchema } from './lib/epoch';
import { uidString } from './lib/uid';
import {
  aiUsageStatusSchema,
  apiTypeSchema,
  billingTypeSchema,
  billReverseCodeSchema,
  type ApiType,
  type BillReverseCode,
} from './enums';

/**
 * 调用日志单条（对应后端 `AiUsageLogDto`，wire camelCase）。
 *
 * 设计要点：
 *  - `id`：本条日志主键（snowflake）；与账户域的 `uid`（userId）区分
 *  - `account: { uid, iamUid }`：租户身份——`uid` 是主账户 userId（扣费主体），
 *    `iamUid` 是 IAM 子账户 userId（实际调用者）；对应后端 `LogAccountDto.iamUserUid`（adapter 映射改名）
 *  - `providerId` 是**供应商表的 int 主键**（非 string UID）
 *  - `modelName` 即用户请求体里的 `model` 字段（对外别名），快照字段
 *  - **`billingType` 是判别字段**：`usage` / `cost` 的形状随它变化
 *  - **`tokenLatency` 语义按 `streamed` 切换**（ms）：流式=首字延迟(TTFT)，非流式=端到端；失败为 null
 *  - **`success`** 表达成败二元；**`status`** 是更细的结算态（pending/success/failure/cancelled）
 */

// ---------- usage 子形状（按 billingType） ----------

/**
 * `per_token` 用量快照——按 input / output 父子集分组，子维度自然嵌进父集；
 * 顶层 `totalTokens` 是冗余总和，方便聚合查询走索引。全部 required，未触发维度写 0。
 */
export const perTokenUsageSchema = z.object({
  totalTokens: z.number().int().nonnegative(),
  input: z.object({
    tokens: z.number().int().nonnegative(),
    cachedReadTokens: z.number().int().nonnegative(),
    cachedWriteTokens: z.number().int().nonnegative(),
    audioTokens: z.number().int().nonnegative(),
  }),
  output: z.object({
    tokens: z.number().int().nonnegative(),
    reasoningTokens: z.number().int().nonnegative(),
    audioTokens: z.number().int().nonnegative(),
  }),
});
export type PerTokenUsage = z.infer<typeof perTokenUsageSchema>;

/**
 * `per_call` 用量快照。计费按"次"，但底层多半仍是 LLM 调用，照样消耗 token。
 * 故只记录上游回报的 token 明细，仅供观测 / 对账，**不参与扣费**。老数据未带明细时各项回退 0。
 */
export const perCallUsageSchema = z.object({
  input: z
    .object({
      tokens: z.number().int().nonnegative(),
      cachedReadTokens: z.number().int().nonnegative(),
      cachedWriteTokens: z.number().int().nonnegative(),
      audioTokens: z.number().int().nonnegative(),
    })
    .default({ tokens: 0, cachedReadTokens: 0, cachedWriteTokens: 0, audioTokens: 0 }),
  output: z
    .object({
      tokens: z.number().int().nonnegative(),
      reasoningTokens: z.number().int().nonnegative(),
      audioTokens: z.number().int().nonnegative(),
    })
    .default({ tokens: 0, reasoningTokens: 0, audioTokens: 0 }),
});
export type PerCallUsage = z.infer<typeof perCallUsageSchema>;

export const perImageUsageSchema = z.object({
  tier: z.object({ size: z.string().min(1), quality: z.string().min(1) }),
  count: z.number().int().positive(),
});
export type PerImageUsage = z.infer<typeof perImageUsageSchema>;

export const perVideoUsageSchema = z.object({
  tier: z.object({ resolution: z.string().min(1) }),
  seconds: z.number().nonnegative(),
});
export type PerVideoUsage = z.infer<typeof perVideoUsageSchema>;

export const perAudioMinuteUsageSchema = z.object({
  minutes: z.number().nonnegative(),
});
export type PerAudioMinuteUsage = z.infer<typeof perAudioMinuteUsageSchema>;

export const perCharacterUsageSchema = z.object({
  characters: z.number().int().nonnegative(),
});
export type PerCharacterUsage = z.infer<typeof perCharacterUsageSchema>;

// ---------- cost 子形状（按 billingType） ----------

/** 单一维度的"单价 + 实际扣费"快照对。 */
export const dimensionCostSchema = z.object({
  /** 调用时定价单价快照（元 / 1M tokens；该维度不支持时为 0）。 */
  perMToken: z.number().nonnegative(),
  /** 该维度实际扣费金额（元；未触发为 0）。 */
  amount: z.number().nonnegative(),
});
export type DimensionCost = z.infer<typeof dimensionCostSchema>;

export const perTokenCostSchema = z.object({
  input: z.object({
    perMToken: z.number().nonnegative(),
    amount: z.number().nonnegative(),
    cachedRead: dimensionCostSchema,
    cachedWrite: dimensionCostSchema,
    audio: dimensionCostSchema,
  }),
  output: z.object({
    perMToken: z.number().nonnegative(),
    amount: z.number().nonnegative(),
    reasoning: dimensionCostSchema,
    audio: dimensionCostSchema,
  }),
  /** 总额（所有维度 amount 之和）。 */
  total: z.number().nonnegative(),
});
export type PerTokenCost = z.infer<typeof perTokenCostSchema>;

/** 总额；所有非 token cost 都包含。 */
const costContextShape = {
  total: z.number().nonnegative(),
};

export const perCallCostSchema = z.object({
  /** 命中"非缓存"调用的单价快照（元 / 次）。 */
  pricePerCall: z.number().nonnegative(),
  /** 命中"缓存"调用的单价快照（元 / 次）；该模型不支持 cache 时为 0。 */
  cachedPricePerCall: z.number().nonnegative(),
  ...costContextShape,
});
export type PerCallCost = z.infer<typeof perCallCostSchema>;

export const perImageCostSchema = z.object({
  pricePerImage: z.number().nonnegative(),
  ...costContextShape,
});
export type PerImageCost = z.infer<typeof perImageCostSchema>;

export const perVideoCostSchema = z.object({
  pricePerSecond: z.number().nonnegative(),
  ...costContextShape,
});
export type PerVideoCost = z.infer<typeof perVideoCostSchema>;

export const perAudioMinuteCostSchema = z.object({
  pricePerMinute: z.number().nonnegative(),
  ...costContextShape,
});
export type PerAudioMinuteCost = z.infer<typeof perAudioMinuteCostSchema>;

export const perCharacterCostSchema = z.object({
  pricePerKChar: z.number().nonnegative(),
  ...costContextShape,
});
export type PerCharacterCost = z.infer<typeof perCharacterCostSchema>;

// ---------- LogEntry 共通字段 ----------

const logEntryBaseShape = {
  id: uidString,
  /** 请求链路 TraceId（幂等键 / 账单 idempotency_key）。 */
  traceId: z.string().min(1).nullable().optional(),
  /** 调用发生时间（Unix 毫秒 UTC）。 */
  createAt: epochMillisSchema,
  /**
   * 租户身份聚合对象（对应后端 `LogAccountDto`）：
   * - `uid`：主账户 userId（扣费主体，billing 主键）
   * - `iamUid`：IAM 子账户 userId（实际操作者）；对应后端 wire `iamUserUid`，由 adapter 映射；主账户直接调用时为 null
   */
  account: z.object({
    uid: uidString,
    iamUid: uidString.nullable().optional(),
    /** 账户昵称 / 组织名（BFF enrich 自 Keystone）。 */
    displayName: z.string().nullish(),
    /** 主账户联系邮箱。 */
    email: z.string().nullish(),
    /** 主账户联系手机。 */
    phone: z.string().nullish(),
  }),
  /** 多轮对话的会话 ID；无会话上下文时为 null。 */
  convId: z.string().min(1).nullable().optional(),
  /** 调用来源令牌快照。sk- 后端调用时有 `{ id, name }`；PG 页面直发时为 null（UI 显示 "Chat"）。 */
  token: z
    .object({
      id: uidString,
      name: z.string(),
    })
    .nullable()
    .optional(),
  /** 对外暴露的模型名（= 用户请求体里的 `model` 字段）。 */
  modelName: z.string(),
  /** 命中渠道（供应商组）。来自别名快照绑定；未绑定时为 null。 */
  vendorKey: z.string().nullable().optional(),
  /** 命中的上游真实模型名（vendor_model）。来自别名快照绑定；未绑定时为 null。 */
  vendorModel: z.string().nullable().optional(),
  /** 命中渠道 int 主键；best-effort，上游未能解析时为 null。 */
  providerId: z.number().int().positive().nullable().optional(),
  /** 该次调用走的协议；未知时为 null。 */
  apiType: apiTypeSchema.nullable().optional(),
  /**
   * 单位 ms。语义随 `streamed` 切换：流式=首字延迟(TTFT)，非流式=端到端总耗时，失败=null。
   */
  tokenLatency: z.number().int().nonnegative().nullable(),
  /**
   * 是否调用成功（二元）。`true`→`error` 必为 null；`false`→必有 `error`，从 `error.code` 区分失败原因。
   */
  success: z.boolean(),
  /**
   * 结算状态（比 `success` 二元值表达力更强）。旧后端不下发时为 undefined，
   * UI 回退按 `success` 推断（true→success / false→failure）。
   */
  status: aiUsageStatusSchema.optional(),
  /** `success === true` 时为 null，否则 `{ code, message, httpStatus }`。 */
  error: z
    .object({
      code: z.string().min(1),
      message: z.string().max(512).nullable(),
      httpStatus: z.number().int().nonnegative(),
    })
    .nullable(),
  /** 调用方 IPv4，**网络字节序 uint32**（非点分字符串）；展示用 `formatIpv4`。 */
  clientIpV4: z.number().int().nonnegative().nullable().optional(),
  /** 是否流式 */
  streamed: z.boolean(),
  /**
   * 关联账单（钱包扣费事件）快照。一次成功扣费必有一条 Bill；历史导入 / 未 join 时为 null。
   * 驳回就地改原账单：`status='reversed'` + 嵌套 `reversal` 对象。
   */
  bill: z
    .discriminatedUnion('status', [
      z.object({
        id: z.string().min(1),
        status: z.literal('completed'),
      }),
      z.object({
        id: z.string().min(1),
        status: z.literal('reversed'),
        reversal: z.object({
          atUtc: epochMillisSchema,
          by: z.string().nullable(),
          code: billReverseCodeSchema,
          remark: z.string().nullable().optional(),
        }),
      }),
    ])
    .nullable()
    .optional(),
};

// ---------- LogEntry 主 schema（discriminated union） ----------

export const logEntrySchema = z.discriminatedUnion('billingType', [
  z.object({
    ...logEntryBaseShape,
    billingType: z.literal('per_token'),
    usage: perTokenUsageSchema,
    cost: perTokenCostSchema,
  }),
  z.object({
    ...logEntryBaseShape,
    billingType: z.literal('per_call'),
    usage: perCallUsageSchema,
    cost: perCallCostSchema,
  }),
  z.object({
    ...logEntryBaseShape,
    billingType: z.literal('per_image'),
    usage: perImageUsageSchema,
    cost: perImageCostSchema,
  }),
  z.object({
    ...logEntryBaseShape,
    billingType: z.literal('per_video'),
    usage: perVideoUsageSchema,
    cost: perVideoCostSchema,
  }),
  z.object({
    ...logEntryBaseShape,
    billingType: z.literal('per_audio_minute'),
    usage: perAudioMinuteUsageSchema,
    cost: perAudioMinuteCostSchema,
  }),
  z.object({
    ...logEntryBaseShape,
    billingType: z.literal('per_character'),
    usage: perCharacterUsageSchema,
    cost: perCharacterCostSchema,
  }),
]);

export type LogEntry = z.infer<typeof logEntrySchema>;

export type LogEntryBillingType = z.infer<typeof billingTypeSchema>;

// ---------- Filter / Stats ----------

export interface ListLogsFilter {
  /** 主账户 userId 精确匹配（= `account.uid`） */
  accountUid?: string;
  /** IAM 子账户 userId 精确匹配（= `account.iamUid`）；请求出参由 adapter 映射回后端 wire `iamUserUid`。 */
  iamUid?: string;
  /** 模糊匹配 `modelName` */
  modelName?: string;
  /** 按渠道（供应商组）精确过滤；匹配定价快照绑定的 `vendorKey`。 */
  vendorKey?: string;
  /** 命中渠道的 int 主键（= `Provider.id`） */
  providerId?: number;
  apiType?: ApiType;
  /** 会话 ID 精确匹配 */
  convId?: string;
  /** 调用日志号（`LogEntry.id`）精确匹配 */
  logId?: string;
  /** TraceId 精确匹配 */
  traceId?: string;
  /** 账单 UID（`LogEntry.bill.id` / Commit 流水号）精确匹配 */
  billUid?: string;
  /** 邮箱 / 手机 / 昵称模糊匹配（服务端经账户索引解析后再筛日志） */
  contactKeyword?: string;
  /** 必传时间范围以防全表扫；UI 默认填最近 24h；精确 logId / billUid 检索时可省略 */
  fromUtc?: number;
  toUtc?: number;
  /** 仅看失败调用（`success === false`）。 */
  errorOnly?: boolean;
  /** 精确过滤 `error.code`（仅对失败记录生效）。 */
  errorCode?: string;
}

/** 时间分桶聚合点（按 from-to 跨度自适应桶大小：1h / 1d / etc.） */
export interface LogStatsBucket {
  /** 桶起始时间（Unix 毫秒 UTC） */
  tsUtc: number;
  calls: number;
  errors: number;
  /** 该桶总扣费（元，跨 billingType 累加） */
  cost: number;
  /** 该桶 token 数（仅 per_token 类型 usage.totalTokens 累加） */
  tokens: number;
}

export interface LogStatsTopModel {
  modelName: string;
  calls: number;
  cost: number;
  /** 0-1 */
  errorRate: number;
}

export interface LogStatsTopProvider {
  /** 渠道 int 主键（= `Provider.id`） */
  providerId: number;
  /** 渠道展示名（服务端 join Vendor 解析） */
  providerName?: string;
  calls: number;
  errors: number;
  /** 平均首字延迟（TTFT），仅 `streamed && success` 样本入聚合。单位 ms。 */
  avgTokenLatency: number;
}

export interface LogStatsErrorCode {
  /** 上游 / 网关错误码；缺失时为 `unknown` */
  code: string;
  count: number;
}

export interface LogStats {
  totalCalls: number;
  successCalls: number;
  errorCalls: number;
  /** 平均首字延迟（TTFT），ms。仅 `streamed && success` 样本入聚合。 */
  avgTokenLatency: number;
  /** P95 首字延迟（TTFT），ms（与 avg 同口径）。 */
  p95TokenLatency: number;
  /** 范围内 per_token 类型的 token 求和；非 token 类型不计入。 */
  totalTokens: number;
  /** 范围内总扣费（元）。跨 billingType 可加。 */
  totalCost: number;
  /** 范围内平均 RPM（每分钟调用数，按时间跨度归一） */
  rpm: number;
  /** 桶宽（秒）—— 前端做横轴刻度 / tooltip 用 */
  bucketSizeSec: number;
  /** 时间序列分桶（按 occurredAt 升序） */
  buckets: LogStatsBucket[];
  topModels: LogStatsTopModel[];
  topProviders: LogStatsTopProvider[];
  /** 错误码分布（仅 `success === false`，≤ 5 条；其余合入 `other`） */
  errorCodes: LogStatsErrorCode[];
}

/** 按渠道（供应商组）聚合的消费统计行。 */
export interface VendorConsumptionRow {
  vendorKey: string;
  /** 调用次数（仅成功调用）。 */
  requestCount: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  /** 累计扣费（元）。 */
  totalCost: number;
  /** 该渠道下出现过的上游真实模型数（去重）。 */
  upstreamModelCount: number;
}

/** 驳回单条调用日志对应的账单。 */
export interface ReverseLogInput {
  logId: string;
  reasonCode: BillReverseCode;
  remark?: string;
}

/** 驳回成功后的回执 —— 用于前端就地刷新行状态，避免整页 reload。 */
export interface ReverseLogResult {
  logId: string;
  billId: string;
  reversedAtUtc: number;
  reversedBy: string;
  reversedCode: BillReverseCode;
}
