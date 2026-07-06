import type { ProblemDetails } from './envelope';

/**
 * Keystone 鉴权域稳定 reason 码 (snake_case), 对应后端 `AuthReason`.
 * 前端只做 i18n 映射, 绝不展示后端 detail 自由文本.
 */
export const authReasonCodeValues = [
  'email_invalid',
  'password_required',
  'email_not_registered',
  'login_rate_limited',
  'invalid_password',
  'invalid_credentials',
  'iam_login_fields_required',
] as const;

export type AuthReasonCode = (typeof authReasonCodeValues)[number];

/** 默认中文文案 (无 i18n 上下文时的回退). */
export const AuthReasonCodeLabel: Readonly<Record<AuthReasonCode, string>> = {
  email_invalid: '邮箱格式不正确',
  password_required: '请输入密码',
  email_not_registered: '该邮箱尚未注册',
  login_rate_limited: '登录尝试过于频繁, 请稍后再试',
  invalid_password: '密码错误',
  invalid_credentials: '账号或密码错误',
  iam_login_fields_required: '请填写账户 ID、用户名和密码',
};

const AUTH_ERROR_I18N_PREFIX = 'auth.error.';

export function isAuthReasonCode(value: string): value is AuthReasonCode {
  return (authReasonCodeValues as readonly string[]).includes(value);
}

/**
 * 将 reason 码解析为展示文案.
 * @param translate 可选 i18n 函数 (如 vue-i18n 的 `t`), key 形如 `auth.error.email_invalid`.
 */
export function resolveAuthReasonMessage(
  reason: string | undefined | null,
  translate?: (key: string) => string,
): string {
  if (!reason) return '';

  if (translate) {
    const key = `${AUTH_ERROR_I18N_PREFIX}${reason}`;
    const translated = translate(key);
    if (translated !== key) return translated;
  }

  return (AuthReasonCodeLabel as Readonly<Record<string, string>>)[reason] ?? reason;
}

/**
 * 从 RFC 7807 ProblemDetails 解析用户可见错误文案.
 * 优先 extensions.reason, 回退 detail / title.
 */
export function resolveProblemMessage(
  problem: ProblemDetails | undefined | null,
  translate?: (key: string) => string,
): string {
  if (!problem) return '';

  const reason =
    typeof problem.reason === 'string'
      ? problem.reason
      : undefined;

  if (reason) {
    const fromReason = resolveAuthReasonMessage(reason, translate);
    if (fromReason) return fromReason;
  }

  return problem.detail ?? problem.title ?? '';
}
