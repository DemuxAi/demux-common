import { z } from 'zod';

import { epochMillisSchema } from './lib/epoch';
import { uidString } from './lib/uid';
import {
  aiUsageStatusSchema,
  type AiUsageStatus,
  type BillReverseCode,
  type LogProtocol,
} from './enums';

/**
 * 调用日志单条（对应后端 `AiUsageLogDto`，wire camelCase）。
 *
 * 设计要点：
 *  - `id`：本条日志主键（snowflake）；与账户域的 `uid`（userId）区分
 *  - `account: { uid, iamUid }`：租户身份——`uid` 是主账户 userId（扣费主体），
 *    `iamUid` 是 IAM 子账户 userId（实际调用者）；对应后端 `LogAccountDto.iamUserUid`（adapter 映射改名）
 *  - `vendorKey` 是内部渠道键（供应商组 / queue_group），`vendorPlug` 是它对外公开的 slug
 *  - `modelName` 即用户请求体里的 `model` 字段（对外别名），快照字段
 *  - **`billingType` 是判别字段**：`usage` / `cost` 的形状随它变化
 *  - **`content`** 是后端 `usage_logs.content` jsonb 的镜像（协议 / 响应码 / 流式 / 会话 /
 *    耗时 / 来源 IP / 错误），与 `usage` / `cost` 平级；失败原因在 `content.error`
 *  - **`status`** 是成败的唯一真源（pending/success/failure/cancelled），没有单独的 `success` 布尔
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

/**
 * tier 的两个维度不加 `min(1)`：老日志的 `usage` jsonb 是 token 形，后端按图片形反序列化
 * 时 tier 会落成空串。为一个展示字段判整行 parse 失败不划算，UI 侧空串回退 `—`。
 */
export const perImageUsageSchema = z.object({
  tier: z.object({ size: z.string(), quality: z.string() }),
  count: z.number().int().nonnegative(),
});
export type PerImageUsage = z.infer<typeof perImageUsageSchema>;

