# -*- coding: utf-8 -*-
"""
抓取真实 A 股历史行情，生成前端可直接 <script> 加载的紧凑数据快照。
数据源: 腾讯财经公开接口 (支持 CORS, 无需 key)
输出:   <项目根>/data/snapshot.js
"""
import json
import os
import random
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
    # 港股 (腾讯真实历史日线)
    ("hk00700", "腾讯控股", "科技", "hk", 0),
    ("hk09988", "阿里巴巴", "电商", "hk", 0),
    ("hk03690", "美团", "本地生活", "hk", 0),
    ("hk01810", "小米集团", "科技", "hk", 0),
    ("hk09618", "京东", "电商", "hk", 0),
    ("hk00939", "建设银行", "银行", "hk", 0),
    ("hk00388", "香港交易所", "金融", "hk", 0),
    ("hk01299", "友邦保险", "保险", "hk", 0),
    ("hk09999", "网易", "科技", "hk", 0),
    ("hk09961", "携程", "旅游", "hk", 0),
    ("hk02015", "理想汽车", "新能源车", "hk", 0),
    ("hk09868", "小鹏汽车", "新能源车", "hk", 0),
    ("hk02020", "安踏体育", "运动", "hk", 0),
    ("hk01698", "腾讯音乐", "文娱", "hk", 0),
    ("hk01024", "快手", "短视频", "hk", 0),
    ("hk09888", "百度", "科技", "hk", 0),
    ("hk06618", "京东健康", "医疗", "hk", 0),
    ("hk09633", "农夫山泉", "饮料", "hk", 0),
    # ===== 基金 / 理财 / 固收 / REITs (场内 ETF / LOF / 债券 / REIT) =====
    # 宽基指数
    ("sh510300", "沪深300ETF", "指数", "fd", 10),
    ("sz159915", "创业板ETF", "指数", "fd", 10),
    ("sh510500", "中证500ETF", "指数", "fd", 10),
    ("sh510880", "红利ETF", "红利", "fd", 10),
    ("sz159905", "中证红利ETF", "红利", "fd", 10),
    ("sh518880", "黄金ETF", "商品", "fd", 10),
    ("sh511880", "银华日利", "货币ETF", "fd", 10),
    ("sz161725", "招商白酒", "白酒LOF", "fd", 10),
    ("sz163406", "兴全合润", "混合LOF", "fd", 10),
    ("sz161005", "富国天惠", "成长LOF", "fd", 10),
    # 固收 / 债券
    ("sh511010", "国债ETF", "国债", "fd", 10),
    ("sh511260", "十年国债ETF", "国债", "fd", 10),
    ("sh511360", "短融ETF", "短债", "fd", 10),
    ("sh511220", "城投债ETF", "信用债", "fd", 10),
    ("sh511380", "可转债ETF", "可转债", "fd", 10),
    # 行业 / 主题 ETF
    ("sh512800", "银行ETF", "银行", "fd", 10),
    ("sh512880", "证券ETF", "券商", "fd", 10),
    ("sh512660", "军工ETF", "军工", "fd", 10),
    ("sh512010", "医药ETF", "医药", "fd", 10),
    ("sh159928", "消费ETF", "消费", "fd", 10),
    ("sh512480", "半导体ETF", "半导体", "fd", 10),
    ("sz159995", "芯片ETF", "半导体", "fd", 10),
    ("sh515050", "5G通信ETF", "通信", "fd", 10),
    ("sh515030", "新能源车ETF", "新能源车", "fd", 10),
    ("sh515790", "光伏ETF", "光伏", "fd", 10),
    ("sh515220", "煤炭ETF", "煤炭", "fd", 10),
    ("sh512400", "有色金属ETF", "有色", "fd", 10),
    ("sh515210", "钢铁ETF", "钢铁", "fd", 10),
    ("sh159996", "家电ETF", "家电", "fd", 10),
    ("sh512690", "白酒ETF", "白酒", "fd", 10),
    ("sh515980", "人工智能ETF", "AI", "fd", 10),
    ("sz159770", "机器人ETF", "机器人", "fd", 10),
    ("sh512980", "传媒ETF", "传媒", "fd", 10),
    ("sz159865", "养殖ETF", "养殖", "fd", 10),
    ("sh512200", "房地产ETF", "地产", "fd", 10),
    ("sh159611", "电力ETF", "电力", "fd", 10),
    ("sh516780", "稀土ETF", "稀土", "fd", 10),
    ("sh516950", "基建ETF", "基建", "fd", 10),
    ("sz159792", "港股通互联网ETF", "港股通", "fd", 10),
    ("sh513050", "中概互联网ETF", "中概", "fd", 10),
    ("sh513100", "纳指ETF", "美股QDII", "fd", 10),
    ("sh513500", "标普500ETF", "美股QDII", "fd", 10),
    # 公募 REITs
    ("sh508056", "中金普洛斯REIT", "仓储物流", "fd", 10),
    ("sz180301", "红土盐田港REIT", "港口", "fd", 10),
    ("sh508018", "华夏交建REIT", "高速公路", "fd", 10),
    ("sh508027", "东吴苏园REIT", "产业园", "fd", 10),
    ("sh508000", "华安张江REIT", "产业园", "fd", 10),
    ("sh508006", "富国首创水务REIT", "环保", "fd", 10),
    ("sz180801", "中航首钢绿能REIT", "新能源", "fd", 10),
]

