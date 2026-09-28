# -*- coding: utf-8 -*-
"""
抓取真实 A 股历史行情，生成前端可直接 <script> 加载的紧凑数据快照。
数据源: 腾讯财经公开接口 (支持 CORS, 无需 key)
输出:   <项目根>/data/snapshot.js
"""
import json
import os
import ssl
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Referer": "https://gu.qq.com/",
}

DAYS = 520

# 代码 -> (名称, 板块/行业, 市场, 涨跌停幅度)
POOL = [
    # 指数
    ("sh000001", "上证指数", "大盘", "index", 0),
    ("sz399001", "深证成指", "大盘", "index", 0),
    ("sz399006", "创业板指", "大盘", "index", 0),
    ("sh000300", "沪深300", "大盘", "index", 0),
    ("sh000688", "科创50", "大盘", "index", 0),
    # 白酒消费
    ("sh600519", "贵州茅台", "白酒", "main", 10),
    ("sz000858", "五 粮 液", "白酒", "main", 10),
    ("sz000568", "泸州老窖", "白酒", "main", 10),
    ("sz002304", "洋河股份", "白酒", "main", 10),
    ("sh603288", "海天味业", "食品", "main", 10),
    ("sh600887", "伊利股份", "食品", "main", 10),
    ("sz002714", "牧原股份", "养殖", "main", 10),
    ("sh601888", "中国中免", "免税", "main", 10),
    # 金融
    ("sh601318", "中国平安", "保险", "main", 10),
    ("sh601601", "中国太保", "保险", "main", 10),
    ("sh600036", "招商银行", "银行", "main", 10),
    ("sz000001", "平安银行", "银行", "main", 10),
    ("sh601398", "工商银行", "银行", "main", 10),
    ("sh601288", "农业银行", "银行", "main", 10),
    ("sh601166", "兴业银行", "银行", "main", 10),
    ("sz002142", "宁波银行", "银行", "main", 10),
    ("sh600030", "中信证券", "券商", "main", 10),
    ("sz300059", "东方财富", "券商", "gem", 20),
    ("sh600570", "恒生电子", "金融IT", "main", 10),
    # 新能源 / 光伏
    ("sz300750", "宁德时代", "锂电", "gem", 20),
    ("sz002594", "比亚迪", "新能源车", "main", 10),
    ("sh601012", "隆基绿能", "光伏", "main", 10),
    ("sh600438", "通威股份", "光伏", "main", 10),
    ("sh688599", "天合光能", "光伏", "star", 20),
    ("sz300124", "汇川技术", "工控", "gem", 20),
    # 半导体 / 科技
    ("sh688981", "中芯国际", "半导体", "star", 20),
    ("sh603986", "兆易创新", "半导体", "main", 10),
    ("sz002049", "紫光国微", "半导体", "main", 10),
    ("sz002371", "北方华创", "半导体设备", "main", 10),
    ("sh600703", "三安光电", "半导体", "main", 10),
    ("sh688111", "金山办公", "软件", "star", 20),
    ("sz002415", "海康威视", "安防", "main", 10),
    ("sz002475", "立讯精密", "消费电子", "main", 10),
    ("sz000725", "京东方A", "面板", "main", 10),
    ("sz300308", "中际旭创", "光模块", "gem", 20),
    ("sz002230", "科大讯飞", "人工智能", "main", 10),
    ("sz000063", "中兴通讯", "通信", "main", 10),
    # 医药
    ("sh600276", "恒瑞医药", "医药", "main", 10),
    ("sz300760", "迈瑞医疗", "医疗器械", "gem", 20),
    ("sh603259", "药明康德", "医药外包", "main", 10),
    ("sz300015", "爱尔眼科", "医疗", "gem", 20),
    ("sh600196", "复星医药", "医药", "main", 10),
    # 资源能源
    ("sh601899", "紫金矿业", "有色", "main", 10),
    ("sh600028", "中国石化", "石化", "main", 10),
    ("sh601857", "中国石油", "石化", "main", 10),
    ("sh600309", "万华化学", "化工", "main", 10),
    ("sh600900", "长江电力", "电力", "main", 10),
    ("sh601985", "中国核电", "电力", "main", 10),
    ("sh600011", "华能国际", "电力", "main", 10),
    ("sh600585", "海螺水泥", "建材", "main", 10),
    # 制造 / 地产 / 其他
    ("sh601668", "中国建筑", "建筑", "main", 10),
    ("sz000002", "万 科 A", "地产", "main", 10),
    ("sh600048", "保利发展", "地产", "main", 10),
    ("sz000333", "美的集团", "家电", "main", 10),
    ("sz000651", "格力电器", "家电", "main", 10),
    ("sh600690", "海尔智家", "家电", "main", 10),
    ("sh600104", "上汽集团", "汽车", "main", 10),
    ("sz000157", "中联重科", "机械", "main", 10),
    ("sh601728", "中国电信", "通信运营", "main", 10),
    ("sh600009", "上海机场", "交运", "main", 10),
    ("sh601006", "大秦铁路", "交运", "main", 10),
    ("sz002027", "分众传媒", "传媒", "main", 10),
    ("sz300413", "芒果超媒", "传媒", "gem", 20),
    ("sh600745", "闻泰科技", "半导体", "main", 10),
    ("sh600570", "恒生电子", "金融IT", "main", 10),
]

