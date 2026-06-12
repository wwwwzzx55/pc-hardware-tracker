"""太平洋电脑网爬虫解析器 — m.pconline.com.cn 搜索接口

搜索URL: https://m.pconline.com.cn/p2/sid{category_id}.html?keyword={keyword}
产品列表结构: <li> 内嵌 <i class="iInfo">(名称) <i class="iPrice">(价格)

注意: 太平洋电脑网使用 GBK 编码，且 HTML 嵌套不规范，用 regex 解析更可靠
"""

import time
import re
import requests

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
}

# 品类对应太平洋电脑网 sid
SUBCATE_IDS = {
    'CPU': '20815',
    'GPU': '20817',
    'RAM': '20821',
    'MB': '20820',
    'SSD': '20846',
}

SEARCH_URL = 'https://m.pconline.com.cn/p2/sid{}.html'


def _request_with_retry(url, params, max_retries=2):
    """带重试的 HTTP 请求，返回 GBK 解码后的文本"""
    for attempt in range(max_retries):
        try:
            resp = requests.get(url, params=params, headers=HEADERS, timeout=15)
            if resp.status_code == 200:
                return resp.content.decode('gbk', errors='replace')
        except Exception:
            if attempt < max_retries - 1:
                time.sleep(1)
    return None


def search_pconline(keyword, category, max_items=10):
    """搜索太平洋电脑网产品 [(name, price, url, img_url)]"""
    subcate_id = SUBCATE_IDS.get(category)
    if not subcate_id:
        return []

    products = []
    seen = set()
    page = 1
    while len(products) < max_items:
        url = SEARCH_URL.format(subcate_id)
        html = _request_with_retry(url, {'keyword': keyword, 'pageNo': page})
        if html is None or len(html) < 500:
            break

        page_products = _parse_product_list(html)
        if not page_products:
            break

        for p in page_products:
            key = p[0]  # name as dedup key
            if key not in seen:
                seen.add(key)
                products.append(p)

        page += 1
        if page > 5:
            break

    return products[:max_items]


def _parse_product_list(html):
    """用 regex 解析产品列表（避免 lxml 对 GBK 嵌套标签解析异常）

    每个产品在 <li> 块中：
    - 名称: <strong><a href="/p/pidXXXX.html">产品名</a></strong>
    - 价格: <i class="iPrice">...<a href="...">￥3949</a></p>
    - 图片: <i class="iPic"><img src="..."/>
    """
    products = []

    # 找所有 <li> 块（包含 iInfo 的才是产品）
    li_blocks = re.findall(r'<li>.*?</li>', html, re.DOTALL)

    for block in li_blocks:
        if 'iInfo' not in block or 'iPrice' not in block:
            continue

        # 产品名称和链接
        name_m = re.search(r'<strong><a[^>]*href="([^"]*)"[^>]*>([^<]+)</a>', block)
        if not name_m:
            continue

        href = name_m.group(1)
        name = name_m.group(2).strip()
        if not name:
            continue

        if not href.startswith('http'):
            href = 'https://m.pconline.com.cn' + href

        # 价格：iPrice 区域内第一个数字串
        price = 0.0
        price_block_m = re.search(r'<i[^>]*class="iPrice"[^>]*>(.*?)</i>', block, re.DOTALL)
        if price_block_m:
            price_block = price_block_m.group(1)
            price_m = re.search(r'(?:¥|￥)\s*([\d,]+)', price_block)
            if not price_m:
                # 降级：直接找第一个4位以上数字
                price_m = re.search(r'>\s*([\d,]{4,})\s*<', price_block)
            if price_m:
                price = float(price_m.group(1).replace(',', ''))

        # 图片
        img_url = ''
        img_m = re.search(r'<i[^>]*class="iPic"[^>]*>.*?<img[^>]*src="([^"]*)"', block, re.DOTALL)
        if not img_m:
            img_m = re.search(r'<img[^>]*middleImg="([^"]*)"', block)
        if img_m:
            img_src = img_m.group(1)
            if img_src.startswith('//'):
                img_url = 'https:' + img_src
            elif img_src.startswith('/'):
                img_url = 'https://m.pconline.com.cn' + img_src
            else:
                img_url = img_src

        if name and price > 0:
            products.append((name, price, href, img_url))

    return products
