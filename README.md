# dsh-cost-meter
![License](https://img.shields.io/badge/license-MIT-blue)
![Version](https://img.shields.io/badge/version-0.3.0-2ea44f)
![DSH](https://img.shields.io/badge/DSH-v0.1.5-2ea44f)

*既然都知道输入输出的token数目了，为什么不自动计算价格呢？*

DeepSeek Harness（DSH）Web 插件：在对话统计行（缓存命中率 / 输入 / 输出）之后追加展示当前会话的**累计花费**，并提供可在设置页中编辑的按模型价格表（支持峰谷定价，且**峰值时段可自由选择周一到周日中的哪几天生效**）。

本版本适配 **DSH v0.1.5**（在 `0.1.5-rc.1` 上实测通过）：DSH 升级带来的会话事件载体、客户端模块表与浏览器包构建变更均已在 0.3.0 中适配，详见下文「版本兼容」。

花费行与内置「会话统计 / Token 用量」使用同一种交互：平时只显示一行摘要，**点击**后在其上方展开明细面板（再次点击、点击面板外或按 Esc 关闭），不再是鼠标悬浮提示。

价格单位为所选币种（CNY / USD）下**每 1,000,000 tokens** 的单价，支持三种计费项：

| 计费项 | 统计来源（`tokenUsage` 投影） |
|---|---|
| 输入缓存命中 | `cacheReadTokens` |
| 输入缓存未命中 | `uncachedInputTokens + cacheWriteTokens` |
| 输出 | `outputTokens` |

每轮费用 =（缓存命中 × 命中价 + 缓存未命中 × 未命中价 + 输出 × 输出价）/ 1,000,000。
每轮按该轮发生时的模型与峰谷时段**独立计价并存为一条不可变条目**，会话展示的累计花费为所有条目之和。

## 峰谷定价与生效星期

每个模型可以启用任意数量的峰值时段，每个时段自带三档单价与**生效星期**：

- 时段使用本地时间 `HH:mm`，`start > end` 表示跨午夜（如 `22:00`–`06:00`）；
- 每个时段可勾选周一至周日中的任意几天（设置页提供 7 个星期开关，以及「工作日 / 每天」快捷选择）；
- 跨午夜时段算在**开始那天**：勾选周五的 `22:00`–`06:00` 也覆盖周六凌晨，但不覆盖周六深夜；
- 「生效星期」为空表示该时段**永不生效**（相当于临时停用），界面会给出提示；
- 命中任一时段即按该时段价格计费，并给该轮条目打上时段标记；
- 多个时段重叠时按列表顺序取第一个；
- 当前会话所选模型正处于峰值时段时，摘要行会显示「峰值」标记，明细面板中可见时段区间、生效星期与分项金额。

## 费用条目与归档

- 费用条目保存在 DSH 自有 storage-domain 侧车表（`dsh-cost-meter` domain，`sessions` 表），按会话隔离，不写入 `settings.yaml`；
- 条目保存**该轮当时的价格快照**（模型、峰谷时段、三档单价、币种、token 与金额），之后修改价格表只影响新轮次；
- 归档会话时自动删除该会话的费用条目（30 秒内完成清理，读取时也会即时校验）；
- **升级本版本前的历史轮次不会回溯生成条目**，升级后的新轮次才开始累计；
- 已有费用条目后不可切换币种，避免新旧币种条目无法合并加总。

## 默认价格

首次安装时预置 CNY 价格表，与 [DeepSeek 官方价格页](https://api-docs.deepseek.com/zh-cn/quick_start/pricing)（2026-09 版）一致，并默认启用官方峰谷时段（北京时间**周一至周五** 09:00–12:00 / 14:00–18:00；其余时间含周末为空闲时段）：

| 模型 | 时段 | 输入缓存命中 | 输入缓存未命中 | 输出 |
|---|---|---:|---:|---:|
| `deepseek-flash` | 空闲 | ¥0.02 | ¥1 | ¥4 |
| `deepseek-flash` | 高峰 | ¥0.04 | ¥2 | ¥8 |
| `deepseek-v4-pro` | 空闲 | ¥0.15 | ¥4.5 | ¥13.5 |
| `deepseek-v4-pro` | 高峰 | ¥0.30 | ¥9 | ¥27 |
| 默认价格（未匹配模型） | 同 `deepseek-v4-pro` | ¥0.15 | ¥4.5 | ¥13.5 |

已退役的 `deepseek-v4-flash`、`deepseek-v4-flash-vision-exp` 仍按官方说明以 Flash 价格计费，因此也预置为 Flash 档。
（空闲时段价格恰为高峰时段的一半，默认配置即按此规则生成。）

## 版本兼容（0.3.0 修复）

**适配 DSH v0.1.5**（实测于 `0.1.5-rc.1`）。DSH 更新后曾出现「花费行不再显示」，原因有两处，0.3.0 均已修复：

- **Host 端不再记账**：旧版通过 `session.events` 读取会话前缀，该属性在新版 DSH 中已改为 `snapshotEvents()` 方法，于是每轮用量事件在监听器里抛错（被 DSH 逐个监听器隔离），账本从此不再新增条目，而花费行要求至少 1 条已计费条目才显示。现在读取方式对三种会话形态自适应（`snapshotEvents` / `events` / `eventAt`），并且观测异常会打日志而不是静默失败。
- **浏览器端不再加载**：旧包 `@deepseek-ai/dsh-client-runtime/client` 已被拆分/移除，`createSnapshotStore` 现在来自 `@deepseek-ai/dsh-client-store`；旧 `client.js` 在该模块上 `require` 失败，插件整个客户端半边无法注册。

同时把构建改为**自包含**：新版 DSH 的 `clientBundle()` 预设会在 harness 工作区内按包名查找（`packages/*/*/package.json`），外置插件必然构建失败；现在本插件自己产出符合模块表契约的浏览器包（仅外部化平台模块表内的依赖，CSS 仍由 lightningcss 内联并注入），并新增 `pnpm test` 回归测试（39 项，含真实事件样本、产物校验与 jsdom 交互测试）。

## 功能

- **底部统计行追加累计花费**：注册到 `conversation.composer.dock`，随会话切换与新一轮计费自动刷新；摘要行显示模型花费合计与「峰值」标记，**点击**展开明细面板（模型、已计费轮次、峰谷时段、生效星期与各分项 token/金额），再次点击 / 点击外部 / Esc 关闭；
- **与内置 pill 同源交互**：使用与「会话统计 / Token 用量」相同的 `useAnchoredPosition` + `useDismissOnOutsidePointer` 原语与面板皮肤（圆角 12、菜单底色、视口内定位），不再是悬浮提示；
- **按模型价格表**：设置页新增「预估花费价格表」，可配置币种、默认价格、任意数量模型的三档平时单价；
- **峰谷分支 + 生效星期**：每个模型可增删多个峰值时段，为每个时段单独配置三档价格，并勾选周一至周日的任意几天生效（含「工作日 / 每天」快捷选择）；
- **逐轮独立记账**：每轮按发生时间与价格快照独立保存，归档会话即删除条目，不长期占用存储；
- **本地持久化**：价格配置保存在 `$DSH_HOME/settings.yaml` 的 `dsh-cost-meter:` 段，保存后即生效；
- **中英双语**：随界面语言切换（`zh` / `en`）。

## 效果

![docker](docker.png)
![config](config.png)

## 使用

安装并重启服务端后：

1. 打开 **设置 → 预估花费价格表**，修改币种、默认价格或按模型价格；
2. 勾选某模型的「峰谷定价」并添加时段、设置峰时价格，再勾选该时段生效的星期（跨午夜时段按开始日计算）；
3. 点击 **保存**；之后的新轮次按新价格表逐轮记账；
4. 点击 **恢复默认** 可清空用户价格配置，回到上表的出厂价格；
5. 在对话下方的花费摘要上**点击**即可展开明细，按 Esc 或点击面板外收起。

无可用用量、无已计费条目、或价格表尚未加载时，花费行自动隐藏，不占用布局。

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

源码开发时可重新构建插件产物并运行回归测试：

```powershell
cd dsh-cost-meter
pnpm run build   # tsc -b + tsdown（Host 与浏览器两半）
pnpm test        # node --test（TS 源码经 harness 的 tsx 运行）
```

构建输出：

- Host 端 `index.mjs`：价格表设置命名空间、逐轮费用侧车表、归档清理与自有配置/账本路由（schemastery 已内联，无外部运行时依赖）；
- 浏览器端 `client.js`：累计花费行（含峰值提醒与生效星期）+ 价格表设置页。

浏览器端由本插件自带的 `tsdown.config.ts` 生成：对外只保留平台模块表（`PLATFORM_MODULES`，从 harness 读取，二者不会漂移）内的依赖，其余 `@deepseek-ai/*` 值导入会被构建期门禁直接判错；`.module.css` 由 lightningcss 编译为哈希类名并在工厂执行时注入 `<style data-plugin-css>`。

## 配置结构

`$DSH_HOME/settings.yaml` 中的用户价格配置结构：

```yaml
dsh-cost-meter:
  currency: CNY          # CNY 或 USD
  default:               # 未匹配模型的兜底价格
    cacheHitPrice: 0.15
    cacheMissPrice: 4.5
    outputPrice: 13.5
    peakWindows: []
  models:                # 按模型覆盖
    deepseek-flash:
      cacheHitPrice: 0.02
      cacheMissPrice: 1
      outputPrice: 4
      peakWindows:       # 可多个；start > end 表示跨午夜（算在开始日）
        - id: peak-morning
          start: 09:00
          end: 12:00
          days: [1, 2, 3, 4, 5]   # 1=周一 … 7=周日；缺省为工作日，空数组表示不生效
          cacheHitPrice: 0.04
          cacheMissPrice: 2
          outputPrice: 8
```

schema 默认值只在用户未写入 `models` 时生效，因此把 `models` 清空后保存即可真正移除全部模型条目。
已有的峰值时段若没有 `days` 字段，会按 schema 默认值解析为「周一至周五」，与官方峰谷规则一致。

## 实现说明

- 用量直接读取 token-meter 的 `tokenUsage` 会话投影，与内置统计行同源：分页与压缩（compaction）都不影响数字；
- 每轮费用由 Host 端监听 `session/event`，按当前 DSH 的事件载体读取用量（`assistant/message` / `assistant/attempt` 的 `data.usage`、其紧凑流中的 `usage` 分片，以及旧版 `assistant/chunk`），在 usage 事件落盘时按当时配置生成条目并写入 storage-domain，客户端只做条目求和；
- 会话前缀模型折叠通过 `snapshotEvents()`（旧版为 `events` 数组、`eventAt()` 亦可）读取，读取异常只记录日志，不会中断 DSH 的事件派发；
- 当前模型取自 `ctx.modelDirectories`（可选服务），缺失时回退到「默认价格」档；
- 摘要行的点击面板与内置统计 pill 使用同一套平台原语：`useAnchoredPosition`（视口内定位、滚动/缩放跟随）与 `useDismissOnOutsidePointer`（点击外部关闭）来自 `@deepseek-ai/dsh-client-ui-primitives`，面板通过 `createPortal` 挂到 `document.body`，因此不会被 dock 行的 `overflow` 裁剪；
- Web api-proxy 只向浏览器暴露白名单内的设置命名空间，因此价格表与账本通过插件自有同源路由读写：
  `GET /dsh-cost-meter/config`、`POST /dsh-cost-meter/config`（整段写入）、
  `POST /dsh-cost-meter/reset`（恢复默认）、
  `GET /dsh-cost-meter/sessions/:sessionId/ledger`（会话条目汇总）；
- v1 的扁平价格配置（`currency` + 三个顶层单价）会在读取时自动折叠进 `default` 档。

## 该项目为纯粹Vibe coding，对代码健壮性不做保证！
