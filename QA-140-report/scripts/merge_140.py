#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AUTHEN QA-140 合并与独立复算脚本
- 读取 shard_01.jsonl / shard_02_results.jsonl 两份真实批测明细
- 以 manifest_labels.jsonl 作为独立参考标签来源交叉校验
- 严格通过定义：实际五类判定 == 期望五类判定（HTTP 200 不计通过）
- 输出：merged_140.jsonl / merged_140.csv / summary_140.json
"""
import json, csv, os, sys, collections, hashlib, datetime

BASE = "/Users/sugeladi/Desktop/欧莱雅黑客松/AUTHEN/QA-140-report"
W1 = "/Users/sugeladi/Library/Application Support/DoubaoWork/Default/.doubaowork/agent_mode/workspace/.sessions/38448061071007746/agents/s_000EAvdwoiw/artifacts"
W2 = "/Users/sugeladi/Library/Application Support/DoubaoWork/Default/.doubaowork/agent_mode/workspace/.sessions/38448061071007746/agents/s_000EAvdwdbc/artifacts"
PKG = "/Users/sugeladi/Desktop/欧莱雅黑客松/AUTHEN数据包扩充_v2/AUTHEN_多模态测试数据包_v2_140条"

FIVE = ["暂未发现问题", "有明确问题", "线索级（待核验）", "资料不足", "无法判定"]
MODALITIES = ["音频", "评论组", "图文帖", "文章", "图片", "视频", "转发变体"]
SCENARIOS = ["开发", "验证", "保留测试"]


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def derive_mismatch_kind(expected, actual):
    """与 shard_02 口径一致：missed_conflict 漏报明确问题；
    false_alarm_or_clue 对干净样本提前给线索；其余 other。"""
    if expected == actual:
        return ""
    if expected == "有明确问题":
        return "missed_conflict"
    if expected == "暂未发现问题" and actual == "线索级（待核验）":
        return "false_alarm_or_clue"
    return "other"


# ---------- 载入独立参考标签 ----------
labels = {}
with open(os.path.join(PKG, "manifest_labels.jsonl"), encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        o = json.loads(line)
        labels[o["id"]] = o

# ---------- 载入两份分片 ----------
recs = []
crosscheck_issues = []

with open(os.path.join(W1, "shard_01.jsonl"), encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        r = json.loads(line)
        sid = r["sample_id"]
        lab = labels.get(sid, {})
        expected = r["expected_decision"]
        actual = r["actual_decision"]
        strict_pass = (expected == actual)
        # 独立交叉校验期望标签
        for key, field in [("decision", expected), ("modality", r["expected_modality"]), ("split", r["split"])]:
            if lab.get(key) is not None and lab.get(key) != field:
                crosscheck_issues.append({"sample_id": sid, "field": key, "shard": "shard_01",
                                          "record": field, "manifest": lab.get(key)})
        recs.append({
            "sample_id": sid,
            "shard": "shard_01",
            "modality": r["expected_modality"],
            "scenario": r["split"],
            "expected_decision": expected,
            "actual_decision": actual,
            "strict_pass": strict_pass,
            "shard_pass_flag": bool(r["pass"]),
            "http_status": r.get("http_status"),
            "endpoint": r.get("entry_point", ""),
            "provider": r.get("provider", ""),
            "model": r.get("model", ""),
            "elapsed_ms": r.get("app_elapsed_ms"),
            "retries": None,
            "mechanism": r.get("mechanism", ""),
            "presentation_state": r.get("presentation_state", ""),
            "error_type": "none" if strict_pass else "verdict_mismatch",
            "mismatch_kind": "" if strict_pass else derive_mismatch_kind(expected, actual),
            "app_summary": r.get("summary", ""),
            "app_next": r.get("next_action", ""),
            "evidence_card_count": len(r.get("evidence_cards", []) or []),
            "dim_state_vector": r.get("dim_state_vector", {}),
            "aggregate_state": r.get("aggregate_state", ""),
            "request_summary": r.get("request_summary", ""),
            "input_files": r.get("input_files", []),
            "reference_files": r.get("reference_files", []),
            "footprint_request": f"footprint/samples/{sid}/request.json",
            "footprint_response": f"footprint/samples/{sid}/response.json",
            "footprint_log": f"footprint/samples/{sid}/run.log",
            "manifest_title": lab.get("title", ""),
            "manifest_why": lab.get("why", ""),
            "manifest_quote": lab.get("quote", ""),
            "manifest_evidence_quote": lab.get("evidence_quote", ""),
            "manifest_six_dimensions": lab.get("six_dimensions", []),
            "manifest_origin_truth": lab.get("origin_truth", ""),
            "started_at": r.get("started_at", ""),
        })

with open(os.path.join(W2, "shard_02_results.jsonl"), encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        r = json.loads(line)
        sid = r["sample_id"]
        lab = labels.get(sid, {})
        expected = r["expected_judgment"]
        actual = r["actual_judgment"]
        strict_pass = (expected == actual)
        for key, field in [("decision", expected), ("modality", r["modality"]), ("split", r["scenario"])]:
            if lab.get(key) is not None and lab.get(key) != field:
                crosscheck_issues.append({"sample_id": sid, "field": key, "shard": "shard_02",
                                          "record": field, "manifest": lab.get(key)})
        recs.append({
            "sample_id": sid,
            "shard": "shard_02",
            "modality": r["modality"],
            "scenario": r["scenario"],
            "expected_decision": expected,
            "actual_decision": actual,
            "strict_pass": strict_pass,
            "shard_pass_flag": bool(r["passed"]),
            "http_status": r.get("http_status"),
            "endpoint": r.get("endpoint", ""),
            "provider": r.get("provider", ""),
            "model": r.get("model", ""),
            "elapsed_ms": r.get("elapsed_ms"),
            "retries": r.get("retries"),
            "mechanism": r.get("mechanism", ""),
            "presentation_state": r.get("presentation_state", ""),
            "error_type": r.get("error_type", "none"),
            "mismatch_kind": r.get("mismatch_kind", ""),
            "app_summary": r.get("app_summary", ""),
            "app_next": r.get("app_next", ""),
            "evidence_card_count": len(r.get("app_evidence", []) or []),
            "dim_state_vector": r.get("dim_state_vector", {}),
            "aggregate_state": "",
            "request_summary": r.get("request_summary", ""),
            "input_files": r.get("input_files", []),
            "reference_files": [],
            "footprint_request": f"footprint/samples/{sid}/request.json",
            "footprint_response": f"footprint/samples/{sid}/response.json",
            "footprint_log": f"footprint/samples/{sid}/run.log",
            "manifest_title": lab.get("title", ""),
            "manifest_why": lab.get("why", ""),
            "manifest_quote": lab.get("quote", ""),
            "manifest_evidence_quote": lab.get("evidence_quote", ""),
            "manifest_six_dimensions": lab.get("six_dimensions", []),
            "manifest_origin_truth": lab.get("origin_truth", ""),
            "started_at": "",
        })

# ---------- 自检 ----------
assert len(recs) == 140, f"记录数 {len(recs)} != 140"
ids = [r["sample_id"] for r in recs]
assert len(set(ids)) == 140, "sample_id 存在重复"
missing_labels = [s for s in ids if s not in labels]
assert not missing_labels, f"缺少 manifest 标签: {missing_labels}"
for r in recs:
    assert r["expected_decision"] in FIVE, (r["sample_id"], r["expected_decision"])
    assert r["actual_decision"] in FIVE, (r["sample_id"], r["actual_decision"])
# 分片 pass 标记与严格复算一致（HTTP200 不得被计为通过）
flag_mismatch = [r["sample_id"] for r in recs if r["shard_pass_flag"] != r["strict_pass"]]
assert not flag_mismatch, f"分片 pass 标记与严格复算不一致: {flag_mismatch}"

# 自然排序（字母+数字）
import re
def natkey(s):
    return [int(t) if t.isdigit() else t for t in re.split(r"(\d+)", s)]
recs.sort(key=lambda r: natkey(r["sample_id"]))

# ---------- 统计 ----------
total = len(recs)
passed = sum(1 for r in recs if r["strict_pass"])
http200 = sum(1 for r in recs if r["http_status"] == 200)

def ctr(key, subset=None):
    c = collections.Counter((subset or recs))
    out = collections.Counter(r[key] for r in (subset or recs))
    return dict(out)

by_modality = {}
for m in MODALITIES:
    sub = [r for r in recs if r["modality"] == m]
    if not sub:
        continue
    p = sum(1 for r in sub if r["strict_pass"])
    by_modality[m] = {"total": len(sub), "passed": p,
                      "failed": len(sub) - p,
                      "pass_rate": round(p / len(sub), 4)}

by_scenario = {}
for s in SCENARIOS:
    sub = [r for r in recs if r["scenario"] == s]
    p = sum(1 for r in sub if r["strict_pass"])
    by_scenario[s] = {"total": len(sub), "passed": p, "failed": len(sub) - p,
                      "pass_rate": round(p / len(sub), 4)}

by_shard = {}
for sh in ["shard_01", "shard_02"]:
    sub = [r for r in recs if r["shard"] == sh]
    p = sum(1 for r in sub if r["strict_pass"])
    by_shard[sh] = {"total": len(sub), "passed": p, "failed": len(sub) - p,
                    "pass_rate": round(p / len(sub), 4)}

expected_dist = {d: sum(1 for r in recs if r["expected_decision"] == d) for d in FIVE}
actual_dist = {d: sum(1 for r in recs if r["actual_decision"] == d) for d in FIVE}

# 混淆矩阵：行=期望，列=实际
confusion = {e: {a: 0 for a in FIVE} for e in FIVE}
for r in recs:
    confusion[r["expected_decision"]][r["actual_decision"]] += 1

mismatch_kinds = collections.Counter(r["mismatch_kind"] or "(一致/无)" for r in recs)
error_types = collections.Counter(r["error_type"] for r in recs)
http_dist = collections.Counter(str(r["http_status"]) for r in recs)
presentation_dist = collections.Counter(r["presentation_state"] for r in recs)
mechanism_dist = collections.Counter(r["mechanism"] for r in recs)

# 未通过清单
failures = [{
    "sample_id": r["sample_id"], "shard": r["shard"], "modality": r["modality"],
    "scenario": r["scenario"], "expected_decision": r["expected_decision"],
    "actual_decision": r["actual_decision"], "mismatch_kind": r["mismatch_kind"],
    "mechanism": r["mechanism"], "app_summary": r["app_summary"],
} for r in recs if not r["strict_pass"]]

pass_list = [r["sample_id"] for r in recs if r["strict_pass"]]

# 耗时（仅 s2 有真实 elapsed_ms；s1 多为 0，不参与均值）
elapsed = [r["elapsed_ms"] for r in recs if isinstance(r["elapsed_ms"], (int, float)) and r["elapsed_ms"] > 0]

summary = {
    "generated_at": datetime.datetime.now().isoformat(timespec="seconds"),
    "dataset": "AUTHEN_多模态测试数据包_v2_140条（构造/脱敏验收集，参考标签非第三方真值）",
    "total_samples": total,
    "strict_passed": passed,
    "strict_failed": total - passed,
    "strict_pass_rate": round(passed / total, 4),
    "http_200_count": http200,
    "note": "HTTP 200 / API 成功仅表示流程跑通，不计通过；严格通过=实际五类判定与期望五类完全一致。",
    "five_classes": FIVE,
    "by_shard": by_shard,
    "by_modality": by_modality,
    "by_scenario": by_scenario,
    "expected_distribution": expected_dist,
    "actual_distribution": actual_dist,
    "confusion_matrix_expected_rows_x_actual_cols": confusion,
    "mismatch_kinds": dict(mismatch_kinds),
    "error_types": dict(error_types),
    "http_status_distribution": dict(http_dist),
    "presentation_state_distribution": dict(presentation_dist),
    "mechanism_distribution": dict(mechanism_dist),
    "passed_sample_ids": pass_list,
    "crosscheck_manifest_issues": crosscheck_issues,
    "elapsed_ms_available": len(elapsed),
    "elapsed_ms": {"min": min(elapsed), "max": max(elapsed),
                   "mean": round(sum(elapsed) / len(elapsed), 1)} if elapsed else None,
    "source_files": {
        "shard_01": os.path.join(W1, "shard_01.jsonl"),
        "shard_01_sha256": sha256(os.path.join(W1, "shard_01.jsonl")),
        "shard_02": os.path.join(W2, "shard_02_results.jsonl"),
        "shard_02_sha256": sha256(os.path.join(W2, "shard_02_results.jsonl")),
        "manifest_labels": os.path.join(PKG, "manifest_labels.jsonl"),
        "manifest_labels_sha256": sha256(os.path.join(PKG, "manifest_labels.jsonl")),
    },
}

# ---------- 输出 ----------
out_dir = os.path.join(BASE, "data")
os.makedirs(out_dir, exist_ok=True)

with open(os.path.join(out_dir, "merged_140.jsonl"), "w", encoding="utf-8") as f:
    for r in recs:
        f.write(json.dumps(r, ensure_ascii=False) + "\n")

csv_fields = ["sample_id", "shard", "modality", "scenario", "expected_decision",
              "actual_decision", "strict_pass", "http_status", "endpoint",
              "provider", "model", "elapsed_ms", "retries", "mechanism",
              "presentation_state", "error_type", "mismatch_kind",
              "app_summary", "app_next", "evidence_card_count",
              "request_summary", "input_files", "footprint_request",
              "footprint_response", "footprint_log", "manifest_title",
              "manifest_why", "manifest_quote"]
with open(os.path.join(out_dir, "merged_140.csv"), "w", encoding="utf-8-sig", newline="") as f:
    w = csv.DictWriter(f, fieldnames=csv_fields, extrasaction="ignore")
    w.writeheader()
    for r in recs:
        row = dict(r)
        row["input_files"] = ";".join(r["input_files"] or [])
        w.writerow(row)

with open(os.path.join(out_dir, "summary_140.json"), "w", encoding="utf-8") as f:
    json.dump(summary, f, ensure_ascii=False, indent=2)

# 未通过清单单独落盘，便于报告引用
with open(os.path.join(out_dir, "failures_123.json"), "w", encoding="utf-8") as f:
    json.dump(failures, f, ensure_ascii=False, indent=2)

print(f"total={total} strict_passed={passed} failed={total-passed} "
      f"rate={passed/total:.4f} http200={http200}")
print("crosscheck_issues:", len(crosscheck_issues))
print("pass list:", pass_list)
