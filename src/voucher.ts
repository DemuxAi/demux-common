import { z } from 'zod';

import { uidString } from './lib/uid';

/**
 * 代金券（抵扣券）公共契约。形状对齐后端 `Meeko.Contracts.Billing`
 * 的 `UserVoucherDto` / `VoucherRedemptionDto`：
 * - long（id / accountUid）过线为 string（见 LongToStringConverter）；
 * - 枚举过线为 number（后端未启用全局 JsonStringEnumConverter）；
 * - 金额为 number；时间为 ISO-8601 UTC 字符串。
 */

/** 抵扣方式：0 无门槛直减 / 1 满减 / 2 折扣。 */
export enum VoucherDeductKind {
  NoThreshold = 0,
  FullReduction = 1,
  Discount = 2,
}

/** 用户券状态：0 未使用 / 1 已使用 / 2 已过期 / 3 已作废。 */
export enum UserVoucherStatus {
  Unused = 0,
  Used = 1,
  Expired = 2,
  Revoked = 3,
}

/** 单张用户持有的代金券实例。 */
export const userVoucherSchema = z.object({
  id: uidString,
  templateId: uidString,
  accountUid: uidString,
  /** 券面序列号；可能为空。 */
  serialNo: z.string().nullable().optional(),
  deductKind: z.number().int(),
  /** 券面额（直减 / 满减额，或折扣下的最高抵扣额）。 */
  faceValue: z.number(),
  /** 使用门槛金额（无门槛为 0）。 */
  thresholdAmount: z.number(),
  /** 剩余可抵扣额度。 */
  remainingValue: z.number(),
  /** 生效时间（ISO-8601 UTC）。 */
  validFromUtc: z.string(),
  /** 失效时间（ISO-8601 UTC）。 */
  validToUtc: z.string(),
  status: z.number().int(),
  /** 发放时间（ISO-8601 UTC）。 */
  issuedAtUtc: z.string(),
});
export type UserVoucher = z.infer<typeof userVoucherSchema>;

/** 一条代金券核销（抵扣）记录。 */
export const voucherRedemptionSchema = z.object({
  id: uidString,
  userVoucherId: uidString,
  accountUid: uidString,
  /** 触发抵扣的产品代码。 */
  productCode: z.string(),
  /** 本次抵扣金额。 */
  amountDeducted: z.number(),
  /** 发生时间（ISO-8601 UTC）。 */
  occurredAtUtc: z.string(),
});
export type VoucherRedemption = z.infer<typeof voucherRedemptionSchema>;
