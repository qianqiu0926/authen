#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""shard_02 汇总：读 shard_02_results.jsonl -> CSV / summary.json / 统计，自查70条且 sample_id 唯一。"""
import json, csv, os, re
from collections import Counter, OrderedDict

WS = "/Users/sugeladi/Library/Application Support/DoubaoWork/Default/.doubaowork/agent_mode/workspace/.sessions/38448061071007746/agents/s_000EAvdwdbc"
ART = os.path.join(WS, "artifacts")
JUDGMENTS = {"暂未发现问题", "有明确问题", "线索级（待核验）", "资料不足", "无法判定"}

rows = []
with open(os.path.join(ART, "shard_02_results.jsonl"), encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if line:
            rows.append(json.loads(line))

# 自查
ids = [r["sample_id"] for r in rows]
assert len(rows) == 70, f"记录数 {len(rows)} != 70"
assert len(set(ids)) == 70, "sample_id 有重复"
for r in rows:
    assert r["actual_judgment"] in JUDGMENTS, (r["sample_id"], r["actual_judgment"])
    assert r["expected_judgment"] in JUDGMENTS

# 排序：与自然排序一致
def natkey(s):
    return [int(t) if t.isdigit() else t for t in re.split(r"(\d+)", s)]
rows.sort(key=lambda r: natkey(r["sample_id"]))

# ---- CSV
cols = ["sample_id","modality","scenario","mechanism","run_entry","endpoint","request_summary",
        "input_files","http_status","app_summary","app_next","app_evidence_cards",
        "expected_judgment","actual_judgment","presentation_state","passed","error_type",
        "mismatch_kind","evidence_request_path","evidence_response_path","evidence_log_path",
        "run_started_at","elapsed_ms","content_type","provider","model","retries","preprocess_notes"]
def flatten(r):
    d = dict(r)
    d["app_evidence_cards"] = " | ".join(
        f"[{e.get('card','')}/{e.get('dim','')}] {e.get('title','')}: {e.get('observation','')}"
        for e in r.get("app_evidence", []))
    d["input_files"] = "; ".join(r.get("input_files", []))
    d["preprocess_notes"] = "; ".join(r.get("preprocess_notes", []))
    # started_at from run.log
    logp = os.path.join(ART, r["evidence_log_path"])
    m = ""
    if os.path.exists(logp):
        for ln in open(logp, encoding="utf-8"):
            if ln.startswith("started_at="):
                m = ln.strip().split("=",1)[1]
    d["run_started_at"] = m
    return {c: d.get(c, "") for c in cols}

with open(os.path.join(ART, "shard_02_results.csv"), "w", newline="", encoding="utf-8-sig") as f:
    w = csv.DictWriter(f, fieldnames=cols)
    w.writeheader()
    for r in rows:
        w.writerow(flatten(r))

# ---- 统计
passed = sum(1 for r in rows if r["passed"])
def count(field):
    c = Counter(r.get(field) or "(空)" for r in rows)
    return dict(OrderedDict(sorted(c.items())))

summary = {
    "shard": "shard_02",
    "total": len(rows),
    "passed": passed,
    "failed": len(rows) - passed,
    "pass_rate": round(passed / len(rows), 4),
    "expected_distribution": count("expected_judgment"),
    "actual_distribution": count("actual_judgment"),
    "by_modality": count("modality"),
    "by_scenario": count("scenario"),
    "by_error_type": count("error_type"),
    "by_mechanism": count("mechanism"),
    "http_status": count("http_status"),
    "mismatch_kinds": count("mismatch_kind"),
    "samples": [r["sample_id"] for r in rows],
    "failures": [
        {"sample_id": r["sample_id"], "modality": r["modality"], "expected": r["expected_judgment"],
         "actual": r["actual_judgment"], "error_type": r["error_type"], "mismatch_kind": r.get("mismatch_kind"),
         "mechanism": r["mechanism"]}
        for r in rows if not r["passed"]
    ],
}
with open(os.path.join(ART, "shard_02_summary.json"), "w", encoding="utf-8") as f:
    json.dump(summary, f, ensure_ascii=False, indent=2)

print("total", summary["total"], "passed", passed, "failed", summary["failed"])
print("actual:", summary["actual_distribution"])
print("by_error:", summary["by_error_type"])
print("by_modality:", summary["by_modality"])
