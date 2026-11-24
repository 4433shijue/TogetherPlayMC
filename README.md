# TogetherPlayMC · 一起玩 MC

一个属于你的本地 Minecraft AI 伙伴。你照常玩，他在身边陪你聊天、记住共同经历，在你需要时帮忙查资料。

**Windows · Minecraft Java 1.20.1 · 单人世界 · 当前版本 0.16.0**

[下载 Windows 完整版](https://github.com/4433shijue/TogetherPlayMC/releases/latest) · [更新说明](docs/v016-release-notes.md) · [开源项目与整合包致谢](CREDITS.md) · [适配范围](docs/compatibility.md)

## 已有功能

- **游戏里的伙伴**：客户端形象、跟随、多种外观与性格。主模式不生成第二名玩家，也不给模型直接操作世界的权限。
- **文字与截图对话**：原生聊天、F8 面板、网页；流式回复与取消；独立识图连接。支持 OpenAI Chat Completions、Responses、Anthropic Messages、Gemini 四种协议。
- **共同记忆**：按伙伴、存档和维度隔离；固定记忆、来源证据、待确认修正与修改历史。中文关键词与本机多语言语义模型联合检索，可选增量历史整理默认关闭。
- **小球赠礼（开发版）**：在私人单人世界按 F8，点击“礼物：关”开启。首次开启为“随心”：伙伴沿用自己的角色卡，根据聊天决定是否主动送东西，或怎样回应你的索要，可以送跨进度的生存物品。再点一次切换“进度”，只赠送有取得记录、背包中已有或符合已学配方条件的物品；再点关闭。设置按存档保存。需同时更新本地服务和伙伴模组，并使用支持工具的原生或 JSON 模型模式。
- **一起冒险**：日记、截图、地点簿、共同目标、上次回顾；按来源读取本机整合包的配方、任务、手册和静态资料。
- **看清模型输入**：检查每轮上下文、检索来源、工具轮次、真实用量和缓存回执。支持预算限制及可预览、可取消的三次缓存验证。
- **数据归你**：角色卡导入导出、备份、恢复；API 密钥在本机保护保存。语音默认关闭。

## 快速开始

1. 从 [Releases](https://github.com/4433shijue/TogetherPlayMC/releases/latest) 下载 Windows ZIP，完整解压。不要只复制 EXE。
2. 如有旧版运行，先保存退出游戏，再从托盘退出旧版桌面与本地服务。
3. 双击 TogetherPlayMC.exe，选择“开始连接”。
4. 在“连接与安装”添加已安装好的 1.20.1 Fabric / Forge 游戏，并安装伙伴模组。
5. 在“连接模型”填写自己的 API 地址、密钥和模型，再用原来的启动器进入单人世界。

需要自己的 Minecraft、Java 17、游戏加载器和模型接口。发行包不提供 Minecraft、启动器或整合包。模型接口可能收费，缓存收益以供应商回执与账单为准。

常用按键：T 原生聊天；F8 伙伴面板；F7 取消回复与语音；F9 截图；启用语音后 F6 按住说话。冲突时可在游戏按键设置中调整。

数据默认位于 `%LOCALAPPDATA%\TogetherPlayMC\data`，可用 `TOGETHER_DATA` 指定独立目录。发送给模型的内容取决于本轮上下文，可在“模型上下文”检查。截图需主动选择或确认发送。

## 感谢《元素觉醒》

特别感谢 **Sh1ntaro** 制作的 **[《元素觉醒 / Elemental Awakening》](https://www.xyebbs.com/res-id/ELA)**，以及整合包内各模组作者。

本项目曾在《元素觉醒 1.4.6》的 Minecraft 1.20.1 / Forge 47.4.22 环境中进行适配与游戏验证。这不代表覆盖它的所有机制或后续版本。整合包版权属于原作者，本项目是独立陪伴工具，没有与整合包作者建立官方合作或获得其背书。请通过作者发布页获取整合包。

详细边界见 [兼容性说明](docs/compatibility.md)。

## 依赖与来源

实际使用了 Transformers.js、多语言 MiniLM、ONNX Runtime、Electron、Node.js、Fabric、Forge、PrismarineJS / Mineflayer 生态和 fflate。用途、版本、上游链接与许可证见 [CREDITS.md](CREDITS.md) 和 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

[记忆与上下文调研](docs/memory-context-open-source-review.md)及[缓存方案调研](docs/cache-open-source-review.md)保留设计参考。Hindsight、Mem0、Graphiti、Letta、LangMem、LiteLLM、LMCache、vLLM、GPTCache 等完整项目没有打进应用，不能当作已接入功能。

## 从源码运行

安装 Node.js 24，在仓库目录执行：

```powershell
npm ci
npm start
```

首次运行通过界面添加游戏目录。源码不含运行时、模型权重、个人配置、聊天或存档；未安装语义模型时回退关键词检索。可按固定版本下载模型：

```powershell
node scripts/prepare-memory-model.mjs
```

桌面调试需要 Electron：

```powershell
New-Item -ItemType Directory -Force runtime/node
Copy-Item (Get-Command node).Source runtime/node/node.exe
npm --prefix desktop ci
Push-Location desktop
npx electron .
Pop-Location
```

测试与模组构建需要 Java 17，将 JAVA_HOME 指向安装目录。Gradle 首次运行会下载构建依赖：

```powershell
npm test
node scripts/build-companion.mjs
```

源码用户需要先构建模组，再从界面安装伙伴。产物在 artifacts/mods。模组文件名中的 0.6.0 是沿用的兼容名称，实际应用构建版本写在 together-build.json 中。完整打包步骤见 [开发说明](docs/development.md)。

## 验证与授权

0.16.0 的 269 项自动化回归、网页操作、Fabric/Forge 构建、离线模型和发行包校验通过。该版未重新进入 Minecraft 实机验证，也未调用付费模型测试缓存收益，详见 [验收记录](docs/v016-acceptance.md)。

本仓库公开源码，第一方代码沿用现有的保留所有权利声明，尚未指定开源许可证；第三方组件始终按其各自许可证使用，见 [授权说明](LICENSE.md)。
