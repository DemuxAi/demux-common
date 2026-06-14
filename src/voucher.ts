import { z } from 'zod';

import { uidString } from './lib/uid';

/**
 * 代金券（抵扣券）公共契约。形状对齐后端 `Meeko.Contracts.Billing`
 * 的 `UserVoucherDto` / `VoucherLedgerEntryDto`：
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

/** 券余额流水类型：0 发放 / 1 预占 / 2 释放 / 3 抵扣 / 4 退回 / 5 过期 / 6 作废。 */
export enum VoucherLedgerKind {
  Issue = 0,
  Hold = 1,
  Release = 2,
  Redeem = 3,
  Refund = 4,
  Expire = 5,
  Revoke = 6,
}

/**
 * 一条代金券核销（抵扣）记录 —— 后端 `VoucherLedgerEntryDto` 中 `kind=Redeem` 的行。
 * 券流水统一用带符号 `delta` 记账：抵扣额 = `Math.abs(delta)`。
 */
export const voucherRedemptionSchema = z.object({
  id: uidString,
  userVoucherId: uidString,
  accountUid: uidString,
  /** 流水类型，见 VoucherLedgerKind（核销记录恒为 Redeem）。 */
  kind: z.number().int(),
  /** 带符号变动额；抵扣额取 Math.abs(delta)。 */
  delta: z.number(),
  /** 本条流水写入后的券可用余额快照。 */
  balanceAfter: z.number(),
  /** 触发抵扣的产品代码；非账单类流水为空。 */
  productCode: z.string().nullable().optional(),
  /** 所抵扣账单（Hold 落账单元）Id；非账单类流水为 null。 */
  holdId: uidString.nullable().optional(),
  /** 关联账单流水号（Commit 账单号）。 */
  billSerial: z.string().nullable().optional(),
  /** 该账单实付总额快照。 */
  billAmount: z.number().optional(),
  /** 发生时间（ISO-8601 UTC）。 */
  occurredAtUtc: z.string(),
});
export type VoucherRedemption = z.infer<typeof voucherRedemptionSchema>;
