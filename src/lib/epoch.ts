import { z } from 'zod';

/** REST JSON 边界日期：Unix 毫秒。 */
export const epochMillisSchema = z.number().int();

export const epochMillisNullableSchema = z.number().int().nullable();

export const epochMillisOptionalSchema = z.number().int().optional();

export const epochMillisNullishSchema = z.number().int().nullish();

/** UI 日期范围（ISO 字符串）→ 查询参数毫秒。 */
export function dateRangeToEpochMillis(range: [string, string] | null | undefined): {
  fromUtc?: number;
  toUtc?: number;
} {
  if (!range?.[0] || !range[1]) return {};
  return {
    fromUtc: Date.parse(range[0]),
    toUtc: Date.parse(range[1]),
  };
}

/** 适配层：wire 值 → 毫秒 number（兼容过渡期 string）。 */
export function asEpochMillis(value: unknown): number | undefined {
  if (value == null || value === '') return undefined;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value);
    if (Number.isFinite(n) && /^\d+$/.test(value.trim())) return n;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export function asEpochMillisNullable(value: unknown): number | null {
  if (value == null || value === '') return null;
  return asEpochMillis(value) ?? null;
}
