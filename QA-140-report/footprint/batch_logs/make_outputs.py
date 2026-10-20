#!/usr/bin/env python3
# 从实跑记录生成 shard_01 的 CSV / JSONL / 汇总 JSON。
import json, csv, os, collections

ART = os.path.dirname(os.path.abspath(__file__))
PKG = '/Users/sugeladi/Desktop/欧莱雅黑客松/AUTHEN_多模态测试数据包_v2_unzipped/AUTHEN_多模态测试数据包_v2_140条'

labels = {}
for line in open(os.path.join(PKG, 'manifest_labels.jsonl'), encoding='utf-8'):
    o = json.loads(line); labels[o['id']] = o

recs = json.load(open(os.path.join(ART, 'shard_01.records.json'), encoding='utf-8'))

def summarize(p):
    parts = [f"kind={p.get('kind')}"]
    if p.get('text'): parts.append(f"text={len(p['text'])}字")
    if p.get('images'): parts.append(f"images={len(p['images'])}")
    if p.get('lines'): parts.append(f"lines={len(p['lines'])}")
    if p.get('comments'): parts.append(f"comments={len(p['comments'])}")
    return ', '.join(parts)

def load_raw(sid):
    out = {}
    rf = os.path.join(ART, 'raw_responses', f'{sid}.response.json')
    if os.path.exists(rf):
        b = json.load(open(rf, encoding='utf-8'))
        out['http_status'] = b.get('http_status')
        out['body'] = b.get('body', {})
    qf = os.path.join(ART, 'raw_requests', f'{sid}.request.json')
    if os.path.exists(qf):
        q = json.load(open(qf, encoding='utf-8'))
        out['request'] = q.get('request', {})
    return out

def normalize(r):
    sid = r['sample_id']
    lab = labels.get(sid, {})
    raw = load_raw(sid)
    body = raw.get('body', {})
    pres = body.get('presentation', {}) or {}
    # 回填缓存样本缺失的字段
    http_status = r.get('http_status') or raw.get('http_status')
    request_summary = r.get('request_summary') or summarize(raw.get('request', {}))
    return {
        'sample_id': sid,
        'expected_modality': lab.get('modality'),
        'split': r.get('split'),
        'expected_decision': r['expected_decision'],
        'actual_decision': r.get('actual_decision') or pres.get('total_decision') or '',
        'pass': bool(r.get('pass')),
        'presentation_state': r.get('presentation_state') or pres.get('presentation_state',''),
        'summary': r.get('summary') or pres.get('state_reason',''),
        'next_action': r.get('next_action') or pres.get('next_action',''),
        'evidence_cards': r.get('evidence_cards', []) or [
            {'card': c.get('card_id'), 'dim': c.get('dim'), 'title': c.get('title'),
             'location': c.get('location_quality'), 'seconds': c.get('seconds'), 'box': c.get('box')}
            for c in pres.get('evidence_cards', [])],
        'dim_state_vector': r.get('dim_state_vector', {}) or body.get('audit', {}).get('dim_state_vector', {}),
        'aggregate_state': r.get('aggregate_state') or body.get('audit', {}).get('aggregate_state'),
        'e2_subtype': r.get('e2_subtype') or body.get('audit', {}).get('e2_subtype'),
        'rejection_reason_code': r.get('rejection_reason_code') or body.get('audit', {}).get('rejection_reason_code'),
        'provider': r.get('provider') or body.get('audit', {}).get('provider'),
        'model': r.get('model') or body.get('audit', {}).get('model'),
        'http_status': http_status,
        'app_elapsed_ms': r.get('app_elapsed_ms') or body.get('audit', {}).get('elapsed_ms'),
        'entry_point': r.get('entry_point'),
        'request_summary': request_summary,
        'input_files': r.get('input_files', []),
        'reference_files': lab.get('reference_files', []),
        'mechanism': r.get('mechanism'),
        'evidence_group': r.get('evidence_group'),
        'status': r.get('status'),
        'error_type': r.get('error_type','') or '',
        'error_detail': r.get('error_detail',''),
        'pass': bool(r.get('pass')) or (r.get('actual_decision') == r['expected_decision']),
        'request_log': f"raw_requests/{sid}.request.json",
        'response_log': f"raw_responses/{sid}.response.json",
        'started_at': r.get('started_at'),
        'run_time': r.get('started_at'),
    }

# ---------- JSONL ----------
with open(os.path.join(ART, 'shard_01.jsonl'), 'w', encoding='utf-8') as f:
    for r in recs:
        f.write(json.dumps(normalize(r), ensure_ascii=False) + '\n')

# ---------- CSV ----------
csv_path = os.path.join(ART, 'shard_01.csv')
cols = ['sample_id','expected_modality','split','expected_decision','actual_decision','pass',
        'presentation_state','summary','next_action','evidence_cards','dim_state_vector',
        'aggregate_state','e2_subtype','rejection_reason_code','provider','model',
        'http_status','app_elapsed_ms','entry_point','request_summary','input_files',
        'reference_files','mechanism','evidence_group','status','error_type','error_detail',
        'request_log','response_log','started_at','run_time']
with open(csv_path, 'w', encoding='utf-8-sig', newline='') as f:
    w = csv.writer(f)
    w.writerow(cols)
    for r in recs:
        n = normalize(r)
        w.writerow([json.dumps(n.get(c), ensure_ascii=False) if isinstance(n.get(c), (list, dict)) else n.get(c, '') for c in cols])

# ---------- 汇总 JSON ----------
ok = [r for r in recs if r['status'] == 'ok']
err = [r for r in recs if r['status'] != 'ok']
passed = [r for r in ok if r.get('pass')]

def dist(key, rows):
    c = collections.Counter(r.get(key) or '(空)' for r in rows)
    return dict(c.most_common())

summary = {
    'shard': 'shard_01',
    'total_samples': len(recs),
    'successful_runs': len(ok),
    'error_runs': len(err),
    'passed_count': len(passed),
    'pass_rate_vs_successful': round(len(passed)/len(ok), 4) if ok else None,
    'note': 'API/HTTP 200 不等于通过；pass 仅指 APP 实际五类判定与参考标签一致。',
    'by_expected_decision': dist('expected_decision', recs),
    'by_actual_decision': dist('actual_decision', ok),
    'by_modality': dist('expected_modality', recs),
    'by_split': dist('split', recs),
    'by_error_type': dist('error_type', err),
    'mismatches': [{'sample_id': r['sample_id'], 'expected': r['expected_decision'], 'actual': r.get('actual_decision'), 'summary': (r.get('summary') or '')[:120]} for r in ok if not r.get('pass')],
}
with open(os.path.join(ART, 'shard_01_summary.json'), 'w', encoding='utf-8') as f:
    json.dump(summary, f, ensure_ascii=False, indent=2)

print('records', len(recs), 'ok', len(ok), 'err', len(err), 'passed', len(passed))
