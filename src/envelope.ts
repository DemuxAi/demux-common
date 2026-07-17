/**
 * 平台 REST 响应信封。约定（`docs/Contracts.md`）：
 * - 所有 wire 字段 **camelCase**。
 * - 所有 `long` 标识符序列化为 **string**（避免 JS 53-bit 精度丢失）。
 */

/**
 * Legacy ApiEnvelope，用于 `/demux/api/*` 与 BFF 端点。Keystone 的 `/auth/*`
 * 与 `/api/user/*` 直接返回 `T`（失败时 RFC 7807 ProblemDetails）。
 */
export interface ApiEnvelope<T = unknown> {
  success: boolean;
  /** 仅失败时下发（success=false）；成功时后端省略该字段。 */
  message?: string;
  data: T;
}

/** 分页 / 列表信封：`{ items, total }`（+ 可选页码）。 */
export interface ItemsEnvelope<T = unknown> {
  items: T[];
  total: number;
  page?: number;
  pageSize?: number;
}

/** RFC 7807 ProblemDetails，用于 Keystone `/auth/*` 与 `/api/user/*` 的失败响应。 */
export interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  /** HTTP 类别码 (如 `GEN_01` validation). */
  code?: string;
  /** 域级 reason 码 (如 `email_invalid`), 供前端 i18n 映射. */
  reason?: string;
  /** 可选的逐字段校验错误。 */
  errors?: Record<string, string[]>;
  [key: string]: unknown;
}
