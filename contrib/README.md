# 提交到插件目录 / Submitting to the catalog

这一节只写给本仓库的维护者，**不会**出现在提交里。

This file is for this repository's maintainer. None of it goes into the submission.

## 步骤

目录是 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)，
投稿方式是**一个 PR 加一个文件**——两个 README 都由 `data/plugins/*.yml` 生成，
手工编辑会被 CI 拒。

```sh
git clone https://github.com/awesome-dsh-plugin/awesome-dsh-plugin.git
cd awesome-dsh-plugin
git checkout -b add-dsh-endfield-theme
mkdir -p data/plugins
# 只取五个字段：模板顶部的注释是写给本仓库维护者的，不随提交走。
# 现有 4401 个条目里有 4335 个是纯数据，交上去的也应当是纯数据。
grep -v '^#' <本仓库>/contrib/awesome-dsh-plugin.yml \
  > data/plugins/Longxiangjunlin__dsh-endfield-theme.yml
git add data/plugins/Longxiangjunlin__dsh-endfield-theme.yml
git commit -m "Add dsh-endfield-theme"
git push -u origin add-dsh-endfield-theme
```

推完终端会回一个开 PR 的链接。

**别用 PowerShell 的文本管道处理这个文件**（`Get-Content` / `Set-Content`）：它按 GBK 读、再按
UTF-8 写，中文会当场变成乱码，而乱码会把 `zh` 那行的收尾引号吃掉，YAML 随即报
`unexpected end of the stream within a single quoted scalar`。目录的 CI 里就有这么一条真实案例。
`grep` 在 `sh` 里是按字节走的，所以上面那条命令没问题；要核对就直接读文件，不要过文本管道。

## 提交前的清单

| 要求 | 状态 |
| --- | --- |
| `package.json` 声明 `dsh.bundle.patch`，且有 `cordis.patch.yml` | ✅（这是最常见的被拒原因） |
| 仓库有真实可用的代码 | ✅ `npm test` 覆盖 host 半区 |
| 仓库创建满 1 天（CI 自动检查） | ✅ 用 `/repos/<owner>/<repo>` 的 `created_at` + 24h 核对过 |
| 仓库带 `dsh-plugin` topic | ✅ 已设置 |
| 描述只讲功能、不带营销词 | ✅ |
| 描述与代码相符 | ⚠️ **提交前重新逐条核对** |

最后一项不是形式主义。这一栏最容易出的错是"读起来很合理、但代码里不是这样"：
注入行数、开关的行为、某个交互是否存在，都得对着代码量一遍，而不是对着印象写。

## 描述里为什么写了品牌位

条目描述里主动写了「侧栏品牌会改为终末地工业」。这是本插件后果最重、也最容易被质疑的行为，
藏着不说反而更糟：维护者读代码时一定会看到，而描述被当作对插件的声明来核对。
写明它、并说明可以用 URL 参数还原，比让对方自己发现要诚实。
