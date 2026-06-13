"""Scrapy 项目设置 — ZOL 硬件价格爬虫"""

BOT_NAME = 'zol_scraper'
SPIDER_MODULES = ['zol_scraper.spiders']
NEWSPIDER_MODULE = 'zol_scraper.spiders'

# 礼貌爬取
DOWNLOAD_DELAY = 0.5
RANDOMIZE_DOWNLOAD_DELAY = True
CONCURRENT_REQUESTS = 4
CONCURRENT_REQUESTS_PER_DOMAIN = 2

# 伪装浏览器
USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
DEFAULT_REQUEST_HEADERS = {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Referer': 'https://detail.zol.com.cn/',
}

# ZOL 反爬：需要启用 Cookie
COOKIES_ENABLED = True
COOKIES = {
    'ASP.NET_SessionId': '2cc10007c8f1e6cc68e92c4b105db4f2',
}

# Pipeline
ITEM_PIPELINES = {
    'zol_scraper.pipelines.ProductPipeline': 300,
}

# 超时与重试
DOWNLOAD_TIMEOUT = 15
RETRY_ENABLED = True
RETRY_TIMES = 2

# TLS
DOWNLOADER_CLIENT_TLS_METHOD = 'TLSv1.2'

# 日志
LOG_LEVEL = 'WARNING'
