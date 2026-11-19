# 开发与分发

源码要求 Node.js 24；模组构建要求 Java 17。首次安装执行 `npm ci`，本地服务执行 `npm start`。运行时数据默认在当前 Windows 用户的 LocalAppData 中，测试或调试可设置 `TOGETHER_DATA` 指向独立目录。

运行 `npm test` 执行不调用付费接口的自动化测试。网页验收脚本 `scripts/qa-v016-ui.mjs` 使用 Playwright 和 Edge，需将 `TOGETHER_PLAYWRIGHT` 设置为本机 Playwright 模块入口的绝对路径；验收使用临时数据和合成模型回执。

## 模组

将 `JAVA_HOME` 指向 Java 17，再执行 `node scripts/build-companion.mjs`。脚本下载并校验 Gradle 8.7，构建 Fabric 和 Forge 两份模组。无需提供个人 `config/experiment.json`；旧本地配置的 Java 路径仅作为兼容回退。

共享代码在 `companion-mod/common`，两种加载器入口分别在 `fabric` 和 `forge`。资源由 `build-orb-faces.mjs` 从本项目定义生成，网页与游戏共用形态目录。

## 本机语义模型

运行 `node scripts/prepare-memory-model.mjs` 按固定 revision 下载模型并验证文件哈希。权重不会写入 Git 历史。离线部署可以使用完整 Windows 包，或把经过验证的 `runtime/models` 放进源码运行目录。模型不可用时回退关键词检索。

## Windows 包

`scripts/package-release.mjs` 只打包白名单文件，不复制个人 data、config 或 work。准备好以下内容后执行该脚本：

- Node.js Windows x64 运行时，放在 `runtime/node/node.exe`。
- `npm ci` 及 `npm --prefix desktop ci` 安装的依赖和 Electron。
- 两种模组构建结果，位于 `artifacts/mods`。
- Fabric API 0.92.2+1.20.1，位于 `runtime/cache`。
- 已校验的语义模型，位于 `runtime/models`。
- 对应版本的说明、验收记录、合成测试截图，以及第三方许可证。

执行 `node scripts/third-party-notices.mjs` 更新依赖清单，再打包。`node scripts/qa-package.mjs` 校验完整清单、模组、网页资源、离线模型和备份恢复。压缩包还应逐文件验证 SHA-256；不要上传本地源码恢复包、个人配置、历史实机截图或游戏文件。

可选旧托管环境的准备脚本仍依赖使用者自行提供的原版安装与本地实验配置；普通“添加我的游戏”流程不需要这些文件。它们不是从源码运行主模式的前置步骤。
