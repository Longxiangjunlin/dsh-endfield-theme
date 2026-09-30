# 第三方素材与授权 / Third-party assets and licensing

本仓库的**代码**是 MIT（见 [`LICENSE`](LICENSE)）。但仓库里还带着几份**不属于我**的东西，
分发与再使用看这一页。

The **code** in this repository is MIT (see [`LICENSE`](LICENSE)). It also ships material that
is not mine; this page is about that material.

## 1. 《明日方舟：终末地》官方素材 / Arknights: Endfield assets

| 文件 | 内容 |
| --- | --- |
| `client/assets/endfield-field.jpg` | 深色背景（由官方主视觉烘焙：压暗、去饱和、加暗角） |
| `client/assets/endfield-field-day.jpg` | 浅色背景（同日主视觉的雪原变体） |
| `client/assets/endfield-mark-zh.png` | `终末地 / ENDFIELD INDUSTRIES` 字标（白） |
| `client/assets/endfield-mark-zh-dark.png` | 同一字标的墨黑版 |
| `client/assets/endfield-mark-en.png` | `ENDFIELD INDUSTRIES` 字标（白） |
| `client/assets/endfield-emblem.png` | 徽记冠部线稿（开屏底纹） |
| `client/assets/endfield-icon.svg` | 站点图标（矢量化重绘） |
| 品牌行里的倒三角 | 依徽记造型**手绘的矢量**（`client/theme.js` 中的 `BRAND_MARK`） |

这些是 **© Hypergryph / GRYPHLINE** 的商标与美术作品，随本仓库按**同人非商业**用途分发，
**不是** MIT 的一部分，也不在本仓库的授权范围内。使用即表示你明白这一点。

This is trademarked and copyrighted material belonging to **© Hypergryph / GRYPHLINE**. It is
included here for **non-commercial fan use only**. It is **not** covered by this repository's MIT
license. If you fork this, that obligation travels with the files.

想商用的，请自行替换上面这些文件——插件的代码路径不依赖它们的具体内容，只要文件名与尺寸
保持即可（路由 `/dsh-endfield/assets/*` 按文件名提供）。

## 2. 字体 / Fonts

| 文件 | 上游 | 授权 |
| --- | --- | --- |
| `client/assets/fonts/endfield-sans-sc.woff2` | Noto Sans SC（可变字重子集，拉丁 + GB2312 + 中日韩标点） | SIL OFL 1.1 |
| `client/assets/fonts/endfield-tech.woff2` | Saira（可变字宽/字重子集，拉丁与数字） | SIL OFL 1.1 |

两份许可证全文随包分发：`client/assets/fonts/OFL-NotoSansSC.txt`、
`client/assets/fonts/OFL-Saira.txt`。SIL OFL 允许再分发与嵌入，要求保留许可证，
且**不得单独售卖字体本身**——本仓库两个条件都满足。

## 3. DeepSeek Harness

本插件是 DSH 的第三方插件，**不是** DeepSeek 官方项目。代码通过 DSH 公开的插件机制工作
（`dsh.bundle.patch` 清单、`webserver/index-inject` 注入行、`webServer.register` 路由、
插件槽位）。DSH 自身的包以 MIT 发布。

关于主题会把侧栏品牌显示为「终末地工业」：品牌呈现是 DSH **设计上可替换**的一环——
官方在自己的 `@deepseek-ai/dsh-client-ui-brand-official` 里写明「自有身份的部署……
组合另一个占据侧栏 slot 的包，占据 slot 是唯一的组合路径」。窗口标题与会话首屏的品牌
不在该 slot 体系内，不受本插件影响。