export const perVideoUsageSchema = z.object({
  tier: z.object({ resolution: z.string() }),
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

// ---------- content：请求上下文（后端 usage_logs.content jsonb 镜像） ----------

/**
 * 一次调用的请求上下文，与 `usage` / `cost` 平级的折叠对象，逐字对应后端
 * `usage_logs.content` jsonb 列。
 *
 * 结算状态不在这里——那是独立的 `status` 列（见 `logEntryBaseShape.status`）；
 * 上游 HTTP 码只有 `statusCode` 一处，`error` 里不再重复。
 */
export const logContentSchema = z.object({
  /**
   * 该次调用走的协议（`openai_chat` / `anthropic_messages` / …），未知时为 null。
   *
   * 刻意不收成枚举：这一列是历史数据的堆积，迁移前写的是协议族（`openai`），
   * 迁移后写的是具体端点（`openai_chat`），网关以后新增端点也会先落库再更新前端。
   * 收紧成 enum 只会让整条日志 parse 失败、连带别的字段一起显示不出来。
   * 展示走 `logProtocolText()`，未登记的取值原样透出。
   */
  protocol: z.string().min(1).nullable().optional(),
  /** 上游 HTTP 响应码；null 表示未抵达上游。 */
  statusCode: z.number().int().nonnegative().nullable().optional(),
  /** 是否流式。 */
  streamed: z.boolean(),
  /** 多轮对话的会话 ID；无会话上下文时为 null。 */
  convId: z.string().min(1).nullable().optional(),
  /**
   * 调用耗时（ms）。语义随 `streamed` 切换：流式=首字延迟(TTFT)，非流式=端到端总耗时。
   * null = 未知（如"调用中"尚未回报）；失败行仍会带上失败前的耗时。
   */
  latencyMs: z.number().int().nonnegative().nullable().optional(),
  /** 调用方来源 IP，点分字符串（后端已还原真实用户 IP）。 */
  clientIp: z.string().min(1).nullable().optional(),
  /**
   * 失败原因；`status === 'success'` 时为 null。HTTP 码见同级 `statusCode`。
   *
   * `code` 是开放取值：平台自判的码（`zero_output` / `billing_commit_failed` / `expired`）、
   * 上游上报的码、以及 4xx/5xx 时后端拿 HTTP 状态顶上的纯数字串都会出现在这里。
   * 失败但没码也没错误 HTTP 时为 null，不捏造 `upstream_error`。
   * 展示统一走 `logErrorCodeText()`。`message` 不设长度上限——上游堆栈能有多长算多长，
   * 截断该是后端的事，前端为此判 parse 失败只会连累同一行的其它字段。
   */
  error: z
    .object({
      code: z.string().min(1),
      message: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
});
export type LogContent = z.infer<typeof logContentSchema>;

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
  /** 命中渠道的内部键（供应商组 / queue_group）。来自别名快照绑定；未绑定时为 null。 */
  vendorKey: z.string().nullable().optional(),
  /**
   * 该渠道对外公开的 slug（如 `nai` / `pa`），后端由 `vendorKey` 反查 `Vendor.VendorSlug` 得到。
   * 展示渠道时优先用它——`vendorKey` 是内部代号，不该直接摆给运营看。未配置 slug 时为 null。
   */
  vendorPlug: z.string().nullable().optional(),
  /** 命中的上游真实模型名（vendor_model）。来自别名快照绑定；未绑定时为 null。 */
  vendorModel: z.string().nullable().optional(),
  /**
   * 结算状态，成败的唯一真源：`success` 以外都算失败，失败原因见 `content.error`。
   */
  status: aiUsageStatusSchema,
  /** 请求上下文（协议 / 响应码 / 流式 / 会话 / 耗时 / 来源 IP / 错误）。 */
  content: logContentSchema,
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
          /**
           * 驳回原因码。后端是从账单备注里劈出来的开放字符串（`LogBillReversalDto.Code` 为
           * `string?`），未必落在 `billReverseCodeValues` 里，也可能整个为 null，
           * 所以这里不收成枚举——财务记了什么就显示什么，走 `billReverseCodeText()`。
           */
          code: z.string().nullable().optional(),
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
  /**
   * 定价快照缺失时后端下发的兜底分支（`UsageLogMapper`：`rate?.BillingType ?? "unknown"`）——
   * 多见于费率行被删、或日志早于当前定价体系。此时 `usage` / `cost` 仍是 token 形，
   * 只是 `cost` 各维度全为 0、只有 `total` 有值，所以直接复用 per_token 的形状。
   *
   * 单列一个分支而不是把 `unknown` 塞进 `billingTypeValues`：那个枚举同时是费率页
   * 新建费率的选项来源，多出一个"未知"选项会让运营真的建出一条未知计费的费率。
   */
  z.object({
    ...logEntryBaseShape,
    billingType: z.literal('unknown'),
    usage: perTokenUsageSchema,
    cost: perTokenCostSchema,
  }),
]);

export type LogEntry = z.infer<typeof logEntrySchema>;

/** 日志行的判别字段取值：正常的计费类型，外加定价快照缺失时的 `unknown`。 */
export type LogEntryBillingType = LogEntry['billingType'];

/** 成败判定的唯一入口：`status` 之外没有别的真源，`success` 以外都算失败。 */
export function logIsSuccess(row: Pick<LogEntry, 'status'>): boolean {
  return row.status === 'success';
}

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
  /** 精确过滤 `content.protocol` */
  protocol?: LogProtocol;
  /** 会话 ID 精确匹配（`content.convId`） */
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
  /** 精确过滤结算状态：`pending` 调用中 / `success` 成功 / `failure` 失败。 */
  status?: AiUsageStatus;
  /** @deprecated 用 `status`。仅看失败调用（`status !== 'success'`）。 */
  errorOnly?: boolean;
  /** 精确过滤 `content.error.code`（仅对失败记录生效）。 */
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
  /** 渠道键（= `vendors.queue_group`），排行的分组键与稳定 row key。 */
  vendorKey: string;
  /** 渠道展示名（服务端优先取 VendorSlug，回退 queue_group） */
  providerName?: string;
  calls: number;
  errors: number;
  /** 平均首字延迟（TTFT），仅 `content.streamed` 的成功样本入聚合。单位 ms。 */
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
  /** 平均首字延迟（TTFT），ms。仅 `content.streamed` 的成功样本入聚合。 */
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
  /** 错误码分布（仅失败调用，≤ 5 条；其余合入 `other`） */
  errorCodes: LogStatsErrorCode[];
}

export const logStatsBucketSchema = z.object({
  tsUtc: epochMillisSchema,
  calls: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
  cost: z.number().nonnegative(),
  tokens: z.number().int().nonnegative(),
});

export const logStatsTopModelSchema = z.object({
  modelName: z.string(),
  calls: z.number().int().nonnegative(),
  cost: z.number().nonnegative(),
  errorRate: z.number().min(0).max(1),
});

export const logStatsTopProviderSchema = z.object({
  vendorKey: z.string(),
  providerName: z.string().optional(),
  calls: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
  avgTokenLatency: z.number().nonnegative(),
});

export const logStatsErrorCodeSchema = z.object({
  code: z.string(),
  count: z.number().int().nonnegative(),
});

export const logStatsSchema = z.object({
  totalCalls: z.number().int().nonnegative(),
  successCalls: z.number().int().nonnegative(),
  errorCalls: z.number().int().nonnegative(),
  avgTokenLatency: z.number().nonnegative(),
  p95TokenLatency: z.number().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  totalCost: z.number().nonnegative(),
  rpm: z.number().nonnegative(),
  bucketSizeSec: z.number().int().positive(),
  buckets: z.array(logStatsBucketSchema),
  topModels: z.array(logStatsTopModelSchema),
  topProviders: z.array(logStatsTopProviderSchema),
  errorCodes: z.array(logStatsErrorCodeSchema),
});

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

/** 按对外模型别名聚合的消费统计行。 */
export interface ModelConsumptionRow {
  modelName: string;
  /** 调用次数（仅成功调用）。 */
  requestCount: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  /** 累计扣费（元）。 */
  totalCost: number;
  /** 该模型出现过的渠道数（去重 vendor_key）。 */
  vendorCount: number;
}

/** 报表时间粒度。none = 不分时间，只出分组合计。 */
export type ReportTimeBucket = 'hour' | 'day' | 'none';
/** 报表拆分维度。none = 整段合计一条。 */
export type ReportBreakdown = 'none' | 'vendor' | 'model';
export type ReportMetric = 'cost' | 'calls' | 'tokens';

export interface ConsumptionReportQuery {
  fromUtc: number;
  toUtc: number;
  timeBucket: ReportTimeBucket;
  breakdown: ReportBreakdown;
  vendorKeys?: string[];
  modelNames?: string[];
}

export interface ConsumptionCell {
  bucketStartUtc: number;
  groupKey: string;
  requestCount: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalCost: number;
}

export interface ConsumptionReport {
  bucketSeconds: number;
  timeBucket: ReportTimeBucket;
  breakdown: ReportBreakdown;
  cells: ConsumptionCell[];
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
