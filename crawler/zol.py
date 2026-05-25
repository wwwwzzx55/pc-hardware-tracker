"""中关村在线爬虫解析器 — 搜索接口"""
import requests
from bs4 import BeautifulSoup
import re
import time

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Referer': 'https://detail.zol.com.cn/',
}

# ZOL子分类ID
SUBCATE_IDS = {
    'CPU': '28',
    'GPU': '6',
    'RAM': '3',
    'MB': '5',
    'SSD': '626',
}

SEARCH_URL = 'https://detail.zol.com.cn/index.php'

# Cookie需要定期更新（浏览器登录ZOL后获取）
COOKIE = {
    'ASP.NET_SessionId': '2cc10007c8f1e6cc68e92c4b105db4f2',
}


def _request_with_retry(url, params, max_retries=2):
    for attempt in range(max_retries):
        try:
            return requests.get(url, params=params, headers=HEADERS, cookies=COOKIE, timeout=15)
        except Exception:
            if attempt < max_retries - 1:
                time.sleep(1)
    return None


def search_zol(keyword, category, max_items=10):
    """搜索ZOL产品 [(name, price, url, img_url)]

    使用ZOL搜索接口 + subcateId 精准过滤品类
    """
    subcate_id = SUBCATE_IDS.get(category)
    if not subcate_id:
        return []

    resp = _request_with_retry(SEARCH_URL, {
        'c': 'SearchList',
        'subcateId': subcate_id,
        'keyword': keyword,
    })
    if resp is None or resp.status_code != 200 or len(resp.text) < 500:
        return []

    soup = BeautifulSoup(resp.text, 'lxml')

    # 提取价格: <b class="price-type">4799</b>
    all_prices = []
    for b in soup.select('.price-type'):
        try:
            m = re.search(r'(\d+)$', b.text.strip())
            if m:
                all_prices.append(float(m.group(1)))
        except ValueError:
            pass

    # 提取产品链接
    links = soup.find_all('a', href=True)
    product_links = []
    for link in links:
        href = link.get('href', '')
        text = link.text.strip()
        if '/index' in href and '.shtml' in href and text and len(text) > 3:
            if not href.startswith('http'):
                href = 'https:' + href if href.startswith('//') else 'https://detail.zol.com.cn' + href
            if href not in [h for _, h in product_links]:
                product_links.append((text, href))

    # 配对价格和产品
    seen = set()
    products = []
    for i, (name, href) in enumerate(product_links):
        if name in seen or len(products) >= max_items:
            continue
        seen.add(name)
        price = all_prices[i] if i < len(all_prices) else 0.0
        if price > 0:
            products.append((name, price, href, ''))

    return products
