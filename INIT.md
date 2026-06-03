# INIT.md

Historical snapshot of the kickoff prompt that started driftloop, preserved
verbatim from the planning conversation. The maintained, evolving project
context lives in [CLAUDE.md](CLAUDE.md); this file exists for traceability
only and is not read at runtime.

Recorded: 2026-06-03.

---

启动一个新项目，名字 driftloop，位置 ~/work/driftloop。

# driftloop 是什么

一个**纯前端 web app**，在浏览器里**实时算法作曲 + 合成多乐器音乐流**。
打开页面、点 Play，音乐开始、永远不停。点不同的 genre 按钮（lofi / ambient /
jazz / classical），风格平滑切换。完全离线运行（PWA），无服务器，无账号，
无 telemetry。

目标用户：自己用 + 想分享给朋友的人。不是商业产品，但要做到能扔到 GitHub
Pages 让别人打开 URL 就能用的完成度。

# 架构（已决，不再 revisit）

```
浏览器
├── 算法作曲层（vanilla JS, 规则 + 模板）
│   ├── 和弦进行库 / voicing 规则
│   ├── 鼓 pattern 模板
│   └── 贝斯走音
├── Magenta.js MelodyRNN（5MB 预训练，只管主旋律）
├── js-synthesizer (FluidSynth WASM, ~1MB)
└── GeneralUser-GS SoundFont (~32MB)
    ↓
WebAudio 调度播放
```

零 Python、零后端、零构建（vanilla HTML+JS+ESM 起步；如果需要再加 vite）。

# 重要的前情提要：为什么选这条路

driftloop 是 ~/work/distilmuse 的产品端继承。distilmuse 试图通过"蒸馏 AMT 学
生模型 + MLX-native"做同一件事，失败了。failure mode 已经验证清楚：

- AMT (stanford-crfm/music-small-800k) 无条件采样**结构性混乱**——10 秒内 14
  种乐器、每个音换一个 program，听感"一片子噪、乐器打架"。不是采样参数问题
  （top_p 从 0.98 收到 0.85 没有改善）。AMT 是为 anticipation（conditional
  续写）设计的，wrong tool for unconditional generation。
- 200 蒸馏样本远不够喂饱 transformer，学生模型 val_loss 在 step 200 就反弹。
  加到 1k-10k 量级要几天到几周算力。
- 蒸馏管线本身（v3 tokenizer + MLX 学生 + train loop）technical 上跑通了，
  纯粹是 teacher 输出质量这一层无解。
- SoundFont 渲染层验证 OK：见 ~/work/distilmuse/outputs/demo/index.html，
  js-synthesizer 在浏览器里跑 FluidSynth-WASM + GeneralUser-GS 音质和原生
  FluidSynth 完全一致。可以**直接搬过来当起点**。

教训：**生成式 AI 不是这个 app 的核心瓶颈，算法作曲 + 一点 ML 是更对路的工
具**。算法层负责音乐结构（永远在调内、永远在拍上、乐器分工清晰），ML 层只在
"主旋律"这一个有限子问题上加点新意。

# 里程碑（按这个顺序做，每一步停下来听）

## M1 — Algorithmic lofi 跑通端到端

- 一个 genre：lofi。
- composer.js：和弦库（5-10 个 lofi 经典 progression）+ 鼓 pattern（boom-bap
  slow）+ 贝斯（根音 + 偶尔过渡）+ 钢琴 voicing 规则。
- 输出 MIDI 事件 → js-synthesizer → WebAudio。
- 极简 UI：Play / Stop / New（重 seed 重起）。
- **Acceptance**：能听 5 分钟不闷、不乱。结构稳定（鼓不漂、调不跑），但每次
  New 又有新走向。

## M2 — 多 genre

- 加 ambient / jazz / classical（或者你听了 M1 觉得哪几个更值得做）。
- 每个 genre = 一组 chord_lib / drum_pattern / instrument_set / voicing_rule
  / bpm_range 的参数包。
