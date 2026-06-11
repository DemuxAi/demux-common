import { z } from 'zod';

/**
 * long 标识符过线策略：后端把 `long`（雪花 id / userId）序列化为 **string**，
 * 避免 JS Number 53-bit 精度丢失（见后端 `LongToStringConverter`）。
 *
 * 这里统一接受 string | number 并归一化为 string——兼容过渡期可能下发 number 的旧端点，
 * 也方便前端表单 v-model 始终拿到 string。
 */
export const uidString = z.union([z.string(), z.number()]).transform((v) => String(v));
