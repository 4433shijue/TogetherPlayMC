# 致谢与第三方来源

核对日期：2026-11-19。以下区分实际使用的组件、运行环境与调研参考；标注上游项目不代表上游作者参与、认可或维护 TogetherPlayMC。

## 《元素觉醒 / Elemental Awakening》

特别感谢 **Sh1ntaro** 及整合包内各模组作者。

- 作者发布与下载：[XyeBBS《元素觉醒正式版》](https://www.xyebbs.com/res-id/ELA)。
- 作者发布视频：[元素觉醒正式版](https://www.bilibili.com/video/BV1oTtA6GEYG/)。
- 本项目适配与历史游戏验证的具体环境：《元素觉醒 1.4.6》、Minecraft Java 1.20.1、Forge 47.4.22。完整边界见 [兼容性说明](docs/compatibility.md)。
- 原发布页标注 All-Rights-Reserved / No License。TogetherPlayMC 不再分发整合包文件、任务文本、图像、音乐、脚本或其模组集合。资料索引只从用户自己的本机安装中读取，并留在本机数据目录。
- TogetherPlayMC 是独立陪伴工具，不是《元素觉醒》的官方插件或合作项目。整合包、Minecraft 及各模组的名称、素材和权利属于原作者。

## 实际使用的开源组件

| 项目及来源 | 本项目使用方式 | 当前版本 / 许可 |
| --- | --- | --- |
| [Transformers.js](https://github.com/huggingface/transformers.js) | 本机文本向量推理 | 3.8.1，Apache-2.0 |
| [多语言 MiniLM 原模型](https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2) / [Xenova ONNX 转换版](https://huggingface.co/Xenova/paraphrase-multilingual-MiniLM-L12-v2) | 中文语义记忆召回，使用量化 ONNX 权重 | 固定 revision `2c4055b12046f11709e9df2c122e59ffbdc2f900`，Apache-2.0 |
| [ONNX Runtime](https://github.com/microsoft/onnxruntime) | Transformers.js 的推理运行时 | Node 1.21.0；Web 版本见锁文件，MIT |
| [Electron](https://github.com/electron/electron) | Windows 桌面、托盘和网页容器 | 45.2.1，MIT；Chromium 其他声明随包保留 |
| [Node.js](https://github.com/nodejs/node) | 本地服务、文件和 SQLite API | Windows 包内 24.19.0，MIT 及内含依赖声明 |
| [Mineflayer](https://github.com/PrismarineJS/mineflayer) | 旧版操作模式中的游戏连接与状态 | 4.39.0，MIT |
| [mineflayer-pathfinder](https://github.com/PrismarineJS/mineflayer-pathfinder) | 旧版模式寻路 | 2.4.5，MIT |
| [prismarine-nbt](https://github.com/PrismarineJS/prismarine-nbt) | NBT 数据读取 | 2.8.0，MIT |
| [vec3](https://github.com/PrismarineJS/node-vec3) | 向量运算 | 0.1.10，上游包标注 BSD；保留上游声明 |
| [fflate](https://github.com/101arrowz/fflate) | ZIP 处理 | 0.8.3，MIT |
| [yauzl](https://github.com/thejoshwolfe/yauzl) | 按条目读取用户导入的整合包及模组 JAR | 3.4.0，MIT |
| [sharp](https://github.com/lovell/sharp) / [libvips](https://github.com/libvips/libvips) | Transformers.js 间接依赖的图像处理组件 | sharp 0.34.5 / libvips 8.17.3；Apache-2.0 与 LGPL-3.0-or-later 等第三方许可 |
| [Fabric Loader](https://github.com/FabricMC/fabric-loader) / [Fabric API](https://github.com/FabricMC/fabric-api) | Fabric 伙伴模组的加载与事件 API | Loader 0.16.14 / API 0.92.2+1.20.1，Apache-2.0 |
| [Minecraft Forge](https://github.com/MinecraftForge/MinecraftForge) | Forge 伙伴模组的加载与事件 API | 47.4.22，LGPL-2.1；用户安装的游戏环境提供 |
| [Gradle](https://github.com/gradle/gradle) / [Fabric Loom](https://github.com/FabricMC/fabric-loom) / [ForgeGradle](https://github.com/MinecraftForge/ForgeGradle) | 模组构建工具 | 8.7 / 1.6.12 / 6.0.36，分别按上游许可证使用，不随 Windows 应用分发 |
| [CustomSkinLoader](https://github.com/xfl03/MCCustomSkinLoader) | 可选旧版托管环境的本地皮肤显示 | Universal 15.1，按上游许可；准备脚本按需下载，不内置于本发行包 |
| [Playwright](https://github.com/microsoft/playwright) | 本地网页验收 | Apache-2.0，开发工具，不随应用分发 |

传递依赖、许可证原文和库版本以锁文件、`THIRD_PARTY_NOTICES.md`、依赖自带文件及 `third-party-licenses` 为准。Windows 包保留 Electron 的 `LICENSE`、`LICENSES.chromium.html`，全部已分发 npm 依赖的许可文件，以及模型卡与模型来源清单。

## 调研与设计参考，未直接接入完整项目

[Hindsight](https://github.com/vectorize-io/hindsight)、[Mem0](https://github.com/mem0ai/mem0)、[Graphiti](https://github.com/getzep/graphiti)、[Letta](https://github.com/letta-ai/letta-code)、[LangMem](https://github.com/langchain-ai/langmem)、[LLMLingua](https://github.com/microsoft/LLMLingua)用于比较记忆、上下文分层和增量整理思路。相关流程在现有 Node/SQLite 架构内实现，没有部署这些完整服务，也没有把用户聊天提交给它们。

[LiteLLM](https://github.com/BerriAI/litellm)、[LMCache](https://github.com/LMCache/LMCache)、[vLLM](https://github.com/vllm-project/vllm)、[GPTCache](https://github.com/zilliztech/GPTCache)用于缓存方案评估，未安装为运行依赖。当前使用轻量供应商协议适配，未引入语义回答缓存或自建推理服务。

协议依据：[OpenAI](https://developers.openai.com/api/docs/guides/prompt-caching)、[Anthropic](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)、[DeepSeek](https://api-docs.deepseek.com/guides/kv_cache/)、[Gemini](https://ai.google.dev/gemini-api/docs/caching)。

## 游戏与启动器

Minecraft 属于 Mojang Studios / Microsoft；TogetherPlayMC 不是官方 Minecraft 产品，未获其批准或与其关联。Minecraft、Java 安装程序、PCL/HMCL 和《元素觉醒》均不包含在本仓库或 Windows ZIP 中，请从各自原作者或官方渠道取得。
