# TogetherPlayMC 缓存开源方案评估

核对日期为 2026-11-18。当前应用运行在 Windows，使用 Node/Electron 调用用户配置的第三方模型接口。下面区分供应商输入缓存、应用回答缓存和自建推理缓存，避免把不同层的“命中”混为一谈。

| 项目 | 缓存对象与能力 | 在本项目中的适用性 |
| --- | --- | --- |
| [LiteLLM](https://github.com/BerriAI/litellm) | 网关与 SDK；对支持的供应商适配提示词缓存标记，也提供内存、Redis、磁盘及语义回答缓存 | 最接近现有外部 API 架构。适合借鉴供应商能力判断、稳定前缀、用量归一化；引入完整网关会增加一个服务，应先用固定测试集证明收益 |
| [LMCache](https://github.com/LMCache/LMCache) | 将推理过程中的 KV cache 分层存放在 GPU、CPU、磁盘或远端，跨请求复用并记录缓存指标 | 适合未来自建模型服务。客户端无法通过安装它来接管第三方平台内部的 KV cache |
| [vLLM Automatic Prefix Caching](https://docs.vllm.ai/en/latest/features/automatic_prefix_caching/) | 自建推理服务复用相同输入前缀的 KV cache，省去重复计算 | 若以后在 GPU 服务器部署模型，可以一起评估。需要掌握推理服务，不是修改本机聊天请求就能启用 |
| [GPTCache](https://github.com/zilliztech/GPTCache) | 按相同或相似问题取回之前的回答，可组合向量与 SQLite 等存储 | 可试验版本固定的资料问答。陪伴聊天里的情绪、背包、任务和关系会变化，直接返回旧回答容易失真，暂不接入聊天主链路 |

LiteLLM 的[提示词缓存适配](https://docs.litellm.ai/docs/tutorials/prompt_caching)和[回答缓存](https://docs.litellm.ai/docs/caching/all_caches)是两种机制。某些供应商自动缓存前缀；有的需要标记；显式缓存还可能涉及存储费用。不能在所有接口上统一加一个开关就宣称节省费用。具体支持范围应在正式接入时按模型、供应商和转发平台逐项核对。

对当前项目，我建议先保持人设、规则和工具定义稳定，把当前游戏状态、检索结果和本轮问题放在后部；同时按接口、模型、协议、工具模式和请求用途比较前缀。v0.15.0 补上了摘要请求与聊天请求分开比较，以及接口地址指纹隔离。后续若做 LiteLLM 对照，应使用相同文本、相同模型与输出限制，分别记录真实输入 token、缓存读取/写入 token、首字延迟和账单规则。

本机向量索引复用是另一层缓存。本版把语义向量按原文指纹和模型版本保存在本地 SQLite；文字、范围或模型变动会重新计算，删除和替换会在检索时重新核对。这能减少重复的本机计算，不属于模型供应商的计费缓存。

本次没有部署 LiteLLM、LMCache、vLLM 或 GPTCache，没有调用用户的付费模型，也没有测得真实供应商缓存收益。上下文里的共同前缀字符数继续作为布局诊断；回执缺失时，缓存命中保持“未知”。

## 0.16.0 落地情况

采用应用内部的轻量适配，未部署额外服务。官方域名自动识别，聊天与独立识图可分别设置自动、仅观测及协议专用策略。固定系统前缀与动态消息分开，OpenAI 稳定键按角色、存档、用途、模型与工具模式隔离；Anthropic 只标记固定系统块。

回执采用 v2 口径，支持 DeepSeek 命中/未命中字段、Anthropic 读写分项和 OpenAI 新版写入字段。缺失字段保持未知，矛盾回执排除出命中比例，旧记录保留并单列。测试入口预览合成资料后才启动三次串行调用，可取消且不自动重试。

协议依据为 [Anthropic 提示词缓存](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)、[OpenAI 提示词缓存](https://developers.openai.com/api/docs/guides/prompt-caching)、[DeepSeek 上下文缓存](https://api-docs.deepseek.com/guides/kv_cache/)和 [Gemini 缓存](https://ai.google.dev/gemini-api/docs/caching)。OpenAI GPT-5.6 及更新模型由平台自动路由，稳定键用于区分缓存归属，不把它宣传成保证提高命中率的开关。本版没有创建 Gemini 显式缓存对象或新增 OpenAI 显式断点。
