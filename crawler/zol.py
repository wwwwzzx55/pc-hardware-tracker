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

SUBCATE_IDS = {'CPU': '28', 'GPU': '6', 'RAM': '3', 'MB': '5', 'SSD': '626'}

SEARCH_URL = 'https://detail.zol.com.cn/index.php'

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
    """搜索ZOL产品 [(name, price, url, img_url)]"""
    subcate_id = SUBCATE_IDS.get(category)
    if not subcate_id:
        return []

    products = []
    page = 1
    while len(products) < max_items:
        resp = _request_with_retry(SEARCH_URL, {
            'c': 'SearchList',
            'subcateId': subcate_id,
            'keyword': keyword,
            'page': page,
        })
        if resp is None or resp.status_code != 200 or len(resp.text) < 500:
            break

        soup = BeautifulSoup(resp.text, 'lxml')
        page_products = _parse_search_results(soup)
        if not page_products:
            break

        products.extend(page_products)
        page += 1

        # 限制最多翻8页 (每页约4条)
        if page > 8:
            break

    return products[:max_items]


def _parse_search_results(soup):
    """解析搜索结果页：<ul class='series_list'> > <li> 价格在 li 文本中"""
    products = []
    uls = soup.find_all('ul', class_='series_list')
    for ul in uls:
        for li in ul.find_all('li'):
            link = li.find('a', href=re.compile(r'/index\d+\.shtml'))
            if not link:
                continue
            name = link.text.strip()
            if not name:
                continue
            href = link.get('href', '')
            if not href.startswith('http'):
                href = 'https:' + href if href.startswith('//') else 'https://detail.zol.com.cn' + href

            # 价格在li文本中: ¥1799
            m = re.search(r'[¥￥](\d+)', li.text.strip())
            price = float(m.group(1)) if m else 0.0

            if price > 0 and name not in [p[0] for p in products]:
                products.append((name, price, href, ''))
    return products
