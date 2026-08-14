# dsh-cost-meter
![License](https://img.shields.io/badge/license-MIT-blue)
![Version](https://img.shields.io/badge/version-0.1.0-2ea44f)
![Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)

*既然都知道输入输出的token数目了，为什么不自动计算价格呢？*

DeepSeek Harness（DSH）Web 插件：在对话统计行（缓存命中率 / 输入 / 输出）之后追加展示当前会话的**预估花费**，并提供可在设置页中编辑的按模型价格表。

价格单位为所选币种（CNY / USD）下**每 1,000,000 tokens** 的单价，支持三种计费项：

| 计费项 | 统计来源（`tokenUsage` 投影） |
|---|---|
| 输入缓存命中 | `cacheReadTokens` |
| 输入缓存未命中 | `uncachedInputTokens + cacheWriteTokens` |
| 输出 | `outputTokens` |

花费 =（缓存命中 × 命中价 + 缓存未命中 × 未命中价 + 输出 × 输出价）/ 1,000,000。
按**当前会话所选模型**的价格档计算；未在表中列出的模型使用「默认价格」。

*注意，当前版本仅实现了最基础的最终即时计算，对于峰谷计算与道中突然切换模型的情况不生效。*

## 出厂价格

首次安装时预置 CNY 价格表如下（1M tokens）：

| 模型 | 输入缓存命中 | 输入缓存未命中 | 输出 |
|---|---:|---:|---:|
| `deepseek-v4-flash` | ¥0.02 | ¥1 | ¥2 |
| `deepseek-v4-pro` | ¥0.025 | ¥3 | ¥6 |
| 默认价格（未匹配模型） | ¥0.025 | ¥3 | ¥6 |

> 从旧版本升级时，已经保存在 `settings.yaml` 中的价格不会被覆盖；暂不支持即将到来的峰谷定价分别计算。

## 功能

- **底部统计行追加预估花费**：注册到 `conversation.composer.dock`，随会话切换与用量流式更新实时刷新；悬停显示计费模型与各分项明细；
- **按模型价格表**：设置页新增「预估花费价格表」，可配置币种、默认价格，以及任意数量模型的三个单价（可增删改、恢复默认）；
- **本地持久化**：价格保存在 `$DSH_HOME/settings.yaml` 的 `dsh-cost-meter:` 段，保存后即生效，无需重启；
- **中英双语**：随界面语言切换（`zh` / `en`）。

## 使用

安装并重启服务端后：

1. 打开 **设置 → 预估花费价格表**，修改币种、默认价格或按模型价格；
2. 点击 **保存**；当前及之后打开的会话会按新价格估算花费；
3. 点击 **恢复默认** 可清空用户配置，回到上表的出厂价格。

无可用用量、或价格表尚未加载时，花费行自动隐藏，不占用布局。

## 安装

在 harness 目录中把本插件加入 `web` profile：

```powershell
cd <harness 目录>
# 本地源码（link 方式）
dsh plugin --profile web add "link:<dsh-cost-meter 目录>"
# 发布到 registry 后
dsh plugin --profile web add dsh-cost-meter
```

或者直接在 `.dsh\profiles\web\node_modules` 下运行：

```
git clone git@github.com:Creakono/dsh-cost-meter.git
```

随后重启 web 服务端，刷新页面即可。
如果通过 pnpm 脚本启动 harness，插件命令同样写为 `pnpm dsh plugin ...`。

## 构建

源码开发时可重新构建插件产物：

```powershell
cd dsh-cost-meter
pnpm install
pnpm run build
```

构建输出：

- Host 端 `index.mjs`：设置命名空间 + 自有配置路由（schemastery 已内联，运行时零外部依赖）；
- 浏览器端 `client.js`：花费行 + 价格表设置页。

## 配置结构

`$DSH_HOME/settings.yaml` 中的用户配置结构：

```yaml
dsh-cost-meter:
  currency: CNY          # CNY 或 USD
  default:               # 未匹配模型的兜底价格
    cacheHitPrice: 0.025
    cacheMissPrice: 3
    outputPrice: 6
  models:                # 按模型覆盖
    deepseek-v4-flash:
      cacheHitPrice: 0.02
      cacheMissPrice: 1
      outputPrice: 2
```

schema 默认值只在用户未写入 `models` 时生效，因此把 `models` 清空后保存即可真正移除全部模型条目。

## 实现说明

- 用量直接读取 token-meter 的 `tokenUsage` 会话投影，与内置统计行同源：分页与压缩（compaction）都不影响数字；
- 当前模型取自 `ctx.modelDirectories`（可选服务），缺失时回退到「默认价格」档；
- Web api-proxy 只向浏览器暴露白名单内的设置命名空间，因此价格表通过插件自有同源路由读写：
  `GET /dsh-cost-meter/config`、`POST /dsh-cost-meter/config`（整段写入）、
  `POST /dsh-cost-meter/reset`（恢复默认），底层仍走 `ctx.settings` 持久化；
- v1 的扁平价格配置（`currency` + 三个顶层单价）会在读取时自动折叠进 `default` 档。

## 该项目为纯粹Vibe coding，对代码健壮性不做保证！