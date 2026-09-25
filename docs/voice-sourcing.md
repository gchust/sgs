# 免费配音来源与低成本生成方案

核查日期：2026-09-25。需求：优先免费、公开可下载的现成游戏角色语音；其次考虑免费本地生成或极低成本按量生成。排除付费真人定制。

## 已实施选择

用户已选择 Mogara/QSanguosha。本项目现接入 133 条原始录音（105 条技能、28 条男女出牌），来源版本、缺失技能和许可见 [完整署名](../public/assets/voice/qsanguosha/CREDITS.md)。未使用收费服务。以下保留选择前的方案调研和原合成台词费用示例，不代表当前采用这些合成方案。

## 原调研结论

1. **现成素材优先试听 Mogara/QSanguosha。** 已找到真实可下载的技能 OGG，适合对比武将台词的表演风格。素材并非无条件商用：仓库将 Material 单列为 CC BY-NC-ND 4.0。
2. **自己免费生成优先试 Qwen3-TTS-12Hz-1.7B-VoiceDesign。** 可以用自然语言描述角色声音、语气与韵律，再复用自生成的参考音频以保持角色一致性。无需从演员录音克隆声音。代码许可为 Apache-2.0。
3. **如果不想部署模型，优先小规模试阿里云 Qwen3-TTS Instruct Flash Realtime。** 官方页面当前列价为 1 元/万字符；先用系统音色生成四位武将的对比样音，再决定是否替换全量。尚未调用收费接口。

上述是按素材匹配度、公开能力、授权说明和费用作出的选型建议，不是对所有模型完成同台听测后的质量排名。

## GitHub 现成语音：QSanguosha

