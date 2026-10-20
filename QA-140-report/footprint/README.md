# 可复现测试足迹（footprint）

本目录是 140 条真实批测的原始留痕，与 `../data/merged_140.jsonl` 一一对应。

## 目录结构
- `samples/<sample_id>/request.json` —— 发往 `POST /api/review`（或 `/api/transcribe` 前置）的原始请求体。
- `samples/<sample_id>/response.json` —— APP 原始响应（完整 JSON，含 audit / presentation / evidence_cards / summary / next）。
- `samples/<sample_id>/run.log` —— 该样本时间戳、端点、HTTP 状态、耗时、期望/实际判定、error_type。
- `index.csv` —— 140 条索引：样本、分片、模态、场景、期望/实际判定、严格通过、足迹文件相对路径。
- `batch_logs/` —— 两分片批次级材料：
  - `shard_01_RUNBOOK.md` / `shard_02_RUNBOOK.md` 运行说明；
  - `run_shard01.mjs`、`run_shard02.mjs` 实跑脚本，`make_outputs.py`、`postprocess.py` 汇总脚本；
  - 分片原始 JSONL/CSV/汇总 JSON、控制台与服务日志（`shard_01_run_logs/`、`shard_02_run_console.log`、`shard_02_server.log`）。

## 口径重申
- 严格通过 = APP 实际五类判定与参考标签五类完全一致；HTTP 200 / API 成功不计通过。
- 140 条均为算法/API 批测；浏览器 RPA 仅对三张场景卡做一次性冒烟，不参与本批 140 条结果。
- 专业鉴伪能力（AI 生成检测、视频逐帧篡改、音频合成鉴定、专业功效核验）尚未全部接入，本批只验证现有规则/API 是否正确执行。

## 复现要点（详见各分片 RUNBOOK）
1. 启动本地消费者端后端：`cd AUTHEN/web && AUTHEN_PORT=4191 node server.mjs`（shard_02 用 4192）。
2. 按 RUNBOOK 执行批次脚本；3. 用 `../scripts/merge_140.py` 合并并独立复算统计。
