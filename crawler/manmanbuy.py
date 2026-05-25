"""慢慢买网站爬虫解析器"""
import requests
from bs4 import BeautifulSoup
import re
import json

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://www.manmanbuy.com/',
}

def search_product(keyword):
    """根据关键词搜索产品，返回产品列表 [(name, price, url, image_url)]"""
    search_url = f'https://search.manmanbuy.com/search.aspx?key={keyword}&PageIndex=1'
    resp = requests.get(search_url, headers=HEADERS, timeout=15)
    resp.encoding = 'utf-8'
    soup = BeautifulSoup(resp.text, 'lxml')

    products = []
    items = soup.select('.searchresult .item') or soup.select('.product-item') or soup.select('li[data-pid]')

    for item in items[:10]:
        name_el = item.select_one('.title a') or item.select_one('.p-name a') or item.select_one('a[title]')
        price_el = item.select_one('.price') or item.select_one('.p-price') or item.select_one('em')
        img_el = item.select_one('img')

        name = name_el.get('title', '') or name_el.text.strip() if name_el else keyword
        url = name_el.get('href', '') if name_el else ''
        if url and not url.startswith('http'):
            url = 'https:' + url if url.startswith('//') else 'https://www.manmanbuy.com/' + url

        price_text = price_el.text.strip() if price_el else '0'
        price_match = re.search(r'[\d.]+', price_text)
        price = float(price_match.group()) if price_match else 0.0

        img_url = img_el.get('src', '') or img_el.get('data-src', '') if img_el else ''
        if img_url and not img_url.startswith('http'):
            img_url = 'https:' + img_url if img_url.startswith('//') else ''

        if name and price > 0:
            products.append((name, price, url, img_url))

    return products

def get_price_history_from_page(product_url):
    """从产品详情页提取价格趋势数据"""
    resp = requests.get(product_url, headers=HEADERS, timeout=15)
    resp.encoding = 'utf-8'
    soup = BeautifulSoup(resp.text, 'lxml')

    price_data = []

    scripts = soup.find_all('script')
    for script in scripts:
        if script.string and ('priceList' in script.string or 'priceHistory' in script.string or 'chartData' in script.string):
            json_match = re.search(r'(?:priceList|priceHistory|chartData)\s*[:=]\s*(\[.*?\])', script.string, re.DOTALL)
            if json_match:
                try:
                    raw_data = json.loads(json_match.group(1))
                    for item in raw_data:
                        if isinstance(item, dict):
                            date_str = item.get('date') or item.get('time') or item.get('x')
                            price_val = item.get('price') or item.get('y')
                            if date_str and price_val:
                                price_data.append((str(date_str), float(price_val)))
                except (json.JSONDecodeError, ValueError):
                    pass

    return price_data
