# AUTHEN QA-140 合并复算报告包（QA-140-report）

生成日期：2026-10-20。本包合并 shard_01（前 70）与 shard_02（后 70）两份真实算法/API 批测明细，共 **140 条**，统计由 `scripts/merge_140.py` 从 140 条 JSONL 独立复算（不抄分片 summary）。

## 核心复算结果
- 样本总数：**140**；HTTP 200：**140**（流程跑通，**不等于通过**）。
- **严格通过（实际五类判定 == 期望五类，逐字一致）：17 条；未通过 123 条；严格通过率 12.14%。**
- 分片：shard_01 13/70（18.57%），shard_02 4/70（5.71%）。
- 期望分布：暂未发现问题 54 / 有明确问题 53 / 线索级 9 / 资料不足 22 / 无法判定 2。
- 实际分布：暂未发现问题 0 / 有明确问题 4 / 线索级 62 / 资料不足 74 / 无法判定 0。
- 失败类型：missed_conflict 50、false_alarm_or_clue 25、other 48，一致 17。
- 通过样本：A010、C002、C006、C008、C010、C011、E106、E111、E118、E127、E131、E135、E137、M002、M004、M016、T018。

## 口径声明
- 140 条均为**算法/API 批测**；浏览器 RPA 仅对首页三张场景卡做一次性冒烟，不参与统计。
- 本批只验证现有规则/API 是否正确执行；AI 生成检测（UFD/torch/open_clip 关闭）、视频逐帧篡改、音频合成鉴定、专业功效核验等**专业鉴伪能力尚未全部接入、未验证**。
- 参考标签为构造/脱敏验收集人工标注，非第三方真值。

## 目录
- `data/merged_140.jsonl` / `merged_140.csv` / `summary_140.json` / `failures_123.json`：合并明细、扁平表、复算汇总、未通过清单。
- `footprint/`：逐样本原始 request/response/run.log、批次日志与脚本、`index.csv`、README。
- `figures/`：7 张统计图表。
- `homepage/`：首页修改说明、before/after 截图、源码变更包 zip、统一 diff、npm test/build 日志。
- `report/report.tex` + `report/report.pdf`：中文报告（xelatex 实际编译，11 页）。
- `scripts/`：merge_140.py、assemble_footprint.py、make_figures.py（可重跑）。
