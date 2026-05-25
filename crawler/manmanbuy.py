"""慢慢买爬虫解析器 — GPU/SSD 搜索页解析"""
import requests
from bs4 import BeautifulSoup
import re
import json

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    'Referer': 'https://www.manmanbuy.com/',
}

SEARCH_URL = 'https://s.manmanbuy.com/pc/search/result'

def search_product(keyword, max_items=10):
    """在慢慢买搜索产品 [(name, price, url, img_url)]"""
    resp = requests.get(SEARCH_URL, params={'keyword': keyword}, headers=HEADERS, timeout=15)
    resp.encoding = 'utf-8'
    soup = BeautifulSoup(resp.text, 'lxml')

    products = []

    # 方法1: 从 img alt 属性提取产品名
    imgs = soup.find_all('img', alt=True)
    for img in imgs:
        alt = img.get('alt', '').strip()
        src = img.get('src', '') or img.get('data-src', '')
        if not alt or len(alt) < 5:
            continue
        parent_a = img.find_parent('a')
        url = parent_a.get('href', '') if parent_a else ''
        if url and not url.startswith('http'):
            url = 'https:' + url if url.startswith('//') else ''
        if src and not src.startswith('http'):
            src = 'https:' + src if src.startswith('//') else ''
        if len(products) < max_items:
            products.append((alt, 0.0, url, src))

    # 方法2: 从页面文本提取价格
    prices_text = re.findall(r'[¥￥](\d+\.?\d*)', resp.text)

    # 从 script 标签 JSON 中提取价格
    scripts = soup.find_all('script')
    for script in scripts:
        if not script.string:
            continue
        # 找 JSON 中的价格
        for match in re.finditer(r'"price"\s*:\s*(\d+\.?\d*)', script.string):
            idx = sum(1 for p in products if p[1] == 0.0)
            if idx < len(products):
                products[idx] = (products[idx][0], float(match.group(1)), products[idx][2], products[idx][3])

    # 补充未匹配的价格
    for i, (name, price, url, img) in enumerate(products):
        if price == 0.0 and i < len(prices_text):
            products[i] = (name, float(prices_text[i]), url, img)

    # 过滤
    valid = [(n, p, u, i) for n, p, u, i in products if p > 0]
    if not valid and prices_text:
        for i, (name, _, url, img) in enumerate(products[:len(prices_text)]):
            if float(prices_text[i]) > 0:
                valid.append((name, float(prices_text[i]), url, img))

    return valid[:max_items]


def get_price_history_from_page(product_url):
    """从产品详情页提取价格趋势"""
    resp = requests.get(product_url, headers=HEADERS, timeout=15)
    resp.encoding = 'utf-8'
    soup = BeautifulSoup(resp.text, 'lxml')

    price_data = []
    scripts = soup.find_all('script')
    for script in scripts:
        if not script.string:
            continue
        for key in ['priceList', 'priceHistory', 'chartData', 'trendList']:
            if key not in script.string:
                continue
            match = re.search(rf'{key}\s*[:=]\s*(\[.*?\])', script.string, re.DOTALL)
            if not match:
                continue
            try:
                raw = json.loads(match.group(1))
                for item in raw:
                    if isinstance(item, dict):
                        d = item.get('date') or item.get('time') or item.get('x', '')
                        p = item.get('price') or item.get('y', 0)
                        if d and p:
                            price_data.append((str(d), float(p)))
            except (json.JSONDecodeError, ValueError):
                pass

    return price_data
