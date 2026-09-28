#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
check_parity.py —— 两版共享文件「逐字节一致」校验器
============================================================================
放置位置：stock-sim/tools/check_parity.py（韭留美版目录）

【本任务采用的做法（见下「策略说明」）】
  1. STRICT 集合（必须逐字节一致）：本次新增/既有的「共享内核」文件。
     任一不一致或缺失 ⇒ 打印差异清单 ⇒ 非零退出。
  2. KNOWN_DIFF 集合（已知差异，仅报告不算失败）：存量两版就有差异的文件
     （存储键 / 色调 / 台词 / 皮肤），本任务不强制收敛，单独列成「待收敛报告」。
  3. PER_VERSION 集合（各版独立、刻意不同）：version.js / override.*.js / 皮肤
     等，不参与比对（打印提示即可）。

【为什么这样选】
  架构设计 §决策1 要求「新增逻辑全部落共享文件、逐字节一致」，同时本次增量
  之前 game.js / ui.js / chart.js 已存在已知差异（见架构 §0「两版差异实测」）。
  若把它们纳入 STRICT 会立刻误报失败，掩盖真正的漂移；故把「本次新增的共享
  文件」作为硬门槛（STRICT），把存量差异降级为「待收敛报告」（KNOWN_DIFF），
  待 T05 收敛后再把它们提升进 STRICT。

使用：
  python tools/check_parity.py
  python tools/check_parity.py --root-a <A> --root-b <B>
