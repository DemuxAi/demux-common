import { z } from 'zod';

import { uidString } from './lib/uid';

/** 兑换码的兑换者账户快照；未兑换时为 null。 */
export const redemptionAccountSchema = z.object({
  uid: uidString,
  owner: z.object({ email: z.string().optional(), displayName: z.string().optional() }).optional(),
});
export type RedemptionAccount = z.infer<typeof redemptionAccountSchema>;

/** 创建兑换码批次的 Staff。 */
export const redemptionStaffSchema = z.object({
  uid: uidString,
  displayName: z.string(),
  username: z.string().optional(),
});
export type RedemptionStaff = z.infer<typeof redemptionStaffSchema>;

/**
 * 兑换码（充值码）。时间为 Unix 秒（UTC）；`expiredTime` 用 `-1` 表示永不过期。
 */
export const redemptionSchema = z.object({
  id: uidString,
  key: z.string(),
  status: z.number().int(),
  name: z.string(),
  quota: z.number(),
  /** 每码允许兑换次数（默认 1）。 */
  maxRedemptions: z.number().int(),
  redeemedCount: z.number().int(),
  /** Legacy：本批码数量（或单码 max）。 */
  count: z.number().int(),
  /** Unix 秒（UTC）。 */
  createdTime: z.number().int(),
  /** Unix 秒（UTC）；null = 未兑换。 */
  redeemedTime: z.number().int().nullable(),
  /** Unix 秒（UTC）；-1 = 永不过期。 */
  expiredTime: z.number().int(),
  /** 兑换者；null = 未兑换。 */
  account: redemptionAccountSchema.nullable(),
  /** 创建本批次的 Staff。 */
  createdBy: redemptionStaffSchema,
});
export type Redemption = z.infer<typeof redemptionSchema>;

export interface CreateRedemptionsPayload {
  name: string;
  quota: number;
  count?: number;
  maxRedemptions?: number;
  expiredTime?: number;
}

export interface CreateRedemptionsResponse {
  keys: string[];
}
