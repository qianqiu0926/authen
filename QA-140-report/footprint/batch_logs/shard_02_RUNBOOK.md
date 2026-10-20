# shard_02 运行说明（AUTHEN 真实 APP 批测 · 后70条）

## 1. 分片边界
- 输入包：`AUTHEN_多模态测试数据包_v2_140条.zip`（先 `shasum -a 256 -c checksums.sha256` 校验，全部 OK 后解压）。
- 规则：对 `annotations/*.json` 文件名做**自然排序**（字母+数字数值序），取**后 70 条**；前 70 条归另一分片，本分片不重复。
- 本分片样本（70，已在 `shard_02_results.jsonl` 按自然序排列）：
  - 图片 I009–I022（14）
  - 图文帖 M001–M018（18）
  - 文章 T001–T018（18）
  - 视频 V001–V012（12）
  - 转发变体 X001–X008（8；其中 X001–X005 为 jpg 变体，X006/X007 为转码视频，X008 为噪声音频）
- 自查：记录数恰为 70，`sample_id` 唯一；与前 70 无交集。

## 2. 实际调用的 APP 入口（真实运行，非静态推断）
- 源码：`/Users/sugeladi/Desktop/欧莱雅黑客松/AUTHEN`（未修改消费者首页、未修改企业端）。
- 入口：同源 `web/server.mjs` 启动本地实例（独立端口 4192，避免占用他人进程），鉴真接口 `POST http://127.0.0.1:4192/api/review`（pipeline `inspect`，multi-agent-6dim-v2）；视频/音频转写走同实例 `POST /api/transcribe`。
- 健康检查 `/api/health`：AI=DeepSeek deepseek-flash（vision 开）；本地取证 pillow/opencv=true，torch/open_clip=false（UFD/AI 生成检测未接入）。
- 请求体复刻消费者前端 `web/src/media.ts` 的 `analyze()` 预处逻辑：
  - 文章 T：`kind=text`，正文=content.txt，scope=「已检查提交的文字；还需要商品资料才能核对具体功效。」
  - 图文帖 M：`kind=image`，文本=post.txt，附图 post.png、image.png；图片本地 OCR（tesseract chi_sim+eng）文本并入正文。
  - 图片 I：`kind=image`，上传 image.png，OCR 文本并入正文。
  - 视频 V：`kind=video`，ffmpeg 按时长均匀抽 ≤8 帧（≤1200 宽），帧 OCR 得字幕；默认开启口播，ffmpeg 抽 16k 单声道 wav 经 `/api/transcribe`（faster-whisper small）转写并入文本。
  - 转发变体 X001–X005：`kind=image`，上传 image.jpg 并 OCR；X006/X007 按视频处理；X008 `kind=audio`，wav 先转写再送鉴真。
- 限流：服务端窗口 12 次/分钟、并发 2；harness 对 429/5xx 做 6 次指数退避重试，样本间隔 1.2s；到达上限即记失败，不无限等待。

## 3. 判定口径
- APP 实际判定取响应 `audit.total_decision`（五类之一）：暂未发现问题 / 有明确问题 / 线索级（待核验）/ 资料不足 / 无法判定。
- 期望判定取 `manifest_labels.jsonl` 的 `decision`。
- `passed = (actual_judgment == expected_judgment)`。**HTTP 200 / API 成功不等于通过**；API 成功只说明流程跑通。
- error_type：`none`（一致）/ `verdict_mismatch`（五类不一致）/ `http_error`（非200）/ `pipeline_failed`（200 但返回无法判定/P-05）/ `transport_error`（网络异常）。mismatch_kind：missed_conflict（漏报明确问题）、false_alarm_or_clue（误报/提前给线索）、other。

## 4. 留存足迹（可复现）
- 每条样本目录 `raw/<sample_id>/`：
  - `request.json`：**原始请求体**（含 dataURL 图像、文本、lines、scope）。
  - `response.json`：**原始 APP 响应**（完整 JSON，含 audit/presentation/evidence_cards/summary/next）。
  - `run.log`：时间戳、端点、HTTP 状态、耗时、输入文件、预处理备注、期望/实际判定、error_type。
- 汇总：`shard_02_results.jsonl`（逐行全字段）、`shard_02_results.csv`（同字段，UTF-8-BOM）、`shard_02_summary.json`（统计+失败清单+覆盖样本）。
- 日志：`shard_02_run_console.log`（逐条运行控制台）、`shard_02_server.log`（服务启动记录）。

## 5. 复现命令
```bash
# 1) 解压并校验（略，见数据包 README）
# 2) 起本地实例（独立端口，勿动 4173/他人进程）
cd /Users/sugeladi/Desktop/欧莱雅黑客松/AUTHEN/web
AUTHEN_PORT=4192 node server.mjs
# 3) 批跑（harness 见工作目录 run_shard02.mjs；输出写到 artifacts/）
node run_shard02.mjs
# 4) 汇总自查
python3 postprocess.py   # 断言 70 条、sample_id 唯一、判定属五类
```

## 6. 能力边界说明（区分“现有规则/API正确性”与“专业鉴伪能力未验证”）
- 本次为**算法/API 流程批测**，未做逐样本浏览器 RPA（仅主线少量冒烟）。
- APP 当前规则链主要覆盖：D1 数字/事实冲突（对照公开资料+LLM）、D5 绝对化/越界功效/权威背书、D3 图文数字冲突、D2 本地图像取证（copy-move/ELA/频谱/噪声/元数据）。
- **未接入/未验证**：AI 生成检测（UFD/torch/open_clip 关闭）、视频逐帧与画面篡改鉴定、音频合成/噪声鉴定、专业医学/化妆品功效核验；APP 内置知识库不含本数据包虚构「岑予」产品资料，D1 公开对照多为空。
- 本地 OCR 用 tesseract chi_sim+eng，对花体/压缩图识别有限，可能影响 D3 图文数字比对命中；这是测试预处理局限，不等同 APP 结论。

## 7. 结果概览（70 条，全部 HTTP 200，无传输/流水线失败）
- 通过 4 / 未通过 66（未执行 0）。通过样本：M002、M004、M016、T018。
- 期望分布：暂未发现问题 32 / 有明确问题 35 / 资料不足 3。
- 实际分布：有明确问题 4 / 线索级（待核验）39 / 资料不足 27（未出现 暂未发现问题、无法判定）。
- mismatch_kind：missed_conflict 32 / false_alarm_or_clue 20 / other 14。
- 场景：开发 39 / 保留测试 17 / 验证 14。
- 整体倾向：现有规则链倾向给「线索级/资料不足」，对期望「有明确问题」的样本普遍降级为线索/资料不足（漏报为主），对期望「暂未发现问题」的部分样本给线索（轻微误报）；这与专业鉴伪能力未接入一致，需结合 evidence_cards 与原始响应逐条复核。
