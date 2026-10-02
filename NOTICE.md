# 第三方素材与授权 / Third-party assets and licensing

本仓库的**代码**是 MIT（见 [`LICENSE`](LICENSE)）。但仓库里还带着几份**不属于本仓库作者**的
东西，分发与再使用看这一页。

The **code** in this repository is MIT (see [`LICENSE`](LICENSE)). It also ships material that
the author does not own; this page is about that material.

## 1. 《明日方舟：终末地》素材 / Arknights: Endfield assets

**来源 / Provenance**

本仓库里的**全部**终末地美术素材，都由作者取自 B 站用户
**[SealedManx41527](https://space.bilibili.com/2056642352)** 发布的一篇图文：

<https://www.bilibili.com/opus/1237489243187576841>

他那一份同样是从《明日方舟：终末地》的官方素材加工而来。所以链条是：

```
Hypergryph / GRYPHLINE          ← 官方原作，商标与著作权在这里
        ↓  加工
B 站用户 SealedManx41527         ← 本仓库素材的直接来源
        ↓  发布
bilibili.com/opus/1237489243187576841
        ↓  提供
本仓库                          ← 抠图 / 黑白对调 / 矢量化 / 烘焙背景 / 缩尺寸
```

**版权归属不因为经手人变化而改变**：这些图形的商标与著作权是
**© Hypergryph / GRYPHLINE** 的，随本仓库按**同人非商业**用途分发，**不是** MIT 的一部分，
也不在本仓库的授权范围内。若权利人认为本仓库的分发方式不妥，联系作者即可移除。

The Endfield artwork in this repository was obtained by its author from a post by the Bilibili
user **[SealedManx41527](https://space.bilibili.com/2056642352)**
(<https://www.bilibili.com/opus/1237489243187576841>), whose own copy is likewise derived from
official *Arknights: Endfield* material. **The trademark and copyright remain
© Hypergryph / GRYPHLINE**; it is included for **non-commercial fan use only** and is **not**
covered by this repository's MIT license. If you fork this, that obligation travels with the
files.

### 1.1 标志与图标 / Marks and icons

| 文件 | 内容 |
| --- | --- |
| `client/assets/endfield-lockup-light-bg.png` | 完整 lockup（冠部 + `终末地 / ENDFIELD INDUSTRIES` + 倒三角），**浅色侧栏用**（黑白对调） |
| `client/assets/endfield-lockup-dark-bg.png` | 同一 lockup，**深色侧栏用**（原样） |
| `client/assets/endfield-mark-zh.png` | `终末地 / ENDFIELD INDUSTRIES` 字标（白）。**开屏已不用它**——底纹现在就是原始徽记本身，字在图里；这份单独的字标保留备用 |
| `client/assets/endfield-mark-en.png` | `ENDFIELD INDUSTRIES` 字标（白），开屏右下角那枚小字标 |
| `client/assets/endfield-emblem.webp` | **原始徽记整张图，除文字外做了颜色对调**（冠部 + `终末地` + `ENDFIELD INDUSTRIES` + 倒三角及其外框线），开屏底纹。理由：原图是**黑墨 + 白挖空**、为白底设计 ✓，放在炭黑底上时它的黑形状（顶部横杠、外圈三角框线、填充的冠部与三角）与背景只差 5/255，等于消失了 ✓；对调后墨色变白、挖空处成为暗底，就是在暗底上看到同一张图 ✓。**文字必须排除**——它本来就是白的，一起对调就没了 ✓。做法：整图 RGB 取反，但文字所在行（395–575、595–617）里的**亮像素保持原样**（那两行里只有文字是亮的，所以选择精确）✓。1192×1026 原生分辨率，导出为 WebP q92（86 KB；本地工具链写不了 AVIF） |
| `client/assets/endfield-boot.mp3` | 开屏音效：游戏内「集成工业系统语音 · 集成核心区域欢迎进入」的提取音频，142 KB / 192 kbps / 约 5.9 s，播到约 2.9 s 时淡出。**与美术素材同源，同样不在 MIT 范围内** |
| `client/assets/endfield-low-power.mp3` | 余额预警音：游戏内「集成工业系统语音 · 集成核心区域电力输出不足」的提取音频，149 KB，余额低于阈值时播一次（边沿触发）。**同上，不在 MIT 范围内** |
| `client/assets/endfield-no-power.mp3` | 余额耗尽音：游戏内「集成工业系统语音 · 集成核心区域电力储备耗尽」的提取音频，154 KB，余额 ≤ 0 时播一次。**同上，不在 MIT 范围内** |
| `client/assets/endfield-icon.svg` | 站点图标（由徽记冠部矢量化重绘） |

### 1.2 对话区背景 / Conversation backdrop

| 文件 | 内容 |
| --- | --- |
| `client/assets/endfield-field.jpg` | 深色背景（由主视觉烘焙：压暗、去饱和、加暗角） |
| `client/assets/endfield-field-day.jpg` | 浅色背景（同一主视觉的雪原变体） |

想商用的，请自行替换上面这些文件——插件的代码路径不依赖它们的具体内容，只要文件名与尺寸
保持即可（路由 `/dsh-endfield/assets/*` 按文件名提供）。

## 2. 字体 / Fonts

| 文件 | 上游 | 授权 |
| --- | --- | --- |
| `client/assets/fonts/endfield-sans-sc.woff2` | Noto Sans SC（可变字重子集，拉丁 + GB2312 + 中日韩标点） | SIL OFL 1.1 |
| `client/assets/fonts/endfield-tech.woff2` | Saira（可变字宽/字重子集，拉丁与数字） | SIL OFL 1.1 |

两份许可证全文随包分发：`client/assets/fonts/OFL-NotoSansSC.txt`、
`client/assets/fonts/OFL-Saira.txt`。

OFL 有三个条件，本仓库都满足：

1. **保留许可证** —— 两份全文随包分发；
2. **不得单独售卖字体本身** —— 本插件不售卖字体；
3. **修改版不得使用保留字体名（Reserved Font Name）** —— 上游声明里，Noto Sans SC 带
   `with Reserved Font Name 'Source'`（它是 Source Han Sans 一脉），Saira 则没有声明保留名。
   本仓库子集化后把两个字族都改名为 `Endfield Sans SC` / `Endfield Tech`，没有沿用上游名称：
   对前者这是**必须**做的，对后者是顺带。这一点值得写明，因为从文件名看不出合规与侥幸的区别。

## 3. DeepSeek Harness

本插件是 DSH 的第三方插件，**不是** DeepSeek 官方项目。代码通过 DSH 公开的插件机制工作
（`dsh.bundle.patch` 清单、`webserver/index-inject` 注入行、`webServer.register` 路由、
插件槽位）。DSH 自身的包以 MIT 发布。

关于主题会把侧栏品牌显示为「终末地工业」：品牌呈现是 DSH **设计上可替换**的一环——
官方在自己的 `@deepseek-ai/dsh-client-ui-brand-official` 里写明「自有身份的部署……
组合另一个占据侧栏 slot 的包，占据 slot 是唯一的组合路径」。窗口标题与会话首屏的品牌
不在该 slot 体系内，不受本插件影响。
