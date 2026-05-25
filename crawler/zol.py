"""中关村在线爬虫解析器 — 5个硬件品类"""
import requests
from bs4 import BeautifulSoup
import re
import time

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
}

CATEGORY_CONFIG = {
    'CPU': {'url': 'https://detail.zol.com.cn/cpu/', 'path': 'cpu'},
    'GPU': {'url': 'https://detail.zol.com.cn/vga/', 'path': 'vga'},
    'RAM': {'url': 'https://detail.zol.com.cn/memory/', 'path': 'memory'},
    'MB':  {'url': 'https://detail.zol.com.cn/motherboard/', 'path': 'motherboard'},
    'SSD': {'url': 'https://ssd.zol.com.cn/', 'path': 'solid_state_drive'},
}


def _request_with_retry(url, max_retries=3):
    for attempt in range(max_retries):
        try:
            return requests.get(url, headers=HEADERS, timeout=15)
        except Exception as e:
            if attempt < max_retries - 1:
                time.sleep(1)
            else:
                raise e


def search_zol(keyword, category, max_items=10):
    """搜索ZOL产品 [(name, price, url, img_url)]

    1. 先找匹配关键词的子分类链接
    2. 如果找到子分类，爬取子分类页
    3. 否则在主分类页按关键词过滤产品
    """
    cfg = CATEGORY_CONFIG.get(category)
    if not cfg:
        return []

    resp = _request_with_retry(cfg['url'])
    if resp is None or resp.status_code != 200 or len(resp.text) < 500:
        return []

    soup = BeautifulSoup(resp.text, 'lxml')

    # Step 1: 找匹配关键词的子分类
    sub_url = _find_subcategory(soup, cfg['path'], keyword)
    if sub_url:
        resp2 = _request_with_retry(sub_url)
        if resp2 and resp2.status_code == 200 and len(resp2.text) > 500:
            soup = BeautifulSoup(resp2.text, 'lxml')

    # Step 2: 解析并过滤产品
    return _parse_and_filter(soup, cfg['path'], keyword, max_items)


def _find_subcategory(soup, path, keyword):
    """在ZOL页面找匹配关键词的子分类链接"""
    kw = keyword.lower()
    links = soup.find_all('a', href=True)
    for link in links:
        href = link.get('href', '')
        text = link.text.strip()
        # 子分类链接: /vga/s10739/ (不含index，是数字子目录)
        if f'/{path}/s' in href and not '/index' in href and text:
            if kw in text.lower():
                if not href.startswith('http'):
                    href = 'https:' + href if href.startswith('//') else 'https://detail.zol.com.cn' + href
                return href
    return None


def _parse_and_filter(soup, path, keyword, max_items):
    """解析HTML并按关键词过滤"""
    # 提取价格
    all_prices = []
    for selector in ['.price-type', 'a[class*="price"]']:
        for b in soup.select(selector):
            try:
                m = re.search(r'(\d+)$', b.text.strip())
                if m:
                    all_prices.append(float(m.group(1)))
            except ValueError:
                pass
        if all_prices:
            break

    # 提取产品链接
    links = soup.find_all('a', href=True)
    product_links = []
    for link in links:
        href = link.get('href', '')
        text = link.text.strip()
        if f'/{path}/index' in href and '.shtml' in href and text and len(text) > 3:
            if not href.startswith('http'):
                href = 'https:' + href if href.startswith('//') else 'https://detail.zol.com.cn' + href
            if href not in [h for _, h in product_links]:
                product_links.append((text, href))

    # 按关键词过滤
    kw_lower = keyword.lower()
    kw_parts = [k.strip() for k in kw_lower.split() if k.strip()]

    seen = set()
    products = []
    for i, (name, href) in enumerate(product_links):
        name_lower = name.lower()
        if not all(kw in name_lower for kw in kw_parts):
            continue
        if name in seen or len(products) >= max_items:
            continue
        seen.add(name)
        price = all_prices[i] if i < len(all_prices) else 0.0
        if price > 0:
            products.append((name, price, href, ''))

    return products
