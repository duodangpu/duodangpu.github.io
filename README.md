# 多当铺

明亮、圆润、极简的作品合集与直播目录，使用 GitHub Pages。生产前台在本目录维护，历史设计留在上级文件夹。

## 当前内容和能力

2026-10-29 重新只读核对 Notion：4 部作品、2026-10-28 一场直播、18 个节目和 17 条原视频链接。当前完整直播回放地址为空，网盘地址也为空。页面不虚构入口，原视频明确标为“原视频”，不是 Reaction 回放。

- 作品分类、作品/节目/日期搜索、整卡打开详情。
- 同一详情里先显示 B站/网盘合集；存在明确关联时，折叠展示相关直播。
- 直播场次与搜索结果默认折叠，按需展开节目单；已提供完整回放才出现观看按钮。
- 电脑四列、平板三列、手机两列；手机按需展开搜索。
- 缺封面显示标题，支持键盘关闭与焦点返回，所有内容以文本渲染。

4 张现有封面均为约 4:3 横图，首版按横图完整展示，不裁掉图片中文字。白色整卡、圆角和柔和阴影沿用已认可的设计。不要恢复宣传语、冗余介绍或卡片小字。

### 统一后的视觉语言

用户喜欢的 Codex 界面作为质感方向。当前使用本项目自己的样式变量，不依赖或声称复用 Codex 内部参数。

- 标题、按钮、标签和弹窗共用系统无衬线字体，中文正文保持清楚可读。
- 控件圆角14px，整卡22px（手机18px），弹窗28px（手机24px）；边界和两层轻阴影使用统一变量。
- 导航和按钮采用低对比中性色状态；搜索框整体显示焦点，不叠加内部输入框描边。
- 卡片悬停轻移2px，展开和弹窗使用短促淡入反馈；减少动态效果偏好下关闭动画。
- 手机详情使用上图下文布局，观看按钮和关闭控件保持44px触摸区域。

## 本地使用

运行时 Node.js 22 或更新版本。构建无需安装运行依赖。

```powershell
npm run build
npm run preview
```

打开 http://127.0.0.1:8777/ 。预览使用构建后的 `dist/`，不要直接打开源码目录的 index.html。

`npm run build` 读取 `public-snapshot.json`，它是已经核对过的公开快照，并非实时同步。构建仅复制前台、公开数据和被引用的封面，历史稿、测试和配置不会进入发布包。

```powershell
npm ci
npm test
npx playwright install chromium
npm run test:ui
```

UI 测试使用 Node Playwright。当前电脑的系统和打包 Python 都无 Playwright，复用已有 Node 版本完成验证；无需向用户 Python 安装包。可用环境变量 `CHROME_PATH` 指定本机 Chrome，未指定时使用 Playwright Chromium。截图写入忽略的 `test-results/`。

## Notion 内容维护

维护源仍为三个既有库，不需要更换后台：

| 库 | 使用字段 |
| --- | --- |
| Reaction 作品库 | 作品名称、分类、封面、更新进度、B站Reaction合集、网盘Reaction链接 |
| 按日期看回放 | 直播场次、直播日期、B站回放 |
| 按节目找回放 | 视频标题、所属直播、原视频、约时长（分钟）、表内顺序 |

只读取这些公开字段，不发布推荐人、简介、内部备注。Notion 上传图片在构建时下载为静态文件，不向访客暴露会过期的文件签名地址。

目前节目库没有作品关联字段，因此没有编造相关直播。如需使用作品详情中的相关直播功能，可在节目库增加可选关系字段 **关联作品**，指向 Reaction 作品库。多条节目可以关联同一部作品，也可以一条节目关联多个作品。未填时不出现相关直播区域。原有“所属直播”仍须关联一场直播。

同步命令：

```powershell
npm run build:notion
```

需要 `NOTION_TOKEN` 环境变量，以及对三个数据库的读取权限。集成只需读取权限。不把 Token 写进源码、JSON、浏览器或聊天。

字段错误、缺少关联、分页异常、无效网址或封面下载失败时，构建失败并保留上一次成功结果；不会静默退回旧快照后声称已同步。删除作品前先清理相关节目里的“关联作品”，删除直播前先处理所属节目。作品库意外变空也会停止发布。

## GitHub Pages 发布

组织站点仓库： https://github.com/duodangpu/duodangpu.github.io ，目标网址：https://duodangpu.github.io/ 。本地保留 `origin` 指向原仓库，新增 `organization` 指向组织仓库；后续发布使用 `git push organization main`。

原仓库 https://github.com/xiaomishuai/duodangpu 及其 Pages 保留不动。两个仓库不是自动镜像，组织站点后续更新应推送到 `organization`。本地从原 main `66632caf81fad43b6cc060327c3af25b9b93fb3c` 克隆，旧站可通过 Git 历史恢复。

2026-10-29 首版已正式发布：https://xiaomishuai.github.io/duodangpu/ 。发布PR #1已合并，Pages源已设为GitHub Actions，云端数据测试、双端浏览器测试与部署全部成功。发布记录：https://github.com/xiaomishuai/duodangpu/actions/runs/40831988373 。

目前线上使用2026-10-29核对的公开快照，尚未配置NOTION_TOKEN。后续接通Notion自动更新需要：

1. 在 Notion 创建内部集成，并在三个数据库中添加该连接，授予读取权限。
2. 在组织网站仓库 `duodangpu/duodangpu.github.io` 的 **Settings → Secrets and variables → Actions** 添加 `NOTION_TOKEN`，不必配置到旧仓库。仓库级 Secret 不会因为复制 Git 历史而自动迁移。
3. 在 Actions 运行 **Publish 多当铺**，内容来源选 `notion`，核验读取最新数据并成功发布。

工作流先构建、运行数据测试和双端浏览器测试，全部通过才部署 `dist/`。推送 main 时已配置 Token 则读取 Notion，否则使用核对过的快照。手动选 `notion` 或定时任务必须成功读取 Notion，缺 Token 就失败，保留线上版本。

定时触发约为北京时间 02:17、08:17、14:17、20:17；GitHub 定时任务可能延迟，也可以手动运行更新。GitHub 对长期无活动的公开仓库可能暂停定时任务，届时在 Actions 恢复即可。这里只是静态页面生成，不运行常驻服务器。

原站线上1440px/390px实测通过：HTTP200、4张封面正常、首页/节目搜索默认折叠，点击后显示3条张杰节目原视频，观看合集入口正确、无横向溢出及脚本错误。复验可运行 `node tests/live-site.cjs`（需要Playwright和外网权限），默认检查新组织网址；可通过 `SITE_URL` 环境变量指定原站。截图位于 `test-results/online-*.png`。

上线完成不代表Notion自动同步已经接通；真实Token读取、后续更新与定时同步仍待上述配置和验收。
