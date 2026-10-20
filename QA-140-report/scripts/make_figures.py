#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""由 merged_140.jsonl 独立复算结果生成报告图表（中文，matplotlib）。"""
import json, os, collections
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager as fm
import numpy as np

BASE = "/Users/sugeladi/Desktop/欧莱雅黑客松/AUTHEN/QA-140-report"
FIG = os.path.join(BASE, "figures")
os.makedirs(FIG, exist_ok=True)

FONT = "/System/Library/Fonts/STHeiti Medium.ttc"
fm.fontManager.addfont(FONT)
zh = fm.FontProperties(fname=FONT)
plt.rcParams["font.family"] = zh.get_name()
plt.rcParams["axes.unicode_minus"] = False

INK = "#2b2622"; PAPER = "#f6f1e7"; RED = "#b3261e"; SAGE = "#7a9b76"
AMBER = "#d99a3d"; GREY = "#9a918a"; BLUEG = "#5b7d99"

recs = [json.loads(l) for l in open(os.path.join(BASE, "data/merged_140.jsonl"), encoding="utf-8")]
S = json.load(open(os.path.join(BASE, "data/summary_140.json"), encoding="utf-8"))
FIVE = S["five_classes"]

def style(ax):
    for s in ["top", "right"]:
        ax.spines[s].set_visible(False)
    ax.set_facecolor(PAPER)
    ax.tick_params(colors=INK, labelsize=10)
    for s in ["left", "bottom"]:
        ax.spines[s].set_color("#c9bfb2")

# ---------- 图1：通过概览（严格通过 vs HTTP 200） ----------
fig, axes = plt.subplots(1, 2, figsize=(9.2, 3.9), gridspec_kw={"width_ratios": [1, 1.15]})
fig.patch.set_facecolor("white")
ax = axes[0]
vals = [S["strict_passed"], S["strict_failed"]]
cols = [RED, "#e3d9ca"]
w, _, at = ax.pie(vals, colors=cols, startangle=90, counterclock=False,
                  wedgeprops=dict(width=0.42, edgecolor="white"),
                  autopct=lambda p: f"{p:.1f}%", pctdistance=0.78,
                  textprops=dict(color="white", fontsize=11, fontproperties=zh))
at[1].set_color(INK)
ax.text(0, 0.08, f"{S['strict_passed']}/140", ha="center", va="center",
        fontsize=20, fontweight="bold", color=RED, fontproperties=zh)
ax.text(0, -0.18, "严格通过", ha="center", fontsize=10, color=INK, fontproperties=zh)
ax.set_title("严格通过（五类判定完全一致）", fontproperties=zh, fontsize=12, color=INK, pad=10)

ax = axes[1]
labels = ["HTTP 200\n流程跑通", "严格判定通过"]
v = [S["http_200_count"], S["strict_passed"]]
bars = ax.bar(labels, v, color=[GREY, RED], width=0.55)
for b, n in zip(bars, v):
    ax.text(b.get_x() + b.get_width()/2, n + 2, f"{n} 条", ha="center",
            fontsize=11, fontproperties=zh, color=INK)
ax.set_ylim(0, 160); ax.set_ylabel("样本数", fontproperties=zh)
ax.set_xticks(range(len(labels))); ax.set_xticklabels(labels, fontproperties=zh)
style(ax)
ax.set_title("HTTP 200 ≠ 通过：140 条全部 200，仅 17 条判定一致",
             fontproperties=zh, fontsize=11.5, color=INK, pad=10)
plt.tight_layout()
plt.savefig(os.path.join(FIG, "fig1_pass_overview.png"), dpi=170, bbox_inches="tight", facecolor="white")
plt.close()

