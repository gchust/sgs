# QSanguosha 语音来源与许可

语音素材来源：[Mogara/QSanguosha](https://github.com/Mogara/QSanguosha)，感谢 QSanguosha 项目及原素材贡献者。台词以仓库附带的原始翻译文件为准，未对未注明的演员身份作推断。本项目与原项目及相关权利人无隶属关系，不代表其认可或背书。

根据上游 [README 的 Material 说明](https://github.com/Mogara/QSanguosha/blob/85baa7489157c023bb2528a40ce4ef4e12863387/README.md)，素材使用 **[CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/)**。复制与分发应保留署名及许可，仅限非商业用途，不得分发改编素材。上游代码的 GPL 许可与素材许可不同。完整许可文本随附于 [LICENSE.txt](LICENSE.txt)，上游声明原文保存在 [UPSTREAM-README.md](UPSTREAM-README.md)。

## 固定版本

- 主来源提交：`85baa7489157c023bb2528a40ce4ef4e12863387`，包含 100 条技能录音、28 条男女出牌录音。
- 历史来源提交：`aaf2ef365c6a0a0d0932a4e0506d09342835e202`，同一仓库切换国战素材前的版本，补充蛊惑 2 条、连营 2 条、红颜 1 条。
- 共 133 个原始 OGG 文件，39 位武将、53 个角色技能项、105 条技能录音；另有 14 种牌各男女两种录音。

文件保持原始字节，未变速、变调、裁剪、转码或重制响度。播放时只应用用户音量和背景音乐避让。每条文件的原始路径、固定提交、SHA-256 及台词来源记录在 `../characters.json` 或 `../manifest.json`。台词文件原文保存在 `transcripts/`。

马超、庞德的马术以及黄月英的奇才，在所选源版本中没有独立录音，因此不以其他角色或合成音冒充；这些技能仍保留游戏音效。装备和开局等未匹配到原始配音的事件也只播放提示音。

## 复现

在仓库根目录运行 `python3 scripts/import-qsanguosha-voice.py` 可重新获取缺失素材，已有文件按提交的 SHA-256 校验。运行 `python3 scripts/import-qsanguosha-voice.py --verify` 可离线校验。没有调用任何收费服务。
