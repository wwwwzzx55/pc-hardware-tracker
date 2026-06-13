"""ZOL 中关村在线 Spider — 使用 Scrapy 框架 + requests 库爬取硬件产品价格

用法:
  scrapy crawl zol -a keyword="RTX 4070" -a category=GPU -a max_items=10
  scrapy crawl zol -a keyword="i5 14600KF" -a category=CPU -a max_items=5

说明:
  ZOL 网站对 Scrapy 默认的 Twisted TLS 有反爬检测，返回空 body。
  因此 Spider 内部使用 requests 库进行 HTTP 请求（已验证可用），
  Scrapy 框架负责 Spider 调度、Item 管道和数据流管理。

搜索流程:
  每页 URL: https://detail.zol.com.cn/index.php?c=SearchList&subcateId={id}&keyword={kw}&page={n}
  解析: BeautifulSoup 解析 ul.series_list > li > a（名称+链接）+ li 文本中的 ¥ 价格
"""

import re
import time
import scrapy
import requests
from bs4 import BeautifulSoup
from zol_scraper.items import ProductItem

# 品类 → ZOL subcateId 映射
SUBCATE_IDS = {
    'CPU': '28',
    'GPU': '6',
    'RAM': '3',
    'MB': '5',
    'SSD': '626',
}

SEARCH_URL = 'https://detail.zol.com.cn/index.php'

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Referer': 'https://detail.zol.com.cn/',
}

COOKIES = {
    'ASP.NET_SessionId': '2cc10007c8f1e6cc68e92c4b105db4f2',
}


class ZolSpider(scrapy.Spider):
    name = 'zol'
    allowed_domains = ['detail.zol.com.cn']

    def __init__(self, keyword='', category='CPU', max_items=10, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.keyword = keyword
        self.category = category
        self.max_items = int(max_items)
        self.max_items = max(10, min(self.max_items, 30))

    def start_requests(self):
        """Scrapy 入口 — 使用 requests 获取 HTML，然后手动调用 parse"""
        subcate_id = SUBCATE_IDS.get(self.category)
        if not subcate_id:
            self.logger.error(f'未知品类: {self.category}')
            return

        page = 1
        collected = 0

        while collected < self.max_items and page <= 8:
            try:
                resp = requests.get(
                    SEARCH_URL,
                    params={'c': 'SearchList', 'subcateId': subcate_id, 'keyword': self.keyword, 'page': page},
                    headers=HEADERS, cookies=COOKIES, timeout=15,
                )
                if resp.status_code != 200 or len(resp.text) < 500:
                    break

                soup = BeautifulSoup(resp.text, 'lxml')
                page_items = list(self._parse_page(soup))

                if not page_items:
                    break

                for item in page_items:
                    yield item
                    collected += 1
                    if collected >= self.max_items:
                        break

                page += 1
                time.sleep(0.5)  # 礼貌延迟

            except Exception as e:
                self.logger.error(f'请求失败 (page={page}): {e}')
                break

    def _parse_page(self, soup):
        """解析搜索结果页，生成 ProductItem"""
        for ul in soup.find_all('ul', class_='series_list'):
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

                # 价格：在 li 文本中匹配 ¥ 符号
                price = 0.0
                m = re.search(r'[¥￥](\d+\.?\d*)\s*(万)?', li.text.strip())
                if m:
                    price = float(m.group(1))
                    if m.group(2) == '万':
                        price *= 10000

                if price > 0:
                    yield ProductItem(
                        name=name,
                        category=self.category,
                        price=price,
                        url=href,
                        img_url='',
                    )