退出码：0 = STRICT 全部一致；1 = 存在 STRICT 不一致/缺失。
============================================================================
"""

import argparse
import hashlib
import os
import sys

# --------------------------------------------------------------------------- #
# 文件集合定义（相对各版本仓库根目录）
# --------------------------------------------------------------------------- #

# 1) 必须逐字节一致（新增共享内核 + 既有同源文件）
STRICT_FILES = [
    "assets/js/i18n.js",
    "assets/js/micro.js",
    "assets/js/market.js",
    "data/snapshot.js",
    "data/lang/zh.js",
    "data/lang/ja.js",
    "data/lang/en.js",
    "data/lang/ko.js",
    "tools/fetch_data.py",
]

# 2) 已知差异（存量；仅报告，不判失败）—— 待 T05 收敛后移入 STRICT_FILES
KNOWN_DIFF_FILES = [
    "assets/js/game.js",   # 存储键差异（后续将改读 VERSION）
    "assets/js/ui.js",     # 主题色 + 台词文案差异
    "assets/js/chart.js",  # 主题抽象度差异（THEME/setTheme）
]

# 3) 各版独立、刻意不同（不参与比对）
PER_VERSION_FILES = [
    "index.html",
    "assets/js/version.js",
    "assets/js/character.js",
    "assets/js/main.js",
    "data/lang/override.zh.js",
    "data/lang/override.ja.js",
    "data/lang/override.en.js",
    "data/lang/override.ko.js",
]


def sha256_of(path):
    """返回文件 SHA-256（十六进制）；读取失败返回 None。"""
    try:
        with open(path, "rb") as fh:
            return hashlib.sha256(fh.read()).hexdigest()
    except OSError:
        return None


def line_count_of(path):
    """尽力返回行数（用于差异报告）；失败返回 -1。"""
    try:
        with open(path, "rb") as fh:
            return fh.read().count(b"\n")
    except OSError:
        return -1


def size_of(path):
    try:
        return os.path.getsize(path)
    except OSError:
        return -1


def first_differing_line(path_a, path_b):
    """定位首个不同行（1-based），返回 (line_no, a_text, b_text)；相同返回 None。"""
    try:
        with open(path_a, "rb") as fa, open(path_b, "rb") as fb:
            la = fa.read().split(b"\n")
            lb = fb.read().split(b"\n")
    except OSError:
        return None
    for i in range(max(len(la), len(lb))):
        a = la[i] if i < len(la) else None
        b = lb[i] if i < len(lb) else None
        if a != b:
            return (i + 1, a, b)
    return None


def safe_text(raw):
    if raw is None:
        return "<EOF>"
    try:
        return raw.decode("utf-8", "replace")[:120]
    except Exception:
        return repr(raw)[:120]


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    default_a = os.path.dirname(here)                                  # stock-sim
    default_b = os.path.join(os.path.dirname(default_a), "stock-sim-teiai")

    ap = argparse.ArgumentParser(description="两版共享文件逐字节一致性校验")
    ap.add_argument("--root-a", default=default_a, help="版本 A 根目录（默认韭留美版）")
    ap.add_argument("--root-b", default=default_b, help="版本 B 根目录（默认帝爱版）")
    args = ap.parse_args()

    root_a, root_b = os.path.abspath(args.root_a), os.path.abspath(args.root_b)

    print("=" * 72)
    print("两版共享文件一致性校验")
    print("  A = %s" % root_a)
    print("  B = %s" % root_b)
    print("=" * 72)

    for label, root in (("A", root_a), ("B", root_b)):
        if not os.path.isdir(root):
            print("[FATAL] 版本 %s 根目录不存在：%s" % (label, root))
            return 1

    failures = []

    # ---- 1) STRICT：必须逐字节一致 ----
    print("\n[STRICT] 必须逐字节一致的文件：")
    for rel in STRICT_FILES:
        pa = os.path.join(root_a, rel)
        pb = os.path.join(root_b, rel)
        ha, hb = sha256_of(pa), sha256_of(pb)
        if ha is None or hb is None:
            miss = []
            if ha is None:
                miss.append("A")
            if hb is None:
                miss.append("B")
            print("  [MISSING] %-28s 缺失于：%s" % (rel, ",".join(miss)))
            failures.append((rel, "MISSING"))
            continue
        if ha == hb:
            print("  [OK]      %-28s %s" % (rel, ha[:12]))
        else:
            print("  [DIFF]    %-28s A=%s B=%s" % (rel, ha[:12], hb[:12]))
            diff = first_differing_line(pa, pb)
            if diff:
                n, a, b = diff
                print("             首个差异行 L%d:" % n)
                print("               A: %s" % safe_text(a))
                print("               B: %s" % safe_text(b))
            failures.append((rel, "DIFF"))

    # ---- 2) KNOWN_DIFF：待收敛报告（不算失败）----
    print("\n[REPORT] 已知差异（存量·仅报告·本任务不判失败）：")
    for rel in KNOWN_DIFF_FILES:
        pa = os.path.join(root_a, rel)
        pb = os.path.join(root_b, rel)
        ha, hb = sha256_of(pa), sha256_of(pb)
        if ha is None or hb is None:
            print("  [MISSING] %-28s 缺失（A=%s B=%s）"
                  % (rel, ha is not None, hb is not None))
            continue
        if ha == hb:
            print("  [已收敛]  %-28s 两版已一致（可提升进 STRICT）" % rel)
        else:
            print("  [待收敛]  %-28s 行数 A=%d B=%d，字节 A=%d B=%d"
                  % (rel, line_count_of(pa), line_count_of(pb),
                     size_of(pa), size_of(pb)))

    # ---- 3) PER_VERSION：各版独立，提示即可 ----
    print("\n[INFO] 各版独立（刻意不同，不参与比对）：")
    print("        " + "、".join(PER_VERSION_FILES))

    # ---- 汇总 ----
    print("\n" + "=" * 72)
    if failures:
        print("结果：FAIL —— STRICT 集合存在 %d 处不一致：" % len(failures))
        for rel, kind in failures:
            print("  - [%s] %s" % (kind, rel))
        print("=" * 72)
        return 1

    print("结果：PASS —— STRICT 集合全部逐字节一致（%d 个文件）"
          % len(STRICT_FILES))
    known_drift = [r for r in KNOWN_DIFF_FILES
                   if sha256_of(os.path.join(root_a, r))
                   != sha256_of(os.path.join(root_b, r))]
    if known_drift:
        print("       待收敛（已知差异，不计失败）：" + "、".join(known_drift))
    print("=" * 72)
    return 0


if __name__ == "__main__":
    sys.exit(main())