- 仓库：[Mogara/QSanguosha](https://github.com/Mogara/QSanguosha)。
- [技能音频目录](https://github.com/Mogara/QSanguosha/tree/master/audio/skill)：核查到 **231 个 OGG 文件**，目录总条目 233。未声称已覆盖本项目所有技能。
- 本次取样固定提交：`85baa7489157c023bb2528a40ce4ef4e12863387`。
- [README 的 Code / Material 说明](https://github.com/Mogara/QSanguosha/blob/85baa7489157c023bb2528a40ce4ef4e12863387/README.md)：代码为 GPL-3.0；素材为 **CC BY-NC-ND 4.0**，包含署名、非商业、禁止分发改编素材的条件。不能把代码 GPL 标记当作音频可任意使用的承诺。
- 下列四个原始样本已实际下载，均返回 HTTP 200，并通过 FFmpeg 完整解码检查；没有变速、变调、裁剪或转码，取样阶段尚未放入线上游戏；现已随完整原始录音包接入。

| 角色 / 技能 | 原始文件下载 | 大小 | SHA-256 |
| --- | --- | ---: | --- |
| 关羽 / 武圣 | [wusheng1.ogg](https://raw.githubusercontent.com/Mogara/QSanguosha/85baa7489157c023bb2528a40ce4ef4e12863387/audio/skill/wusheng1.ogg) | 29,657 B | `00e8b6fee72b9233d3797dd6c02e6be18baf0070e688cf827bebc3ecad10b073` |
| 张飞 / 咆哮 | [paoxiao1.ogg](https://raw.githubusercontent.com/Mogara/QSanguosha/85baa7489157c023bb2528a40ce4ef4e12863387/audio/skill/paoxiao1.ogg) | 19,016 B | `0d9ff9356da100f639c8c4249652138a8b89cfdd327fbc7d5e41435074f4976f` |
| 赵云 / 龙胆 | [longdan1.ogg](https://raw.githubusercontent.com/Mogara/QSanguosha/85baa7489157c023bb2528a40ce4ef4e12863387/audio/skill/longdan1.ogg) | 22,652 B | `37229dcb83f17305ed362b32742ebc25cf967b42e5a871e19d67a586996ea70d` |
| 黄月英 / 集智 | [jizhi1.ogg](https://raw.githubusercontent.com/Mogara/QSanguosha/85baa7489157c023bb2528a40ce4ef4e12863387/audio/skill/jizhi1.ogg) | 16,703 B | `bddd291a6b7df6f942bfbd2ba7a351a0620e9035168b50cbe9a7d643b09f4f4e` |

本地取样与清单保存在 `/tmp/sgs-voice-research/`，该临时目录不属于发布产物。下载与解码检查不等于已由人耳完成听感验收。

## 其他 GitHub 项目检查

- [libnoname/noname](https://github.com/libnoname/noname)：README 写明 GPL-3.0，并提出保留出处和不要用于商业用途的项目使用约定。当前主分支根目录 `/audio` 返回 404，当前递归树也未直接列出 OGG/MP3 素材库。因此本次不把它列为已验证可直接下载的样音来源；没有把旧分支路径当成当前有效下载地址。
- [Qsgs-Fans/FreeKill](https://github.com/Qsgs-Fans/FreeKill)：核心仓库 `audio/` 本次只列出 `card`、`system` 子目录。武将扩展资源需要另查相应包，不能仅凭框架 GPL 许可推断某个角色录音的使用许可。

## 免费本地与低成本云端比较

| 方案 | 费用口径 | 与本项目有关的能力 | 实施注意 |
| --- | --- | --- | --- |
| Qwen3-TTS 1.7B VoiceDesign / CustomVoice | 自部署无按字符 API 费；需要本机算力、电费和下载空间 | 中文；自然语言控制声音、情绪、韵律；VoiceDesign 可设计不同角色；官方提供“先设计，再复用自生成参考音频”的一致性流程 | 官方代码 Apache-2.0；本机为 Apple M4 / 16 GiB，尚未安装或测量推理速度，需单独验证兼容实现与内存占用 |
| IndexTTS-2.5 | 自部署无按字符 API 费；需要本机或租用算力 | 官方在 2026-08-10 发布 2.5；支持情绪参考、八维情绪向量、文字情绪描述和中文发音控制 | 需要参考声线；适用 bilibili Model Use License，不能标成 MIT/Apache 无条件许可；尚未做本机运行或听感比较 |
| 阿里云 Qwen3-TTS Instruct Flash Realtime | 当前官方价 **¥1 / 万字符** | 自然语言指令控制表达与情感，官方页面列出 25 个音色的中英文 Instruct 调节 | 此处价格对应 `qwen3-tts-instruct-flash-realtime`，不是所有 Qwen 语音模型；需要账号/API Key，免费额度未在本次核查中确认 |
| MiniMax Speech-2.8-Turbo | 国际站当前官方价 **US$60 / 百万字符**；HD 为 **US$100 / 百万字符** | 按量生成语音；可先用系统音色与其他模型做同句对照 | **Voice Design 另收 US$3 / 声线**，快速复刻另收 US$1.5 / 声线，首次用于合成时计费；为省钱不应先设计 39 个付费声线 |

### 官方来源

- Qwen 模型能力、声音设计和一致性流程：[QwenLM/Qwen3-TTS](https://github.com/QwenLM/Qwen3-TTS)。
- Qwen 许可：[LICENSE](https://github.com/QwenLM/Qwen3-TTS/blob/main/LICENSE)；官方模型卡：[Qwen3-TTS-12Hz-1.7B-VoiceDesign](https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign)。
- IndexTTS 功能与当前发布：[index-tts/index-tts](https://github.com/index-tts/index-tts)；许可：[LICENSE](https://github.com/index-tts/index-tts/blob/main/LICENSE)。
- 阿里云型号与价格：[qwen3-tts-instruct-flash-realtime](https://help.aliyun.com/zh/model-studio/qwen3-tts-instruct-flash-realtime)。
- MiniMax 国际站价格与声线额外费用：[Pay as You Go](https://platform.minimax.io/docs/guides/pricing-paygo)。

## 本项目的费用量级

对替换前旧合成版 `public/assets/voice/characters.json` 实际统计：**112 条台词，892 个汉字，包含标点共 1,116 个字符**。

- 若按 1,116 个计费字符示例计算，阿里云上述型号一遍文字合成费为 `1116 / 10000 × ¥1 = ¥0.1116`。
- 同样按 1,116 个计费字符示例计算，MiniMax Turbo 一遍文字合成费为 `1116 / 1000000 × US$60 = US$0.06696`，HD 为 US$0.1116。
- 这是按字符数作出的费用示例，不是账单承诺：各平台的中文/标点计数口径、重试、重新生成、地区价格、最低充值、税费及声线设计/复刻费不在该计算内。没有为此开通、充值、订阅或调用收费服务。
- 因为游戏使用的是预生成的静态音频，接入后不会随每次技能触发再次支付 TTS 合成费。

## 建议的下一步样音标准

先做四角色同句对照，不再先全量替换 112 条：

| 角色 | 表演目标 | 本项目原有试音台词 |
| --- | --- | --- |
| 关羽 | 低沉、克制、有压迫感；落点坚定，避免逐字播报 | 忠义在心，此刀不退！ |
| 张飞 | 胸腔发力，战斗中的爆发；保留真实气口，避免只提高音量 | 来呀！再接我一矛！ |
| 赵云 | 清朗利落，短句收尾干净；坚定但不播新闻 | 枪随心动，进退自如！ |
| 黄月英 | 聪慧、有灵感迸发的喜悦；自然轻快，避免每句统一上扬 | 从现有集智台词中选择一句，保持文本一致 |

对比时优先听停顿、重音、尾音、气口、角色差异和连续听十次是否刺耳。技术解码通过只能证明文件可播放，不能代替这些听感判断。