# ---------- 图2：期望 vs 实际判定分布 ----------
exp = S["expected_distribution"]; act = S["actual_distribution"]
x = np.arange(len(FIVE)); w = 0.38
fig, ax = plt.subplots(figsize=(9.6, 4.2))
fig.patch.set_facecolor("white")
b1 = ax.bar(x - w/2, [exp[d] for d in FIVE], w, label="期望判定（参考标签）", color=BLUEG)
b2 = ax.bar(x + w/2, [act[d] for d in FIVE], w, label="APP 实际判定", color=RED)
for bars in (b1, b2):
    for b in bars:
        ax.text(b.get_x()+b.get_width()/2, b.get_height()+0.6, int(b.get_height()),
                ha="center", fontsize=9.5, fontproperties=zh, color=INK)
ax.set_xticks(x); ax.set_xticklabels(FIVE, fontproperties=zh, fontsize=10)
ax.set_ylabel("样本数", fontproperties=zh); ax.set_ylim(0, 42)
ax.legend(prop=zh, frameon=False, loc="upper right")
style(ax)
ax.set_title("期望判定 vs APP 实际判定分布（140 条）", fontproperties=zh, fontsize=13, color=INK, pad=10)
plt.tight_layout()
plt.savefig(os.path.join(FIG, "fig2_expected_vs_actual.png"), dpi=170, bbox_inches="tight", facecolor="white")
plt.close()

# ---------- 图3：分模态通过 ----------
bm = S["by_modality"]
order = ["音频", "评论组", "图文帖", "文章", "图片", "视频", "转发变体"]
order = [m for m in order if m in bm]
names = order; rates = [bm[m]["pass_rate"]*100 for m in order]
nums = [f'{bm[m]["passed"]}/{bm[m]["total"]}' for m in order]
fig, ax = plt.subplots(figsize=(9.2, 3.8))
fig.patch.set_facecolor("white")
bars = ax.barh(names[::-1], rates[::-1], color=[RED if r > 0 else "#d8cfc2" for r in rates[::-1]], height=0.6)
for b, n, r in zip(bars, nums[::-1], rates[::-1]):
    ax.text(b.get_width()+1.2, b.get_y()+b.get_height()/2, f"{r:.1f}%（{n}）",
            va="center", fontsize=10.5, fontproperties=zh, color=INK)
ax.set_xlim(0, max(rates)*1.35 + 8); ax.set_xlabel("严格通过率 %", fontproperties=zh)
ax.set_yticks(range(len(names))); ax.set_yticklabels(names[::-1], fontproperties=zh, fontsize=11)
style(ax)
ax.set_title("分模态严格通过数与通过率", fontproperties=zh, fontsize=13, color=INK, pad=10)
plt.tight_layout()
plt.savefig(os.path.join(FIG, "fig3_modality.png"), dpi=170, bbox_inches="tight", facecolor="white")
plt.close()

# ---------- 图4：分场景通过 ----------
bs = S["by_scenario"]
sn = ["开发", "验证", "保留测试"]
sv = [bs[s]["pass_rate"]*100 for s in sn]
snums = [f'{bs[s]["passed"]}/{bs[s]["total"]}' for s in sn]
fig, ax = plt.subplots(figsize=(6.6, 3.6))
fig.patch.set_facecolor("white")
bars = ax.bar(sn, sv, color=[SAGE, AMBER, BLUEG], width=0.55)
for b, n, r in zip(bars, snums, sv):
    ax.text(b.get_x()+b.get_width()/2, r+0.6, f"{r:.1f}%\n{n}", ha="center",
            fontsize=10.5, fontproperties=zh, color=INK)
ax.set_ylim(0, 30); ax.set_ylabel("严格通过率 %", fontproperties=zh)
ax.set_xticks(range(len(sn))); ax.set_xticklabels(sn, fontproperties=zh, fontsize=11)
style(ax)
ax.set_title("分场景（split）严格通过", fontproperties=zh, fontsize=13, color=INK, pad=10)
plt.tight_layout()
plt.savefig(os.path.join(FIG, "fig4_scenario.png"), dpi=170, bbox_inches="tight", facecolor="white")
plt.close()

