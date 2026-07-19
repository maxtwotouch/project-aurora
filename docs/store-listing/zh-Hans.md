# App Store listing — zh-Hans (简体中文)

> **Draft translation notice:** this locale's copy was drafted by an AI agent using the app's own `src/i18n/locales/zh.json` catalog for terminology, not by a professional translator. Per `docs/roadmap-2026-27.md` Phase 1 ("Native-speaker review of consent copy + store copy (de/fr/es/zh) — legal and quality gate before paid traffic"), **do not submit this locale to App Store Connect without a native-speaker review first.**

## App name
**特罗姆瑟极光**

Character count: 6 / 30.

Localized form of the proposed en-US name "Aurora Tromsø" (see that file's app-name note for the branding-mismatch open item, which applies identically here).

## Subtitle
**实时极光预报与观测点**

Character count: 10 / 30.

## Promotional text
实时极光评分，今晚最佳观测时段，特罗姆瑟28个命名地点及交通信息。支持五种语言。无需账户，不追踪用户。

Character count: 51 / 170. (Promotional text can be updated any time without a new binary submission — App Store Connect > App Store tab > this field is not versioned with the build.)

## Keywords
`北极光,极光预报,挪威,北极,KP指数,极夜,实时摄像头,观测点,今晚,天气`

Character count: 38 / 100. Comma-separated, no spaces after commas (spaces cost characters and Apple's keyword matching does not need them).

**Reasoning per term** (why each word/phrase is here, and why words already in the app name/subtitle are deliberately *not* repeated — Apple indexes name + subtitle + keywords together for search, so duplicating a word already present elsewhere wastes budget that could cover new ground):

- 应用名称与副标题已覆盖"极光""特罗姆瑟""预报""观测点"，此处不再重复以节省字符。
- "北极光"——中文用户最常用的搜索词，与仅含"极光"的名称形成互补。
- "挪威""北极"——地理限定词，覆盖尚未确定具体城市的泛搜索。
- "KP指数"——应用实际使用的专业术语（对应 `tonight.band.kpNow`），追光者常用搜索词，真实功能而非堆砌关键词。
- "极夜"——如实反映应用对极昼/极夜季节性的处理（"极光季暂未开始"状态）。
- "实时摄像头"——真实功能（实时天空摄像头），与"预报"意图不同的独立搜索场景。
- "观测点"——观测地点比较功能的自然中文说法，与副标题中的措辞互补而非重复。
- "今晚"——高频时间限定词，与应用自身用语一致（`common.tonightEyebrow`）。
- CJK 字符密度高，即使全部10个词加起来也仅约38个字符，远低于100字符上限；未进一步填满上限，以保持关键词精简、避免堆砌观感。

## Description
Character count: 966. Deliberately not stretched to ~2500 like the other locales: Chinese
characters carry far more information density than Latin-script characters (a rough rule of
thumb is 1 Chinese character ≈ 2-2.5 Latin characters for the same content), so a
structurally-equivalent, equally-complete description in Simplified Chinese is naturally much
shorter by character count — padding it to match the raw number would mean either repeating
content or adding filler, neither of which fits this app's factual/no-hype tone. Benefit-led,
no superlatives ("best", "amazing", etc. deliberately avoided per Apple's Guideline 2.3.1 and
this app's own factual/warm tone — see `src/i18n/locales/zh.json` for the in-app voice this
matches).

```
挪威特罗姆瑟（Tromsø）位于极光带内，是每年约9月至次年4月观测北极光相对可靠的地点之一。Aurora Tromsø 通过实时天气与地磁数据，帮助你判断今晚该去哪里、什么时候出发，而不是凭猜测。

今晚展望，一目了然
打开应用即可看到今晚的极光评分（满分100），综合云量、天黑程度与全球KP指数（地磁活动）计算得出。应用会标出最佳的三小时观测时段，并在夜间自动更新。

特罗姆瑟周边28个命名观测点
比较28个固定观测点——峡湾、湖泊以及远离市区光污染的暗夜停靠点——每个地点都有各自的实时评分、距市中心的距离和简短介绍。许多地点还提供实用的到达信息，如最近的公交站和停车场；标注为"已核实"的信息，均已与特罗姆瑟市政府（kommune）的资料进行过核对。可按预报强度或行车距离排序，一键打开导航。

地图、实时天空摄像头与极光影像
在地图上按行车顺序查看所有地点，出发前查看实时天空摄像头网格，还可浏览大学图像数据源（UiT / NO-SPACE）提供的近期极光影像，自行判断当前状况。

同样诚实地对待极昼
特罗姆瑟位于北极圈以北，大约每年5月中旬至7月下旬，极昼使天空整夜明亮——这段时间无论KP指数多高，都没有看到极光的实际可能。应用不会在此期间显示误导性的评分，而是明确告知你极光季暂未开始，并给出大致的重新开放日期。

支持五种语言
应用完整支持英语、德语、法语、西班牙语和简体中文，可随时在"设置"中切换——无论是旅行时希望使用自己的语言，还是把手机递给朋友使用，都很方便。

默认保护隐私
应用无需任何账户、登录或设置即可完整使用，也从不请求你的GPS位置——界面中显示的"距离"均基于地点固定坐标计算，而非追踪你的位置。如果你愿意，可以选择分享匿名的汇总统计数据（哪些地点被查看或用于导航，按小时汇总），帮助我们和特罗姆瑟市政府了解哪些地点真正有用。拒绝分享不会影响应用的任何功能，你也可以随时在"设置"中开启或关闭此项。本应用不包含任何第三方追踪器或广告SDK。

数据来源
天气数据来自MET Norway（挪威气象研究所），地磁活动数据来自NOAA空间天气预报中心，并在夜间定期更新。

Aurora Tromsø 只服务一个地方、只有一个目的：诚实、清晰地回答"今晚值不值得出门看极光"——不多不少。
```

## What's New template
Use for every release's App Store Connect "What's New in This Version" field. Fill in the
bracketed part per release; keep the rest as a stable, low-effort template so release notes
don't become a chore that gets skipped.

```
本次更新刷新了今晚的预报流程与地点信息。数据来源见"设置 > 关于"。如有问题或地点信息需要更正，请通过本页的支持链接联系我们。
```
