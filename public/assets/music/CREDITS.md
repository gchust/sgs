# 背景音乐署名与授权

| 文件 | 游戏内名称 / 氛围 | 原曲 | 作者 |
| --- | --- | --- | --- |
| serene.mp3 | 烟雨江南 / 优美 | [Ripples](https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100691) | Kevin MacLeod |
| sorrow.mp3 | 月下思归 / 悲伤 | [Ishikari Lore](https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100192) | Kevin MacLeod |
| heroic.mp3 | 万里山河 / 激昂 | [Mountain Emperor](https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1700012) | Kevin MacLeod |
| joyful.mp3 | 春日游园 / 快乐 | [Shenyang](https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1600066) | Kevin MacLeod |

Ripples, Ishikari Lore, Mountain Emperor, Shenyang by Kevin MacLeod (https://incompetech.com).
Licensed under Creative Commons: By Attribution 4.0 License
https://creativecommons.org/licenses/by/4.0/

作者授权说明：https://incompetech.com/music/royalty-free/licenses/

这些音乐为第三方作品，不是本项目原创音乐或官方三国杀音乐。请在复制、分发或改编素材时保留作者、作品名、来源与许可链接，并标明修改。中文名称与氛围是本游戏的展示名称和主观分类，原曲名如上。

处理：完整曲目保留旋律，使用 FFmpeg 统一响度（目标 −21 LUFS、真峰值 −2 dBTP、响度范围 11 LU），转为 44.1 kHz、立体声、160 kbps MP3，并移除原附带封面、写入署名元数据。播放器另外提供淡入淡出、循环和配音时降低音量。

`sources.json` 记录官方原文件地址及处理前后的 SHA-256；`scripts/prepare-music.py` 可重新下载和处理。不同 FFmpeg 版本重新编码后的字节校验值可能不同。仓库已包含可直接播放的四个完整文件，运行游戏无需连接音乐作者的网站。