# 去重保持顺序
_seen = set()
POOL = [x for x in POOL if not (x[0] in _seen or _seen.add(x[0]))]


def fetch(code, retry=3):
    url = ("https://web.ifzq.gtimg.cn/appstock/app/fqkline/get"
           f"?param={code},day,,,{DAYS},")
    for i in range(retry):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=25, context=SSL_CTX) as r:
                raw = json.loads(r.read().decode("utf-8", "ignore"))
            node = raw.get("data", {}).get(code)
            if not node:
                raise ValueError("empty node")
            rows = node.get("day") or node.get("qfqday")
            if not rows:
                raise ValueError("no rows")
            return code, rows
        except Exception as e:
            if i == retry - 1:
                print(f"  [FAIL] {code}: {e}", flush=True)
                return code, None
            time.sleep(1.2 * (i + 1))


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out_path = os.path.join(root, "data", "snapshot.js")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    base = [p[0] for p in POOL]
    print(f"抓取 {len(base)} 个标的, 每标的最多 {DAYS} 个交易日 ...", flush=True)

    result = {}
    with ThreadPoolExecutor(max_workers=10) as ex:
        futs = {ex.submit(fetch, c): c for c in base}
        done = 0
        for f in as_completed(futs):
            c, rows = f.result()
            if rows:
                result[c] = rows
            done += 1
            if done % 10 == 0 or done == len(base):
                print(f"  进度 {done}/{len(base)}", flush=True)

    ok = [c for c in base if c in result]
    print(f"成功 {len(ok)}/{len(base)}", flush=True)

    # 交易日基准 = 上证指数交易日
    all_dates = []
    for row in result.get("sh000001", []):
        all_dates.append(row[0])
    for c in ok:
        for row in result[c]:
            if row[0] not in all_dates:
                all_dates.append(row[0])
    all_dates = sorted(set(all_dates))
    all_dates = all_dates[-DAYS:]
    dmap = {d: i for i, d in enumerate(all_dates)}
    print(f"交易日区间: {all_dates[0]} ~ {all_dates[-1]}  共 {len(all_dates)} 天", flush=True)

    series = {}
    for c in ok:
        arr = [0] * (len(all_dates) * 5)
        rows = {r[0]: r for r in result[c]}
        last = None
        last_close = None
        filled = 0
        for i, d in enumerate(all_dates):
            r = rows.get(d)
            if r:
                o, cl, h, l, v = (float(r[1]), float(r[2]), float(r[3]),
                                  float(r[4]), float(r[5]))
                last = (o, h, l, cl, v)
                last_close = cl
                filled += 1
            elif last is not None:
                # 停牌: 沿用上一收盘价平盘
                o = h = l = cl = last_close
                v = 0.0
            else:
                continue
            b = i * 5
            arr[b] = int(round(o * 100))
            arr[b + 1] = int(round(h * 100))
            arr[b + 2] = int(round(l * 100))
            arr[b + 3] = int(round(cl * 100))
            arr[b + 4] = int(round(v))
        series[c] = arr
        print(f"  {c}: 原始 {filled} 天 -> 对齐 {len(all_dates)} 天", flush=True)

    meta = [[p[0], p[1], p[2], p[3], p[4]] for p in POOL if p[0] in result]

    payload = {"m": meta, "d": all_dates, "s": series}
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    with open(out_path, "w", encoding="utf-8") as f:
        f.write("/* 自动生成 - 真实历史行情快照, 请勿手工修改 */\n")
        f.write(f"/* 生成时间: {time.strftime('%Y-%m-%d %H:%M:%S')} */\n")
        f.write("window.SNAPSHOT=")
        f.write(body)
        f.write(";\n")

    size = os.path.getsize(out_path)
    print(f"\n[OK] 输出 {out_path}")
    print(f"     体积 {size/1024/1024:.2f} MB, 标的 {len(meta)} 个")


if __name__ == "__main__":
    main()
