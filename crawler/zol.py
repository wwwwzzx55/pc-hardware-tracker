"""中关村在线爬虫解析器 — 5个硬件品类"""
import requests
from bs4 import BeautifulSoup
import re

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


def search_zol(category, max_items=10):
    """从ZOL抓取产品列表 [(name, price, url, img_url)]

    CPU/GPU/RAM/MB: detail.zol.com.cn 服务端HTML
    SSD: ssd.zol.com.cn 服务端HTML (路径是 solid_state_drive)
    """
    cfg = CATEGORY_CONFIG.get(category)
    if not cfg:
        return []

    resp = requests.get(cfg['url'], headers=HEADERS, timeout=15)

    # 检查是否有实际内容
    if resp.status_code != 200 or len(resp.text) < 500:
        return []

    soup = BeautifulSoup(resp.text, 'lxml')
    return _parse_list_page(soup, cfg['path'], max_items)


def _parse_list_page(soup, path, max_items):
    """解析ZOL列表页HTML"""
    products = []

    # 提取价格
    all_prices = []
    for selector in ['.price-type', 'a[class*="price"]']:
        for b in soup.select(selector):
            try:
                # 只取文本末尾的数字（价格）
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
        # 匹配产品详情页: /path/index1234567.shtml
        if f'/{path}/index' in href and '.shtml' in href and text and len(text) > 3:
            if not href.startswith('http'):
                href = 'https:' + href if href.startswith('//') else 'https://detail.zol.com.cn' + href
            if href not in [h for _, h in product_links]:
                product_links.append((text, href))

    # 配对
    seen_names = set()
    for i, (name, href) in enumerate(product_links):
        if name in seen_names or len(products) >= max_items:
            continue
        seen_names.add(name)
        price = all_prices[i] if i < len(all_prices) else 0.0
        if price > 0:
            products.append((name, price, href, ''))

    return products