# ---------- 图5：混淆矩阵（期望行 × 实际列） ----------
cm = S["confusion_matrix_expected_rows_x_actual_cols"]
M = np.array([[cm[e][a] for a in FIVE] for e in FIVE])
fig, ax = plt.subplots(figsize=(8.6, 6.6))
fig.patch.set_facecolor("white")
im = ax.imshow(M, cmap="OrRd", aspect="auto")
ax.set_xticks(range(5)); ax.set_yticks(range(5))
ax.set_xticklabels(FIVE, fontproperties=zh, rotation=30, ha="right", fontsize=10)
ax.set_yticklabels(FIVE, fontproperties=zh, fontsize=10)
ax.set_xlabel("APP 实际判定", fontproperties=zh); ax.set_ylabel("期望判定", fontproperties=zh)
for i in range(5):
    for j in range(5):
        v = M[i, j]
        ax.text(j, i, str(v), ha="center", va="center",
                color="white" if v > M.max()*0.55 else INK,
                fontsize=12, fontweight="bold" if i == j else "normal", fontproperties=zh)
ax.set_title("期望 × 实际判定混淆矩阵（对角=严格通过）", fontproperties=zh, fontsize=13, color=INK, pad=12)
cb = fig.colorbar(im, ax=ax, fraction=0.046, pad=0.04); cb.ax.tick_params(labelsize=9)
plt.tight_layout()
plt.savefig(os.path.join(FIG, "fig5_confusion.png"), dpi=170, bbox_inches="tight", facecolor="white")
plt.close()

# ---------- 图6：失败类型分布 ----------
mk = S["mismatch_kinds"]
labels = ["missed_conflict\n漏报明确问题", "false_alarm_or_clue\n干净样本误报/给线索", "other\n其他不一致", "(一致)"]
keys = ["missed_conflict", "false_alarm_or_clue", "other", "(一致/无)"]
vals = [mk.get(k, 0) for k in keys]
fig, ax = plt.subplots(figsize=(8.8, 3.8))
fig.patch.set_facecolor("white")
bars = ax.bar(labels, vals, color=[RED, AMBER, GREY, SAGE], width=0.6)
for b, v in zip(bars, vals):
    ax.text(b.get_x()+b.get_width()/2, v+1, f"{v} 条", ha="center",
            fontsize=11, fontproperties=zh, color=INK)
ax.set_ylim(0, max(vals)*1.25); ax.set_ylabel("样本数", fontproperties=zh)
ax.set_xticks(range(len(labels))); ax.set_xticklabels(labels, fontproperties=zh, fontsize=10)
style(ax)
ax.set_title("123 条未通过的失败类型（mismatch_kind）", fontproperties=zh, fontsize=13, color=INK, pad=10)
plt.tight_layout()
plt.savefig(os.path.join(FIG, "fig6_mismatch.png"), dpi=170, bbox_inches="tight", facecolor="white")
plt.close()

# ---------- 图7：期望「有明确问题」的实际去向 ----------
row = cm["有明确问题"]
labels7 = FIVE
vals7 = [row[a] for a in FIVE]
fig, ax = plt.subplots(figsize=(8.8, 3.8))
fig.patch.set_facecolor("white")
bars = ax.bar(labels7, vals7, color=[SAGE, "#d8cfc2", AMBER, "#d8cfc2", "#d8cfc2"], width=0.6)
for b, v in zip(bars, vals7):
    ax.text(b.get_x()+b.get_width()/2, v+0.6, f"{v}", ha="center",
            fontsize=11, fontproperties=zh, color=INK)
ax.set_ylabel("样本数", fontproperties=zh); ax.set_ylim(0, max(vals7)*1.25 + 2)
ax.set_xticks(range(len(labels7))); ax.set_xticklabels(labels7, fontproperties=zh, fontsize=10)
style(ax)
hit = row["有明确问题"]; tot = sum(row.values())
ax.set_title(f"期望「有明确问题」{tot} 条的实际判定去向（仅 {hit} 条命中）",
             fontproperties=zh, fontsize=12.5, color=INK, pad=10)
plt.tight_layout()
plt.savefig(os.path.join(FIG, "fig7_missed_flow.png"), dpi=170, bbox_inches="tight", facecolor="white")
plt.close()

print("figures done:", sorted(os.listdir(FIG)))
