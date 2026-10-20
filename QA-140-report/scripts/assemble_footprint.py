#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""组装可复现测试足迹：逐样本 request/response/run.log + 批次日志/脚本/运行说明。"""
import json, os, shutil, csv

BASE = "/Users/sugeladi/Desktop/欧莱雅黑客松/AUTHEN/QA-140-report"
W1 = "/Users/sugeladi/Library/Application Support/DoubaoWork/Default/.doubaowork/agent_mode/workspace/.sessions/38448061071007746/agents/s_000EAvdwoiw/artifacts"
W2 = "/Users/sugeladi/Library/Application Support/DoubaoWork/Default/.doubaowork/agent_mode/workspace/.sessions/38448061071007746/agents/s_000EAvdwdbc/artifacts"
WORK2 = "/Users/sugeladi/Library/Application Support/DoubaoWork/Default/.doubaowork/agent_mode/workspace/.sessions/38448061071007746/agents/s_000EAvdwdbc/work"
FP = os.path.join(BASE, "footprint")
SAMP = os.path.join(FP, "samples")
BLOG = os.path.join(FP, "batch_logs")
os.makedirs(SAMP, exist_ok=True)
os.makedirs(BLOG, exist_ok=True)

recs = [json.loads(l) for l in open(os.path.join(BASE, "data/merged_140.jsonl"), encoding="utf-8")]

index_rows = []
for r in recs:
    sid = r["sample_id"]
    d = os.path.join(SAMP, sid)
    os.makedirs(d, exist_ok=True)
    if r["shard"] == "shard_01":
        shutil.copy2(os.path.join(W1, "raw_requests", f"{sid}.request.json"),
                     os.path.join(d, "request.json"))
        shutil.copy2(os.path.join(W1, "raw_responses", f"{sid}.response.json"),
                     os.path.join(d, "response.json"))
        log = (f"sample_id={sid}\nshard=shard_01\nendpoint={r['endpoint']}\n"
               f"http_status={r['http_status']}\nelapsed_ms={r['elapsed_ms']}\n"
               f"input_files={';'.join(r['input_files'] or [])}\n"
               f"request_summary={r['request_summary']}\n"
               f"expected={r['expected_decision']}\nactual={r['actual_decision']}\n"
               f"strict_pass={str(r['strict_pass']).lower()}\n"
               f"error_type={r['error_type']}\nmismatch_kind={r['mismatch_kind']}\n"
               f"provider={r['provider']} model={r['model']}\n"
               f"started_at={r['started_at']}\n")
        open(os.path.join(d, "run.log"), "w", encoding="utf-8").write(log)
    else:
        src = os.path.join(W2, "raw", sid)
        for fn in ["request.json", "response.json", "run.log"]:
            shutil.copy2(os.path.join(src, fn), os.path.join(d, fn))
    index_rows.append({
        "sample_id": sid, "shard": r["shard"], "modality": r["modality"],
        "scenario": r["scenario"], "expected": r["expected_decision"],
        "actual": r["actual_decision"], "strict_pass": str(r["strict_pass"]).lower(),
        "http_status": r["http_status"],
        "request": f"samples/{sid}/request.json",
        "response": f"samples/{sid}/response.json",
        "run_log": f"samples/{sid}/run.log",
    })

# 批次级日志 / 脚本 / 说明
copies = [
    (os.path.join(W1, "shard_01_runbook.md"), "batch_logs/shard_01_RUNBOOK.md"),
    (os.path.join(W1, "shard_01_summary.json"), "batch_logs/shard_01_summary.json"),
    (os.path.join(W1, "shard_01.csv"), "batch_logs/shard_01.csv"),
    (os.path.join(W1, "shard_01.jsonl"), "batch_logs/shard_01.jsonl"),
    (os.path.join(W1, "shard_01.records.json"), "batch_logs/shard_01.records.json"),
    (os.path.join(W1, "shard_01_covered.json"), "batch_logs/shard_01_covered.json"),
    (os.path.join(W1, "run_shard01.mjs"), "batch_logs/run_shard01.mjs"),
    (os.path.join(W1, "make_outputs.py"), "batch_logs/make_outputs.py"),
    (os.path.join(W2, "shard_02_RUNBOOK.md"), "batch_logs/shard_02_RUNBOOK.md"),
    (os.path.join(W2, "shard_02_summary.json"), "batch_logs/shard_02_summary.json"),
    (os.path.join(W2, "shard_02_results.csv"), "batch_logs/shard_02_results.csv"),
    (os.path.join(W2, "shard_02_results.jsonl"), "batch_logs/shard_02_results.jsonl"),
    (os.path.join(W2, "shard_02_run_console.log"), "batch_logs/shard_02_run_console.log"),
    (os.path.join(W2, "shard_02_server.log"), "batch_logs/shard_02_server.log"),
    (os.path.join(WORK2, "run_shard02.mjs"), "batch_logs/run_shard02.mjs"),
    (os.path.join(WORK2, "postprocess.py"), "batch_logs/postprocess.py"),
]
for src, rel in copies:
    if os.path.exists(src):
        shutil.copy2(src, os.path.join(FP, rel))
    else:
        print("MISSING:", src)

# s1 批次运行日志
ld = os.path.join(BLOG, "shard_01_run_logs")
os.makedirs(ld, exist_ok=True)
for fn in os.listdir(os.path.join(W1, "logs")):
    shutil.copy2(os.path.join(W1, "logs", fn), os.path.join(ld, fn))

# 索引 CSV
with open(os.path.join(FP, "index.csv"), "w", encoding="utf-8-sig", newline="") as f:
    w = csv.DictWriter(f, fieldnames=list(index_rows[0].keys()))
    w.writeheader()
    w.writerows(index_rows)

print("samples:", len(index_rows))
