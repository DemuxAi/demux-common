/**
 * 价格表模型键：厂家目录名（claude-opus-5），不是渠道拼法。
 * 路由上的真名用最长前缀对上表里的键。
 */
const dateSuffix = /-20\d{6}$/;
const hyphenDateSuffix = /-20\d{2}-\d{2}-\d{2}$/;
const versionSuffix = /-v\d+$/;
const latestSuffix = /-latest$/;

export function isRoutingAlias(raw: string): boolean {
  const s = raw.trim();
  return s.length === 0 || s.startsWith('~');
}

/** 写入价格表：剥渠道前缀和日期钉，保留 5.1 这种点号版本。 */
export function canonicalizeModelKey(raw: string): string {
  if (isRoutingAlias(raw)) return '';
  let s = stripDecorators(raw, true);
  if (!s || s.endsWith('-latest')) return '';
  return s;
}

export function compactModelKey(raw: string): string {
  return foldModelKey(raw).replaceAll('-', '').replaceAll('.', '');
}

export function modelKeyMatches(vendorModel: string, priceKey: string): boolean {
  const foldedVendor = foldModelKey(vendorModel);
  const foldedKey = foldModelKey(priceKey);
  if (!foldedVendor || !foldedKey) return false;
  if (foldedVendor === foldedKey) return true;
  if (foldedVendor.startsWith(`${foldedKey}-`)) return true;
  const a = compactModelKey(foldedVendor);
  const b = compactModelKey(foldedKey);
  return a.length > 0 && a === b;
}

export function findBestModelKey(vendorModel: string, priceKeys: readonly string[]): string | null {
  let best: string | null = null;
  let bestLen = -1;
  let bestExact = false;
  for (const key of priceKeys) {
    if (!modelKeyMatches(vendorModel, key)) continue;
    const exact =
      foldModelKey(vendorModel) === foldModelKey(key) ||
      compactModelKey(vendorModel) === compactModelKey(key);
    if (best == null || key.length > bestLen || (key.length === bestLen && exact && !bestExact)) {
      best = key;
      bestLen = key.length;
      bestExact = exact;
    }
  }
  return best;
}

function foldModelKey(raw: string): string {
  let s = stripDecorators(raw, false);
  if (!s) return '';
  s = s.replaceAll('.', '-').replaceAll('_', '-');
  return s.replace(/-{2,}/g, '-').replace(/^-|-$/g, '');
}

function stripDecorators(raw: string, stripDates: boolean): string {
  let s = raw.trim().toLowerCase();
  if (!s) return '';
  if (s.startsWith('~')) s = s.slice(1);
  const slash = s.lastIndexOf('/');
  if (slash >= 0) s = s.slice(slash + 1);
  const dashDash = s.lastIndexOf('--');
  if (dashDash >= 0) s = s.slice(dashDash + 2);
  const colon = s.indexOf(':');
  if (colon >= 0) s = s.slice(0, colon);
  const at = s.indexOf('@');
  if (at >= 0) s = s.slice(0, at);
  if (stripDates) {
    s = s.replace(dateSuffix, '').replace(hyphenDateSuffix, '').replace(versionSuffix, '').replace(latestSuffix, '');
  }
  return s.replace(/-{2,}/g, '-').replace(/^-|-$/g, '');
}