- 按钮 grid 替换"New"，保留"Next"（跳到当前 genre 的下一段）。
- 切换 genre 时不能 hard cut；当前 bar 走完，下个 bar 开始用新参数。
- **Acceptance**：闭眼听，能凭耳朵分辨当前是哪个按钮（至少在过渡稳定 5 秒后）。

## M3 — 主旋律层升级到 MelodyRNN

- 集成 Magenta.js 的 Basic 或 Lookback MelodyRNN（先 Basic）。
- 当前小节的和弦 → MelodyRNN 起手音 prime → 续写 16 step 旋律。
- 用 grammar guard 把不在调内的音吸回最近的调内音。
- A/B 对比：纯算法主旋律 vs MelodyRNN 主旋律。
- **Acceptance**：MelodyRNN 版主旋律听感上"更像作曲家在 noodling"，但和弦/
  鼓/贝斯底层稳定性不下降。

## M4 — Production polish

- PWA-ify：manifest、service worker、icon、可"添加到主屏幕"。
- iOS Safari 的几个坑：autoplay 用户手势、audio session category、后台挂起
  恢复、静音档音频策略。
- 部署到 GitHub Pages。
- **Acceptance**：用手机打开线上 URL，点 Play，听 30 分钟无 glitch。

# 不要做的事

- **不要引入 Python 后端**——纯前端是核心约束，破了就回到 distilmuse 的复杂度。
- **不要加载 MelodyRNN 以上规模的模型**——MusicVAE / MusicGen 出范围。理由：
  下载体积爆炸、移动设备跑不动、和算法层职责重叠。
- **不要做账号系统 / 云同步 / 推荐算法**——这不是 Spotify。
- **不要试图对标 Suno / MusicLM / Endel**——目标不同，比不过。我们做的是"自
  己可掌控的、永远在播的、可读源码的"小工具。
- **不要做曲库播放**——一段都不能预录。所有声音都必须是当下浏览器里实时合成
  的。

# 项目骨架建议

```
~/work/driftloop/
├── README.md              English；项目说明、运行方法、deploy 步骤
├── package.json           如果用 vite；否则可以省
├── index.html             SPA 入口
├── src/
│   ├── composer/
│   │   ├── theory.js      调、和弦、音阶基础工具
│   │   ├── voicing.js     和弦摊成具体音的规则
│   │   ├── rhythm.js      节奏模板
│   │   └── genres/
│   │       ├── lofi.js
│   │       ├── ambient.js
│   │       ├── jazz.js
│   │       └── classical.js
│   ├── synth/
│   │   ├── fluid.js       js-synthesizer 包装
│   │   └── scheduler.js   按拍点 schedule midi 事件给 WebAudio
│   └── ui/
│       └── app.js         Play / Stop / 按钮事件
├── public/
│   ├── soundfonts/
│   │   └── GeneralUser-GS.sf2  从 distilmuse 搬过来
│   └── manifest.json
└── tests/
    └── theory.test.js     测可测的部分：voicing 是否在调内、节奏 grid 对不对
```

# 复用 distilmuse 的东西

直接 cp 过来的：

- `~/work/distilmuse/assets/soundfonts/GeneralUser-GS.sf2` → `public/soundfonts/`
- `~/work/distilmuse/outputs/demo/index.html`（已验证可工作的 js-synthesizer
  loading 代码）→ 起点，但要重构进 src/synth/

distilmuse 的 Python / MLX / distill / model 那一摊**全部不动**。distilmuse
仓库留着，作为蒸馏学习的记录归档。

# 第一步：搭骨架 + 把 demo 重做成 ESM 模块

具体顺序：

1. mkdir、git init、写 README.md。
2. cp SoundFont 过来。
3. 把 distilmuse demo 那段加载 js-synthesizer 的代码重构成 src/synth/fluid.js
   的 ES module（不要再用 `<script src>` 全局 JSSynth 那套）。
4. 写 index.html + 一个最小的 Play 按钮 + 弹一个静态 MIDI 音符（C4 500ms），
   验证 ESM 化后还 work。

第 4 步通了再开始写 composer。

读完以上，告诉我你计划怎么开搭。