# 去重保持顺序
_seen = set()
POOL = [x for x in POOL if not (x[0] in _seen or _seen.add(x[0]))]


# 美股 / 外汇 合成历史序列配置 (腾讯对美股日线支持不全, 外汇无历史K线,
# 故用「锚定真实区间」的确定性随机游走生成, 仅作模拟历史; 实时价格以真实报价为准)
def _seed(s):
    h = 2166136261
    for ch in s.encode("utf-8"):
        h ^= ch
        h = (h * 16777619) & 0xFFFFFFFF
    return h


def gen_synth(code, base, vol, drift, dates, scale):
    """生成确定性 OHLCV 序列; scale=100(股价) 或 10000(汇率)."""
    arr = [0] * (len(dates) * 5)
    rnd = random.Random(_seed(code))
    rate = base
    prev = base
    for i, d in enumerate(dates):
        shock = rnd.gauss(0, vol)
        rate = max(1e-6, rate * (1 + drift + shock))
        o = prev
        c = rate
        hi = max(o, c) * (1 + abs(rnd.gauss(0, vol * 0.6)))
        lo = min(o, c) * (1 - abs(rnd.gauss(0, vol * 0.6)))
        v = 1.0 + abs(rnd.gauss(0, 1.0))
        b = i * 5
        arr[b] = int(round(o * scale))
        arr[b + 1] = int(round(hi * scale))
        arr[b + 2] = int(round(lo * scale))
        arr[b + 3] = int(round(c * scale))
        arr[b + 4] = int(round(v * 1000))
        prev = c
    return arr


SYN_US = [
    ("usAAPL", "苹果", "科技", 341.0, 0.022, 0.0004),
    ("usMSFT", "微软", "科技", 430.0, 0.018, 0.0004),
    ("usNVDA", "英伟达", "半导体", 125.0, 0.035, 0.0006),
    ("usTSLA", "特斯拉", "新能源车", 250.0, 0.035, 0.0),
    ("usAMZN", "亚马逊", "电商", 185.0, 0.022, 0.0003),
    ("usGOOG", "谷歌", "科技", 175.0, 0.020, 0.0003),
    ("usMETA", "Meta", "社交", 560.0, 0.025, 0.0004),
    ("usAMD", "AMD", "半导体", 150.0, 0.035, 0.0003),
    ("usBRK", "伯克希尔", "综合", 410.0, 0.014, 0.0002),
    ("usPDD", "拼多多", "电商", 105.0, 0.040, 0.0005),
    ("usTSM", "台积电", "半导体", 95.0, 0.026, 0.0004),
    ("usINTC", "英特尔", "半导体", 22.0, 0.038, -0.0002),
    ("usQCOM", "高通", "半导体", 150.0, 0.028, 0.0003),
    ("usKO", "可口可乐", "消费", 62.0, 0.013, 0.0001),
    ("usJNJ", "强生", "医药", 150.0, 0.015, 0.0001),
    ("usDIS", "迪士尼", "文娱", 95.0, 0.024, 0.0002),
]

FX_PAIRS = [
    ("fxUSDCNY", "美元/人民币", "外汇", 7.18, 0.0022, 0.00003),
    ("fxEURUSD", "欧元/美元", "外汇", 1.0850, 0.0038, 0.00001),
    ("fxGBPUSD", "英镑/美元", "外汇", 1.2700, 0.0043, 0.0),
    ("fxUSDJPY", "美元/日元", "外汇", 151.50, 0.0036, 0.0),
    ("fxAUDUSD", "澳元/美元", "外汇", 0.6600, 0.0048, 0.0),
    ("fxUSDHKD", "美元/港元", "外汇", 7.8100, 0.0008, 0.0),
]


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

    # ---- 美股 / 外汇 合成历史序列 (锚定真实区间的确定性随机游走) ----
    added = 0
    for code, name, ind, base, vol, drift in SYN_US:
        series[code] = gen_synth(code, base, vol, drift, all_dates, 100)
        meta.append([code, name, ind, "us", 0])
        added += 1
    for code, name, ind, base, vol, drift in FX_PAIRS:
        series[code] = gen_synth(code, base, vol, drift, all_dates, 10000)
        meta.append([code, name, ind, "fx", 0])
        added += 1
    print(f"合成序列(美股+外汇): {added} 个")

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
