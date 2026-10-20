# shard_01 运行说明（AUTHEN 真实 APP 批测）

## 1. 分片范围
- 数据包：`AUTHEN_多模态测试数据包_v2_140条`（140 条）。
- 切分规则：对 `annotations/` 下样本 JSON 文件名做**自然排序**（字母前缀 + 数字自然序），取**前 70 条**为 shard_01，其余 70 条由另一分片负责，本分片不重复、不越界。
- 本分片覆盖清单（共 70，已校验 sample_id 唯一、恰为 70）：
  - 音频 A001–A010（10）
  - 评论组 C001–C012（12）
  - 图文帖/文章/评论/图片 E101–E140（40）
  - 图片 I001–I008（8）
- 顺序即 natural sort：A001…A010, C001…C012, E101…E140, I001…I008。

## 2. 被测对象与运行入口
- APP 源码：`/Users/sugeladi/Desktop/欧莱雅黑客松/AUTHEN`（消费者端，企业端未启用、未改动）。
- 真实运行入口（本次实跑调用）：
  - 主入口：本地 web 服务 `POST http://127.0.0.1:4191/api/review`（由 `web/server.mjs` 提供，等价于线上消费者端后端 `/api/review`）。
  - 音频前置：`POST /api/transcribe`（faster-whisper/small，本机 `.venv-audio`）。
- 未使用静态推断；每条样本都实际发出 HTTP 请求并留存响应。未做任何逐样本浏览器/RPA 操作（RPA 仅主线少量冒烟，不参与 70 条结果）。

## 3. 请求构造（对齐消费者端真实提交）
按素材类型构造与前端一致的 JSON：
- 音频（A*）：先 `/api/transcribe` 得到转写文本与带时间戳 segment，再以 `kind=audio`、`text`、`lines=[{text,seconds}]` 提交 `/api/review`。
- 评论组（C*、E113–E124）：`kind=comments`，`text` 为全部评论文本拼接，`comments=[{id,author,authorKey,text}]`。
- 文章（E105–E112）：`kind=text`，`text=content.txt`。
- 图文帖（E101–E104）：`kind=image`，携带图片 dataURL、`post.txt` 与 OCR 行（带归一化 box）。
- 纯图片（E125–E136、I001–I008）：`kind=image`，携带图片 dataURL 与 OCR 行。
- E137–E140：APP 无 `evidence.json` 结构化血缘输入入口，仅以 `post.txt` 文本提交，缺口已在记录中标注。
- 超限图片（>2.8MB dataURL）复刻浏览器 `normalize()`：先压缩为 JPEG q0.85 再提交。

## 4. 判定口径（重要）
- APP 输出的总判定取自 `presentation.total_decision` / `audit.total_decision`，限定五类：`暂未发现问题 / 有明确问题 / 线索级（待核验） / 资料不足 / 无法判定`。
- **HTTP 200 / API 成功不等于通过**。`pass=true` 仅当 APP 实际五类判定与参考标签 `decision` 完全一致；不一致记为不通过，并在 mismatch 列表列出。
- 本批区分「现有规则/API 是否正确执行」与「专业鉴伪能力是否验证」：现有规则（数字冲突、绝对化/功效/背书线索、评论重复、本地取证软信号、图文 OCR 对照）实际运行；像素级篡改定位、声音克隆检测、官方品牌资料库、生成图检测器（UFD，torch/open_clip 未安装）**未接入/未验证**，不得据此宣称鉴伪能力。

## 5. 环境与能力边界（实测）
- `/api/health`：DeepSeek `configured=true`（deepseek-flash，vision）；本地取证 pillow/opencv 可用；`torch=false / open_clip=false / ufd_dir=""`，生成图检测器未启用。
- 本批多数路径没有可对照的品牌/公开资料（APP 不读取包内 `sources/knowledge/K0x.txt`），故 D1 常落 `EI`，总判定多为「资料不足」；这是当前实现的真实输出，已如实记录，未为凑通过率人工改写。
- OCR：用 tesseract（chi_sim+eng）复刻浏览器端识字，产出带 box 行供 D3 图文对照；OCR 仅为辅助，不作为真假结论。
- 音频为合成口播转写；未判断声音是否合成（APP 也无此能力）。

## 6. 结果概览（70 条全部 HTTP 200，0 传输/服务错误）
- 实跑成功 70 / 错误 0；与参考标签一致（pass）13 条。
- 实际判定分布：资料不足 47、线索级（待核验）23；本批 APP 未输出「有明确问题/暂未发现问题/无法判定」。
- 期望判定分布：暂未发现问题 22、资料不足 19、有明确问题 18、线索级 9、无法判定 2。
- 分片：开发 39、验证 16、保留测试 15。
- 分模态通过：音频 1/10、评论组 6/24、图文帖 1/8、文章 2/8、图片 3/20。

## 7. 复现步骤
```bash
# 1) 启动本地消费者端后端（端口可改）
cd /Users/sugeladi/Desktop/欧莱雅黑客松/AUTHEN/web
AUTHEN_PORT=4191 node server.mjs
# 2) 另开终端，执行批跑（断点续跑，已 200 的样本自动跳过）
cd <artifacts>
node run_shard01.mjs
# 3) 生成 CSV/JSONL/汇总
python3 make_outputs.py
```

## 8. 产物与日志位置（均在本 artifacts/ 下）
- `shard_01.csv`：逐样本扁平表。
- `shard_01.jsonl`：逐样本结构化记录（一行一条）。
- `shard_01_summary.json`：通过数与按模态/判定/分片/错误类型统计、mismatch 清单。
- `shard_01.records.json`：内部原始记录（含耗时、provider/model、维度向量）。
- `raw_requests/<id>.request.json`：原始请求（图片 dataURL 不内联，记路径与摘要）。
- `raw_responses/<id>.response.json`：原始响应（HTTP 状态 + 完整 body）。
- `logs/`：批跑日志。
- 脚本：`run_shard01.mjs`（实跑）、`make_outputs.py`（出表）。

## 9. 合规声明
本集为构造/脱敏验收集，参考标签非第三方真值，结果不得表述为真实平台准确率；答案（annotations、manifest_labels）未进入任何模型请求。
