# Third-party notices

本清单来自安装的依赖元数据，完整版本与依赖关系见 package-lock.json。第一方声明不替代第三方许可证。

直接依赖、模型、加载器和《元素觉醒》的用途与致谢见 [CREDITS.md](CREDITS.md)。第三方模型固定 revision 和文件哈希位于发行包 runtime/models 内的 model-manifest.json。

## 随包许可证

- Node.js 24.19.0：[官方完整声明](third-party-licenses/Node-LICENSE.txt)，包含 Node 内部依赖声明。
- Electron 45.2.1：发行根目录 LICENSE 与 LICENSES.chromium.html 保留上游原文。
- Fabric API 0.92.2+1.20.1：[许可证](third-party-licenses/Fabric-API-LICENSE.txt)，JAR 内声明也保留；Forge 和 Fabric Loader 属于用户提供的游戏运行环境。
- Transformers.js 与量化多语言 MiniLM：Apache-2.0；依赖许可、模型卡和模型 LICENSE 随包保留。
- sharp 0.34.5 与 libvips 8.17.3：见下方 LGPL 组件说明及 npm 包内 README、LICENSE、versions.json。

## LGPL 组件的来源与替换

Windows 包保留未修改的 @img/sharp-win32-x64/lib/libvips-42.dll 与 libvips-cpp-8.17.3.dll，使用动态库机制。用户可替换为 ABI 兼容的修改版本；不限制为调试这类修改进行的逆向工程。重建与版本清单见包内 versions.json 及上游构建资料。

