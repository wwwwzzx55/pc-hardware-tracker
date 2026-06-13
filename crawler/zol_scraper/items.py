"""Scrapy Item 定义 — 硬件产品"""

import scrapy


class ProductItem(scrapy.Item):
    name = scrapy.Field()
    category = scrapy.Field()
    price = scrapy.Field()
    url = scrapy.Field()
    img_url = scrapy.Field()
