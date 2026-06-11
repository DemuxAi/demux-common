import { z } from 'zod';

import { uidString } from './lib/uid';

/**
 * 个人 API 密钥（sk- 令牌）。主键 `id`（业务实体）；归属用 `accountUid`。
 * 时间为 Unix 毫秒（UTC）；`expiredTime` 用 `-1` 表示永不过期。
 */
export const tokenSchema = z.object({
  id: uidString,
  accountUid: uidString,
  /** 前缀标签（如 `sk`），与 `key` 用 `-` 拼接。 */
  keyPrefix: z.string().nullable().optional(),
  /** secret 本体；与 `keyPrefix` 拼接为完整 API Key。 */
  key: z.string().nullable().optional(),
  status: z.number().int(),
  name: z.string(),
  createdTime: z.number().int(),
  accessedTime: z.number().int(),
  expiredTime: z.number().int(),
  remainQuota: z.number(),
  unlimitedQuota: z.boolean(),
  modelLimitsEnabled: z.boolean(),
  modelLimits: z.string(),
  /** `all` | `per_call` | `metered` */
  modelBillingScope: z.string(),
  modelVendorKeys: z.array(z.string()),
  allowIps: z.string(),
  usedQuota: z.number(),
});
export type Token = z.infer<typeof tokenSchema>;

export interface TokenKeyParts {
  keyPrefix: string;
  key: string;
}

/** `POST`（create）/ `PUT`（update）on `/demuxai/api/token` 的入参。 */
export interface TokenWritePayload {
  /** 更新必填；创建时省略。 */
  id?: string;
  name: string;
  remainQuota: number;
  unlimitedQuota: boolean;
  expiredTime: number;
  modelLimitsEnabled: boolean;
  modelLimits: string;
  modelBillingScope: string;
  modelVendorKeys: string[];
  allowIps: string;
}
