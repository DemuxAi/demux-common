# @demux/common

DemuxAi 平台前端**公共契约**——单一真源（single source of truth）。

导出 **Zod schema + 推断类型**，跨 `demuxai-web`（Nuxt）与 `meeko-console`（Vite）共享，
让平台公共类型「一处修改，处处生效」。形状对齐后端 `Meeko.Contracts` 的 wire 约定：

- 所有字段 **camelCase**；
- 所有 `long` 标识符序列化为 **string**（`uidString`，避免 JS 53-bit 精度丢失）；
- 时间为 Unix 毫秒（Keystone）/ Unix 秒（部分 DemuxAi legacy），各 schema 注释标注。

## 用法

```ts
import { logEntrySchema, type LogEntry, AiUsageStatusLabel } from '@demux/common';

const entry: LogEntry = logEntrySchema.parse(wire);
```

按域细分入口（tree-shaking 友好）：

```ts
import { tokenSchema } from '@demux/common/token';
```

## 模块

| 文件 | 内容 |
| --- | --- |
| `lib/uid` | `uidString`（long → string 归一） |
| `lib/epoch` | Unix 毫秒 schema + 日期范围工具 |
| `envelope` | `ApiEnvelope` / `ItemsEnvelope` / `ProblemDetails` |
| `enums` | apiType / billingType / **aiUsageStatus** / billStatus / billReverseCode … + Label 映射 |
| `log` | `LogEntry`（按 billingType 判别）+ usage/cost 子形状 + 统计 / 驳回 |
| `pricing` | `Pricing`（按 billingType 判别）+ Upsert 入参 |
| `provider` | `Provider` / `ProviderModel` / mapping + 草稿态 / 入参 |
| `model` | 平台 `Model` 视图 + 入参 |
| `token` | `Token`（sk- 令牌）+ 写入入参 |
| `redemption` | `Redemption`（兑换码）+ 创建入参 |

## 版本约束

- **Zod v4**（peer `^4.4.0`）。两个消费端必须统一在 Zod v4。
- TypeScript `moduleResolution: Bundler`——以 **TS 源**直接被各 app 的打包器（Nuxt/Vite）消费，无需预编译。