- [LGPL-3.0 全文](third-party-licenses/LGPL-3.0.txt) 和 [GPL-3.0 全文](third-party-licenses/GPL-3.0.txt)。
- [sharp v0.34.5 源码](https://github.com/lovell/sharp/tree/v0.34.5)。
- [libvips v8.17.3 源码](https://github.com/libvips/libvips/tree/v8.17.3)。
- [Windows 构建发布与源码材料](https://github.com/libvips/build-win64-mxe/releases/tag/v8.17.3)及[构建工程](https://github.com/libvips/build-win64-mxe)。
- [sharp-libvips 打包工程与依赖许可](https://github.com/lovell/sharp-libvips)。原 npm 包内 README 的逐库列表和 versions.json 已随包保留。

## npm 依赖

| 项目 | 版本 | 上游声明的许可 | 来源 | 原文 |
| --- | --- | --- | --- | --- |
| @azure/msal-common | 14.16.1 | MIT | [上游](https://github.com/AzureAD/microsoft-authentication-library-for-js) | [随附许可](third-party-licenses/npm/@azure__msal-common-14.16.1/) |
| @azure/msal-node | 2.16.3 | MIT | [上游](https://github.com/AzureAD/microsoft-authentication-library-for-js) | [随附许可](third-party-licenses/npm/@azure__msal-node-2.16.3/) |
| @huggingface/jinja | 0.5.13 | MIT | [上游](https://github.com/huggingface/huggingface.js) | [随附许可](third-party-licenses/npm/@huggingface__jinja-0.5.13/) |
| @huggingface/transformers | 3.8.1 | Apache-2.0 | [上游](https://github.com/huggingface/transformers.js) | [随附许可](third-party-licenses/npm/@huggingface__transformers-3.8.1/) |
| @img/colour | 1.1.0 | MIT | [上游](https://github.com/lovell/colour) | [随附许可](third-party-licenses/npm/@img__colour-1.1.0/) |
| @img/sharp-win32-x64 | 0.34.5 | Apache-2.0 AND LGPL-3.0-or-later | [上游](https://github.com/lovell/sharp) | [随附许可](third-party-licenses/npm/@img__sharp-win32-x64-0.34.5/) |
| @isaacs/fs-minipass | 4.0.1 | ISC | [上游](https://github.com/npm/fs-minipass) | [随附许可](third-party-licenses/npm/@isaacs__fs-minipass-4.0.1/) |
| @protobufjs/aspromise | 1.1.2 | BSD-3-Clause | [上游](https://github.com/dcodeIO/protobuf.js) | [随附许可](third-party-licenses/npm/@protobufjs__aspromise-1.1.2/) |
| @protobufjs/base64 | 1.1.2 | BSD-3-Clause | [上游](https://github.com/dcodeIO/protobuf.js) | [随附许可](third-party-licenses/npm/@protobufjs__base64-1.1.2/) |
| @protobufjs/codegen | 2.0.5 | BSD-3-Clause | [上游](https://github.com/dcodeIO/protobuf.js) | [随附许可](third-party-licenses/npm/@protobufjs__codegen-2.0.5/) |
| @protobufjs/eventemitter | 1.1.1 | BSD-3-Clause | [上游](https://github.com/dcodeIO/protobuf.js) | [随附许可](third-party-licenses/npm/@protobufjs__eventemitter-1.1.1/) |
| @protobufjs/fetch | 1.1.1 | BSD-3-Clause | [上游](https://github.com/dcodeIO/protobuf.js) | [随附许可](third-party-licenses/npm/@protobufjs__fetch-1.1.1/) |
| @protobufjs/float | 1.0.2 | BSD-3-Clause | [上游](https://github.com/dcodeIO/protobuf.js) | [随附许可](third-party-licenses/npm/@protobufjs__float-1.0.2/) |
| @protobufjs/path | 1.1.2 | BSD-3-Clause | [上游](https://github.com/dcodeIO/protobuf.js) | [随附许可](third-party-licenses/npm/@protobufjs__path-1.1.2/) |
| @protobufjs/pool | 1.1.0 | BSD-3-Clause | [上游](https://github.com/dcodeIO/protobuf.js) | [随附许可](third-party-licenses/npm/@protobufjs__pool-1.1.0/) |
| @protobufjs/utf8 | 1.1.2 | BSD-3-Clause | [上游](https://github.com/protobufjs/protobuf.js) | [随附许可](third-party-licenses/npm/@protobufjs__utf8-1.1.2/) |
| @types/node | 26.6.5 | MIT | [上游](https://github.com/DefinitelyTyped/DefinitelyTyped) | [随附许可](third-party-licenses/npm/@types__node-26.6.5/) |
| @types/node-rsa | 1.1.4 | MIT | [上游](https://github.com/DefinitelyTyped/DefinitelyTyped) | [随附许可](third-party-licenses/npm/@types__node-rsa-1.1.4/) |
| @types/readable-stream | 4.0.25 | MIT | [上游](https://github.com/DefinitelyTyped/DefinitelyTyped) | [随附许可](third-party-licenses/npm/@types__readable-stream-4.0.25/) |
| @xboxreplay/xboxlive-auth | 5.1.0 | Apache-2.0 | [上游](https://github.com/XboxReplay/xboxlive-auth) | [随附许可](third-party-licenses/npm/@xboxreplay__xboxlive-auth-5.1.0/) |
| abort-controller | 3.0.0 | MIT | [上游](https://github.com/mysticatea/abort-controller) | [随附许可](third-party-licenses/npm/abort-controller-3.0.0/) |
| aes-js | 3.1.2 | MIT | [上游](https://github.com/ricmoo/aes-js) | [随附许可](third-party-licenses/npm/aes-js-3.1.2/) |
| ajv | 6.15.0 | MIT | [上游](https://github.com/ajv-validator/ajv) | [随附许可](third-party-licenses/npm/ajv-6.15.0/) |
| asn1 | 0.2.3 | MIT | [上游](https://github.com/mcavage/node-asn1) | [随附许可](third-party-licenses/npm/asn1-0.2.3/) |
| base64-js | 1.5.1 | MIT | [上游](https://github.com/beatgammit/base64-js) | [随附许可](third-party-licenses/npm/base64-js-1.5.1/) |
| boolean | 3.2.0 | MIT | [上游](https://github.com/thenativeweb/boolean) | [随附许可](third-party-licenses/npm/boolean-3.2.0/) |
| buffer | 6.0.3 | MIT | [上游](https://github.com/feross/buffer) | [随附许可](third-party-licenses/npm/buffer-6.0.3/) |
| buffer-equal | 1.0.1 | MIT | [上游](https://github.com/inspect-js/buffer-equal) | [随附许可](third-party-licenses/npm/buffer-equal-1.0.1/) |
| buffer-equal-constant-time | 1.0.1 | BSD-3-Clause | [上游](https://github.com/goinstant/buffer-equal-constant-time) | [随附许可](third-party-licenses/npm/buffer-equal-constant-time-1.0.1/) |
| chownr | 3.0.0 | BlueOak-1.0.0 | [上游](https://github.com/isaacs/chownr) | [随附许可](third-party-licenses/npm/chownr-3.0.0/) |
| commander | 2.20.3 | MIT | [上游](https://github.com/tj/commander.js) | [随附许可](third-party-licenses/npm/commander-2.20.3/) |
| debug | 4.4.3 | MIT | [上游](https://github.com/debug-js/debug) | [随附许可](third-party-licenses/npm/debug-4.4.3/) |
| define-data-property | 1.1.4 | MIT | [上游](https://github.com/ljharb/define-data-property) | [随附许可](third-party-licenses/npm/define-data-property-1.1.4/) |
| define-properties | 1.2.1 | MIT | [上游](https://github.com/ljharb/define-properties) | [随附许可](third-party-licenses/npm/define-properties-1.2.1/) |
| detect-libc | 2.1.2 | Apache-2.0 | [上游](https://github.com/lovell/detect-libc) | [随附许可](third-party-licenses/npm/detect-libc-2.1.2/) |
| detect-node | 2.1.0 | MIT | [上游](https://github.com/iliakan/detect-node) | [随附许可](third-party-licenses/npm/detect-node-2.1.0/) |
| discontinuous-range | 1.0.0 | MIT | [上游](https://github.com/dtudury/discontinuous-range) | [随附许可](third-party-licenses/npm/discontinuous-range-1.0.0/) |
| ecdsa-sig-formatter | 1.0.11 | Apache-2.0 | [上游](https://github.com/Brightspace/node-ecdsa-sig-formatter) | [随附许可](third-party-licenses/npm/ecdsa-sig-formatter-1.0.11/) |
| endian-toggle | 0.0.0 | MIT | [上游](https://github.com/substack/endian-toggle) | [随附许可](third-party-licenses/npm/endian-toggle-0.0.0/) |
| es-define-property | 1.0.1 | MIT | [上游](https://github.com/ljharb/es-define-property) | [随附许可](third-party-licenses/npm/es-define-property-1.0.1/) |
| es-errors | 1.3.0 | MIT | [上游](https://github.com/ljharb/es-errors) | [随附许可](third-party-licenses/npm/es-errors-1.3.0/) |
| es6-error | 4.1.1 | MIT | [上游](https://github.com/bjyoungblood/es6-error) | [随附许可](third-party-licenses/npm/es6-error-4.1.1/) |
| escape-string-regexp | 4.0.0 | MIT | [上游](https://github.com/sindresorhus/escape-string-regexp) | [随附许可](third-party-licenses/npm/escape-string-regexp-4.0.0/) |
| event-target-shim | 5.0.1 | MIT | [上游](https://github.com/mysticatea/event-target-shim) | [随附许可](third-party-licenses/npm/event-target-shim-5.0.1/) |
| events | 3.3.0 | MIT | [上游](https://github.com/Gozala/events) | [随附许可](third-party-licenses/npm/events-3.3.0/) |
| fast-deep-equal | 3.1.3 | MIT | [上游](https://github.com/epoberezkin/fast-deep-equal) | [随附许可](third-party-licenses/npm/fast-deep-equal-3.1.3/) |
| fast-json-stable-stringify | 2.1.0 | MIT | [上游](https://github.com/epoberezkin/fast-json-stable-stringify) | [随附许可](third-party-licenses/npm/fast-json-stable-stringify-2.1.0/) |
| fflate | 0.8.3 | MIT | [上游](https://github.com/101arrowz/fflate) | [随附许可](third-party-licenses/npm/fflate-0.8.3/) |
| flatbuffers | 25.9.23 | Apache-2.0 | [上游](https://github.com/google/flatbuffers) | [随附许可](third-party-licenses/npm/flatbuffers-25.9.23/) |
| global-agent | 3.0.0 | BSD-3-Clause | [上游](https://github.com/gajus/global-agent) | [随附许可](third-party-licenses/npm/global-agent-3.0.0/) |
| globalthis | 1.0.4 | MIT | [上游](https://github.com/ljharb/System.global) | [随附许可](third-party-licenses/npm/globalthis-1.0.4/) |
| gopd | 1.2.0 | MIT | [上游](https://github.com/ljharb/gopd) | [随附许可](third-party-licenses/npm/gopd-1.2.0/) |
| guid-typescript | 1.0.9 | ISC | [上游](https://github.com/NicolasDeveloper/guid-typescript) | 见包内声明与上游 |
| has-property-descriptors | 1.0.2 | MIT | [上游](https://github.com/inspect-js/has-property-descriptors) | [随附许可](third-party-licenses/npm/has-property-descriptors-1.0.2/) |
| ieee754 | 1.2.1 | BSD-3-Clause | [上游](https://github.com/feross/ieee754) | [随附许可](third-party-licenses/npm/ieee754-1.2.1/) |
| json-schema-traverse | 0.4.1 | MIT | [上游](https://github.com/epoberezkin/json-schema-traverse) | [随附许可](third-party-licenses/npm/json-schema-traverse-0.4.1/) |
| json-stringify-safe | 5.0.1 | ISC | [上游](https://github.com/isaacs/json-stringify-safe) | [随附许可](third-party-licenses/npm/json-stringify-safe-5.0.1/) |
| jsonwebtoken | 9.0.3 | MIT | [上游](https://github.com/auth0/node-jsonwebtoken) | [随附许可](third-party-licenses/npm/jsonwebtoken-9.0.3/) |
| jwa | 2.0.1 | MIT | [上游](https://github.com/brianloveswords/node-jwa) | [随附许可](third-party-licenses/npm/jwa-2.0.1/) |
| jws | 4.0.1 | MIT | [上游](https://github.com/brianloveswords/node-jws) | [随附许可](third-party-licenses/npm/jws-4.0.1/) |
| lodash.includes | 4.3.0 | MIT | [上游](https://github.com/lodash/lodash) | [随附许可](third-party-licenses/npm/lodash.includes-4.3.0/) |
| lodash.isboolean | 3.0.3 | MIT | [上游](https://github.com/lodash/lodash) | [随附许可](third-party-licenses/npm/lodash.isboolean-3.0.3/) |
| lodash.isinteger | 4.0.4 | MIT | [上游](https://github.com/lodash/lodash) | [随附许可](third-party-licenses/npm/lodash.isinteger-4.0.4/) |
| lodash.isnumber | 3.0.3 | MIT | [上游](https://github.com/lodash/lodash) | [随附许可](third-party-licenses/npm/lodash.isnumber-3.0.3/) |
| lodash.isplainobject | 4.0.6 | MIT | [上游](https://github.com/lodash/lodash) | [随附许可](third-party-licenses/npm/lodash.isplainobject-4.0.6/) |
| lodash.isstring | 4.0.1 | MIT | [上游](https://github.com/lodash/lodash) | [随附许可](third-party-licenses/npm/lodash.isstring-4.0.1/) |
| lodash.merge | 4.6.2 | MIT | [上游](https://github.com/lodash/lodash) | [随附许可](third-party-licenses/npm/lodash.merge-4.6.2/) |
| lodash.once | 4.1.1 | MIT | [上游](https://github.com/lodash/lodash) | [随附许可](third-party-licenses/npm/lodash.once-4.1.1/) |
| lodash.reduce | 4.6.0 | MIT | [上游](https://github.com/lodash/lodash) | [随附许可](third-party-licenses/npm/lodash.reduce-4.6.0/) |
| long | 5.3.2 | Apache-2.0 | [上游](https://github.com/dcodeIO/long.js) | [随附许可](third-party-licenses/npm/long-5.3.2/) |
| macaddress | 0.5.4 | MIT | [上游](https://github.com/scravy/node-macaddress) | [随附许可](third-party-licenses/npm/macaddress-0.5.4/) |
| matcher | 3.0.0 | MIT | [上游](https://github.com/sindresorhus/matcher) | [随附许可](third-party-licenses/npm/matcher-3.0.0/) |
| minecraft-data | 3.117.0 | MIT | [上游](https://github.com/PrismarineJS/node-minecraft-data) | 见包内声明与上游 |
| minecraft-folder-path | 1.2.0 | MIT | [上游](https://github.com/simonmeusel/minecraft-folder-path) | [随附许可](third-party-licenses/npm/minecraft-folder-path-1.2.0/) |
| minecraft-protocol | 1.68.0 | BSD-3-Clause | [上游](https://github.com/PrismarineJS/node-minecraft-protocol) | [随附许可](third-party-licenses/npm/minecraft-protocol-1.68.0/) |
| mineflayer | 4.39.0 | MIT | [上游](https://github.com/PrismarineJS/mineflayer) | [随附许可](third-party-licenses/npm/mineflayer-4.39.0/) |
| mineflayer-pathfinder | 2.4.5 | MIT | [上游](https://www.npmjs.com/package/mineflayer-pathfinder) | [随附许可](third-party-licenses/npm/mineflayer-pathfinder-2.4.5/) |
| minipass | 7.1.3 | BlueOak-1.0.0 | [上游](https://github.com/isaacs/minipass) | [随附许可](third-party-licenses/npm/minipass-7.1.3/) |
| minizlib | 3.1.0 | MIT | [上游](https://github.com/isaacs/minizlib) | [随附许可](third-party-licenses/npm/minizlib-3.1.0/) |
| mojangson | 2.1.0 | MIT | [上游](https://github.com/PrismarineJS/node-mojangson) | 见包内声明与上游 |
| moo | 0.5.3 | BSD-3-Clause | [上游](https://github.com/tjvr/moo) | [随附许可](third-party-licenses/npm/moo-0.5.3/) |
| ms | 2.1.3 | MIT | [上游](https://github.com/vercel/ms) | [随附许可](third-party-licenses/npm/ms-2.1.3/) |
| nearley | 2.20.1 | MIT | [上游](https://github.com/hardmath123/nearley) | [随附许可](third-party-licenses/npm/nearley-2.20.1/) |
| node-fetch | 2.7.0 | MIT | [上游](https://github.com/bitinn/node-fetch) | [随附许可](third-party-licenses/npm/node-fetch-2.7.0/) |
| node-rsa | 0.4.2 | MIT | [上游](https://github.com/rzcoder/node-rsa) | 见包内声明与上游 |
| object-keys | 1.1.1 | MIT | [上游](https://github.com/ljharb/object-keys) | [随附许可](third-party-licenses/npm/object-keys-1.1.1/) |
| onnxruntime-common | 1.21.0 | MIT | [上游](https://github.com/Microsoft/onnxruntime) | 见包内声明与上游 |
| onnxruntime-common | 1.22.0-dev.20250409-89f8206ba4 | MIT | [上游](https://github.com/Microsoft/onnxruntime) | 见包内声明与上游 |
| onnxruntime-node | 1.21.0 | MIT | [上游](https://github.com/Microsoft/onnxruntime) | 见包内声明与上游 |
| onnxruntime-web | 1.22.0-dev.20250409-89f8206ba4 | MIT | [上游](https://github.com/Microsoft/onnxruntime) | 见包内声明与上游 |
| pend | 1.2.0 | MIT | [上游](https://github.com/andrewrk/node-pend) | [随附许可](third-party-licenses/npm/pend-1.2.0/) |
| platform | 1.3.6 | MIT | [上游](https://github.com/bestiejs/platform.js) | [随附许可](third-party-licenses/npm/platform-1.3.6/) |
| prismarine-auth | 3.1.1 | MIT | [上游](https://github.com/PrismarineJS/prismarine-auth) | [随附许可](third-party-licenses/npm/prismarine-auth-3.1.1/) |
| prismarine-biome | 1.4.0 | MIT | [上游](https://github.com/PrismarineJS/prismarine-biome) | 见包内声明与上游 |
| prismarine-block | 1.23.0 | MIT | [上游](https://github.com/PrismarineJS/prismarine-block) | 见包内声明与上游 |
| prismarine-chat | 1.13.0 | MIT | [上游](https://github.com/PrismarineJS/prismarine-chat) | [随附许可](third-party-licenses/npm/prismarine-chat-1.13.0/) |
| prismarine-chunk | 1.41.0 | MIT | [上游](https://github.com/PrismarineJS/prismarine-chunk) | [随附许可](third-party-licenses/npm/prismarine-chunk-1.41.0/) |
| prismarine-entity | 2.6.0 | MIT | [上游](https://github.com/PrismarineJS/prismarine-entity) | 见包内声明与上游 |
| prismarine-item | 1.18.0 | MIT | [上游](https://github.com/PrismarineJS/prismarine-item) | 见包内声明与上游 |
| prismarine-nbt | 2.8.0 | MIT | [上游](https://github.com/prismarinejs/prismarine-nbt) | 见包内声明与上游 |
| prismarine-physics | 1.11.1 | MIT | [上游](https://github.com/PrismarineJS/prismarine-physics) | [随附许可](third-party-licenses/npm/prismarine-physics-1.11.1/) |
| prismarine-realms | 1.6.0 | MIT | [上游](https://github.com/PrismarineJS/prismarine-realms) | [随附许可](third-party-licenses/npm/prismarine-realms-1.6.0/) |
| prismarine-recipe | 1.5.0 | MIT | [上游](https://github.com/PrismarineJS/prismarine-recipe) | 见包内声明与上游 |
| prismarine-registry | 1.12.0 | MIT | [上游](https://github.com/PrismarineJS/prismarine-registry) | [随附许可](third-party-licenses/npm/prismarine-registry-1.12.0/) |
| prismarine-windows | 2.10.0 | MIT | [上游](https://github.com/PrismarineJS/prismarine-windows) | 见包内声明与上游 |
| prismarine-world | 3.7.0 | MIT | [上游](https://github.com/PrismarineJS/prismarine-world) | 见包内声明与上游 |
| process | 0.11.10 | MIT | [上游](https://github.com/shtylman/node-process) | [随附许可](third-party-licenses/npm/process-0.11.10/) |
| protobufjs | 7.6.6 | BSD-3-Clause | [上游](https://github.com/protobufjs/protobuf.js) | [随附许可](third-party-licenses/npm/protobufjs-7.6.6/) |
| protodef | 1.19.0 | MIT | [上游](https://github.com/ProtoDef-io/node-protodef) | [随附许可](third-party-licenses/npm/protodef-1.19.0/) |
| protodef-validator | 1.5.0 | MIT | [上游](https://github.com/ProtoDef-io/node-protodef-validator) | 见包内声明与上游 |
| punycode | 2.3.1 | MIT | [上游](https://github.com/mathiasbynens/punycode.js) | [随附许可](third-party-licenses/npm/punycode-2.3.1/) |
| railroad-diagrams | 1.0.0 | CC0-1.0 | [上游](https://github.com/tabatkins/railroad-diagrams) | 见包内声明与上游 |
| randexp | 0.4.6 | MIT | [上游](https://github.com/fent/randexp.js) | [随附许可](third-party-licenses/npm/randexp-0.4.6/) |
| readable-stream | 4.8.0 | MIT | [上游](https://github.com/nodejs/readable-stream) | [随附许可](third-party-licenses/npm/readable-stream-4.8.0/) |
| ret | 0.1.15 | MIT | [上游](https://github.com/fent/ret.js) | [随附许可](third-party-licenses/npm/ret-0.1.15/) |
| roarr | 2.15.4 | BSD-3-Clause | [上游](https://github.com/gajus/roarr) | [随附许可](third-party-licenses/npm/roarr-2.15.4/) |
| rxjs | 7.8.2 | Apache-2.0 | [上游](https://github.com/reactivex/rxjs) | [随附许可](third-party-licenses/npm/rxjs-7.8.2/) |
| safe-buffer | 5.2.1 | MIT | [上游](https://github.com/feross/safe-buffer) | [随附许可](third-party-licenses/npm/safe-buffer-5.2.1/) |
| semver | 7.8.5 | ISC | [上游](https://github.com/npm/node-semver) | [随附许可](third-party-licenses/npm/semver-7.8.5/) |
| semver-compare | 1.0.0 | MIT | [上游](https://github.com/substack/semver-compare) | [随附许可](third-party-licenses/npm/semver-compare-1.0.0/) |
| serialize-error | 7.0.1 | MIT | [上游](https://github.com/sindresorhus/serialize-error) | [随附许可](third-party-licenses/npm/serialize-error-7.0.1/) |
| sharp | 0.34.5 | Apache-2.0 | [上游](https://github.com/lovell/sharp) | [随附许可](third-party-licenses/npm/sharp-0.34.5/) |
| smart-buffer | 4.2.0 | MIT | [上游](https://github.com/JoshGlazebrook/smart-buffer) | [随附许可](third-party-licenses/npm/smart-buffer-4.2.0/) |
| sprintf-js | 1.1.3 | BSD-3-Clause | [上游](https://github.com/alexei/sprintf.js) | [随附许可](third-party-licenses/npm/sprintf-js-1.1.3/) |
| string_decoder | 1.3.0 | MIT | [上游](https://github.com/nodejs/string_decoder) | [随附许可](third-party-licenses/npm/string_decoder-1.3.0/) |
| tar | 7.5.23 | BlueOak-1.0.0 | [上游](https://github.com/isaacs/node-tar) | [随附许可](third-party-licenses/npm/tar-7.5.23/) |
| tr46 | 0.0.3 | MIT | [上游](https://github.com/Sebmaster/tr46.js) | 见包内声明与上游 |
| tslib | 2.8.1 | 0BSD | [上游](https://github.com/Microsoft/tslib) | [随附许可](third-party-licenses/npm/tslib-2.8.1/) |
| type-fest | 0.13.1 | (MIT OR CC0-1.0) | [上游](https://github.com/sindresorhus/type-fest) | [随附许可](third-party-licenses/npm/type-fest-0.13.1/) |
| typed-emitter | 1.4.0 | MIT | [上游](https://github.com/andywer/typed-emitter) | [随附许可](third-party-licenses/npm/typed-emitter-1.4.0/) |
| typed-emitter | 2.1.0 | MIT | [上游](https://github.com/andywer/typed-emitter) | [随附许可](third-party-licenses/npm/typed-emitter-2.1.0/) |
| uint4 | 0.1.2 | MIT | [上游](https://github.com/wtfaremyinitials/uint4) | 见包内声明与上游 |
| undici-types | 8.9.0 | MIT | [上游](https://github.com/nodejs/undici) | [随附许可](third-party-licenses/npm/undici-types-8.9.0/) |
| uri-js | 4.4.1 | BSD-2-Clause | [上游](https://www.npmjs.com/package/uri-js) | [随附许可](third-party-licenses/npm/uri-js-4.4.1/) |
| uuid | 10.0.0 | MIT | [上游](https://github.com/uuidjs/uuid) | [随附许可](third-party-licenses/npm/uuid-10.0.0/) |
| uuid | 8.3.2 | MIT | [上游](https://github.com/uuidjs/uuid) | [随附许可](third-party-licenses/npm/uuid-8.3.2/) |
| uuid-1345 | 1.0.2 | MIT | [上游](https://github.com/scravy/uuid-1345) | [随附许可](third-party-licenses/npm/uuid-1345-1.0.2/) |
| vec3 | 0.1.10 | BSD | [上游](https://github.com/PrismarineJS/node-vec3) | 见包内声明与上游 |
| vec3 | 0.2.0 | BSD | [上游](https://github.com/PrismarineJS/node-vec3) | 见包内声明与上游 |
| webidl-conversions | 3.0.1 | BSD-2-Clause | [上游](https://github.com/jsdom/webidl-conversions) | [随附许可](third-party-licenses/npm/webidl-conversions-3.0.1/) |
| whatwg-url | 5.0.0 | MIT | [上游](https://github.com/jsdom/whatwg-url) | [随附许可](third-party-licenses/npm/whatwg-url-5.0.0/) |
| xxhash-wasm | 0.4.2 | MIT | [上游](https://github.com/jungomi/xxhash-wasm) | [随附许可](third-party-licenses/npm/xxhash-wasm-0.4.2/) |
| yallist | 5.0.0 | BlueOak-1.0.0 | [上游](https://github.com/isaacs/yallist) | [随附许可](third-party-licenses/npm/yallist-5.0.0/) |
| yauzl | 3.4.0 | MIT | [上游](https://github.com/thejoshwolfe/yauzl) | [随附许可](third-party-licenses/npm/yauzl-3.4.0/) |
| yggdrasil | 1.8.0 | MIT | [上游](https://github.com/PrismarineJS/node-yggdrasil) | [随附许可](third-party-licenses/npm/yggdrasil-1.8.0/) |
