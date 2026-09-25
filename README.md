# 萌将三国 · 桃园演武

React＋Vite 纯前端卡牌游戏。身份、单挑、国战三种单人人机模式，其他角色由本地 AI 控制。包含标风 33 位武将和 6 位拓展武将，共 39 位。规则、AI、计时、存档和音频全部在浏览器运行，无需服务端运行时、数据库或语音 API Key。

## 在线游玩与一键部署

- [在线游玩（原站）](https://mengjiang-sanguo.gong-ads.chatgpt.site)
- [GitHub Pages](https://gchust.github.io/sgs/)：首次使用需要按下方说明启用 Pages，部署成功后可访问。
- [查看 Pages 部署状态](https://github.com/gchust/sgs/actions/workflows/deploy-pages.yml)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fgchust%2Fsgs%2Ftree%2Fdevelop)
[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2Fgchust%2Fsgs)

按钮会进入对应平台的部署向导；登录、授权复制仓库并确认项目名称后即可部署，无需配置游戏 API Key。Cloudflare 按钮使用 Workers Static Assets，仅托管静态文件，没有 Worker 业务代码。仓库默认分支为 `develop`。

## 对战模式

| 模式 | 人数 | 胜利条件 |
| --- | --- | --- |
| 身份场 | 2–7 | 你扮演主公，与忠臣一起击败所有反贼与内奸 |
| 单挑场 | 2 | 一将一命，击败对手，无主公加血和击杀奖励 |
| 国战场 | 4–7 | 同势力双将，亮将结盟，消灭其他势力及野心家 |

国战选择两名不同的同势力武将，全场武将不重复；体力上限取两将体力均值并向下取整。开局全部暗置，准备阶段可亮主将、副将、双将或继续隐藏，出牌阶段有独立亮将按钮；转换牌响应时也可先亮将。只有已亮武将提供技能。暗将不展示姓名、技能、性别和势力，AI 不读取其他角色的隐藏势力。已知主将优先决定性别，否则取已亮副将。

首次亮将固定势力；某势力确定人数已达到初始人数的一半（向下取整）时，后加入者成为独立的野心家。已阵亡者仍占名额，各野心家互相敌对。仍有未亮将的存活角色时不提前宣告势力胜利；最后一名存活者自动亮将。阵亡队友共享势力胜利，玩家可继续观战。已亮将者击败敌人摸2张，误杀同势力弃置手牌和装备；暗将击杀没有奖励。

这是基于[官方国战基础规则](https://www.sanguosha.com/news/20181102_3865_2514)改编的休闲模式，沿用本作标风与拓展技能、标准牌堆，并非官方国战复刻。暂不包含国战专属武将技能改版、专属牌、先驱、阴阳鱼、珠联璧合、鏖战及全部技能预亮触发机制。击杀奖励统一为2张。为避免不屈与连营在零体力弃牌阶段无限循环，该阶段自动放弃连营摸牌。单挑不包含官方1V1的选将禁将、候补和换将机制。

## 开发

源码与全部游戏资源：[gchust/sgs](https://github.com/gchust/sgs)。

本地开发和构建需要 Node.js 22.13+。支持 macOS、Linux 和 Windows，不依赖 Bash 或 GNU timeout。

```sh
npm ci
npm run dev
```

```sh
npm run lint
npm run build
node --test tests/*.test.mjs tests/game/*.test.mjs
```

`npm test` 会先构建再运行全部测试；`npm run preview` 可在本地查看构建结果。

## 静态部署

构建后将 `dist/` 目录的全部内容上传到任意静态站点托管服务即可。部署时不需要 Node.js、Worker、SSR、数据库、环境变量或服务端 API。请通过 HTTP(S) 访问，不能用 `file://` 双击打开 HTML。

默认使用相对资源路径，支持域名根目录以及 `/sgs/` 等子目录。页面、立绘、语音与 BGM 均随构建输出；首次访问子目录时保留末尾 `/`。参考 [Vite 静态部署](https://vite.dev/guide/static-deploy.html)。

### GitHub Pages 自动部署

仓库内已提供 [.github/workflows/deploy-pages.yml](.github/workflows/deploy-pages.yml)：每次推送到 `develop` 时，先检查 Pages 配置，再安装依赖、检查代码、构建、运行测试，最后发布 `dist/`。也支持手动触发。使用 GitHub 自动提供的 `GITHUB_TOKEN`，无需添加个人 Token 或仓库 Secret。

首次启用：

1. 打开 [Settings → Pages](https://github.com/gchust/sgs/settings/pages)，将 **Build and deployment → Source** 设为 **GitHub Actions**。
2. 打开 [Deploy GitHub Pages](https://github.com/gchust/sgs/actions/workflows/deploy-pages.yml)，点击 **Run workflow**，选择 `develop`；以后推送会自动更新。
3. 等待部署成功，访问 **https://gchust.github.io/sgs/**。实际地址也会显示在工作流的 `github-pages` 环境中。

Fork 后先在自己的仓库启用 Actions 和 Pages，再运行工作流；地址变为 `https://<用户名>.github.io/<仓库名>/`。请勿选择直接发布源码分支，浏览器需要构建后的文件。

如果 CI 报 `Get Pages site failed` / `HttpError: Not Found`，请先检查 **Settings → Pages → Source** 是否已设为 **GitHub Actions**。2026-09-08 的首次推送曾因 Pages 尚未启用而在部署阶段返回 404，当时构建和测试均已通过；同一提交随后手动运行部署成功。工作流现已把 Pages 检查提前到安装依赖之前，配置缺失会直接在 `Check GitHub Pages configuration` 步骤报错。

启用 Pages 后，在原失败运行中选择 **Re-run all jobs**，重新构建并部署。上传的 Pages 产物默认只保留 1 天，过期后仅选择 **Re-run failed jobs** 会因缺少产物再次失败。单独点击 **Run workflow** 会创建新的运行，不会更新旧运行的失败记录。

`actions/configure-pages` 的 `enablement: true` 需要额外授权的 Token，默认 `GITHUB_TOKEN` 不能用来首次启用 Pages，因此仍需先完成上面的仓库设置。

### Vercel

点击上方按钮，或在 Vercel 导入本仓库并选择 `develop` 作为生产分支。[vercel.json](vercel.json) 已配置 Vite、`npm ci`、`npm run build` 和输出目录 `dist`。部署完成后，平台提供实际的 `*.vercel.app` 地址；后续关联分支提交自动更新。

### Cloudflare

点击上方按钮，确认构建命令为 `npm run build`、部署命令为 `npx wrangler deploy`，Node.js 使用 22.13 或更高版本。[wrangler.jsonc](wrangler.jsonc) 指定 `dist` 为静态资源目录，不包含服务端入口或数据库绑定。部署完成后在控制台查看实际的 `*.workers.dev` 地址。

也可以使用 **Cloudflare Pages**：在 Workers & Pages 中创建 Pages 项目并连接本仓库，生产分支选择 `develop`，框架选择 Vite，构建命令填写 `npm run build`，输出目录填写 `dist`，根目录保持仓库根目录。部署后使用平台分配的 `*.pages.dev` 地址。Pages Git 集成不需要使用 Wrangler 部署命令。

官方说明：[Vercel 部署按钮](https://vercel.com/docs/deploy-button)、[Cloudflare 部署按钮](https://developers.cloudflare.com/workers/platform/deploy-buttons/)。这两个平台的个人部署地址需在各自部署成功后获取，本仓库不预设不存在的地址。

原 Sites 地址通过 `.openai/hosting.json` 的 `static.directory: "dist"` 发布相同静态产物，该配置只用于托管，不参与游戏运行。在其他平台部署无需此配置。

对局存档、音量和偏好保存在当前浏览器的 `localStorage` 中；同一域名继续沿用已有存档，换域名不会自动迁移。当前版本为单人人机游戏，没有在线房间、账号或云存档。

## 对局体验

- 古风乐坊收录优美、悲伤、激昂、快乐四种氛围的完整 BGM，支持单曲循环、下一首、切歌渐变和独立音量；配音期间自动压低音乐，切到后台暂停、返回继续，偏好自动保存。开局或点击播放后启用，不抢占语音队列。
- 固定中文神经网络语音素材，按顺序播报，不再使用浏览器朗读。91 条音频统一响度；独立语音和音效音量。语音加载失败会提示，规则结算可以继续。
- 默认出牌 60 秒、响应 20 秒，可在设置中修改。仅计算可操作时间；结算、暂停、打开详情及后台页面不扣时间。出牌超时结束阶段，可选响应超时跳过，必选操作超时采用首个有效选项。
- 慢速、标准、快速三档，暂停及单步结算。减少动态效果不会缩短阅读时间。
- 中央保留当前卡牌、出牌者、目标、响应及结果；前序卡牌可回看。杀与锦囊有目标连线，装备与技能有独立提示。
- 桌面默认常驻战报；按序号、轮次、出牌/响应/伤害/装备等类型展示。可筛选关键事件或与你相关的事件。滚动回看会固定内容并暂停，返回最新后点击继续恢复。小屏通过顶部战报按钮打开。
- 装备分武器、防具、进攻马、防御马，持续显示名称和明显颜色；支持点击查看效果。
- 拓展：典韦（强袭）、庞德（马术、猛进）、太史慈（天义）、袁绍（乱击）、孟获（祸首、再起）、祝融（巨象、烈刃）。

## 源码

- `index.html`、`app/main.jsx`：静态 HTML 入口与 React 客户端挂载。
- `app/game-table.jsx`：对局控制、倒计时、响应、设置、存档。
- `app/battle-ui.jsx`：当前出牌、装备、计时器、战报。
- `app/mode-ui.jsx`：模式入口、双将立绘、公开势力和国战规则。
- `app/music-panel.jsx`：曲目选择、播放控制、音乐音量与来源署名。
- `app/globals.css`：牌桌布局和动画。
- `lib/game/engine.js`：规则、技能、身份、距离、AI 和结构化事件。
- `lib/game/modes.js`：模式配置、同势力双将分配、存档校验。
- `lib/game/players.js`：亮将技能、公开姓名与性别、势力名称。
- `lib/game/clock.js`：活动时间计时与超时决策。
- `lib/game/data.js`：39 位武将和 106 张牌定义。
- `lib/game/presentation.js`：立绘裁切、座位。
- `lib/game/audio.js`：本地音频缓存、队列和分层音效。
- `lib/game/music.js`：BGM 流式播放、淡入淡出、配音避让与后台管理。
- `lib/game/assets.js`：适配根目录和子目录部署的资源路径。
- `public/assets/`：生成立绘与场景、合成语音、已授权背景音乐及其署名。

规则引擎通过 `update / beforeEvent / effect / sound / wait / ask` 与界面交互。`beforeEvent` 支持暂停与单步；`effect` 等待展示完成后继续规则。正在结算的实体牌会暂时排除在洗牌之外，避免装备替换等触发摸牌时出现重复牌。存档保存在浏览器的完整出牌阶段，v3 保存模式、双将、亮将状态和势力，并兼容原来的 v2 身份存档。

## 音频素材

出牌语音使用 Microsoft 中文 YunxiNeural 合成，经 FFmpeg 去除开头静音、统一到约 −18 LUFS。不是官方角色录音或真人配音。运行时只请求本站文件。

重新生成：安装 Python `edge-tts==7.2.8` 与 FFmpeg，再运行 `python scripts/generate-voice.py`。脚本读取 `public/assets/voice/manifest.json`，保留已有文件。服务使用与素材分发遵循相应提供方条款；本仓库不授予第三方品牌或官方素材权利。

背景音乐均为 Kevin MacLeod 的 CC BY 4.0 作品，原曲与来源见 [音乐署名](public/assets/music/CREDITS.md)。中文名为游戏展示名：烟雨江南（Ripples）、月下思归（Ishikari Lore）、万里山河（Mountain Emperor）、春日游园（Shenyang）。四个完整 MP3 已随仓库提交，运行时不依赖外站。重新处理可运行 `python scripts/prepare-music.py`，需要 FFmpeg 和网络；复制分发时须保留署名与许可。

顶部音符按钮或设置中的“背景音乐”可打开乐坊。浏览器首次播放需要用户操作；加载失败可点击重试，音乐不会阻塞游戏。播放控制测试覆盖暂停续播、切歌竞争、后台状态、配音避让、加载超时及资源校验。

## 规则边界与验证

这是独立实现的休闲规则，不是官方客户端或完整规则复刻。没有军争牌、神将、主公技；牌堆花色点数重新编排。观星只整理顶牌，遗计每次只分配一张，部分可选技能按图鉴说明简化。

自动验证覆盖身份场全部 39 将 × 2/5/7 人（117场）、国战全部 39 主将 × 4/6/7 人（117场）和单挑39将（39场），共273场完整对局，每回合检查实体牌唯一性；另覆盖同势力配将、亮将前后技能与性别、暗将姓名隔离、响应亮将、野心家名额、友军误杀、阵亡队友获胜、零体力连营、存档兼容以及原有计时与结算回归。静态产物入口、根目录与子目录资源路径、完整资源复制以及暗将组件渲染也有测试。尚未进行浏览器视觉与真实设备音频验收。
