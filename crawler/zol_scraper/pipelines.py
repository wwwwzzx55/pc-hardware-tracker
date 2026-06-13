"""Scrapy Pipeline — 产品写入 MySQL（复用 db.py）"""

import sys
import os

# 确保 crawler 目录在 path 中，以便 import db
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from db import upsert_product, insert_price


class ProductPipeline:
    """将 Spider 产出的 ProductItem 写入数据库"""

    def __init__(self):
        self.seen = set()
        self.count = 0
        self.max_items = 30

    @classmethod
    def from_crawler(cls, crawler):
        pipeline = cls()
        pipeline.max_items = getattr(crawler.spider, 'max_items', 30)
        return pipeline

    def process_item(self, item, spider):
        # 去重
        name = item.get('name', '')
        if name in self.seen:
            return item
        self.seen.add(name)

        # 数量限制
        if self.count >= self.max_items:
            return item

        try:
            product_id = upsert_product(
                name=item.get('name', ''),
                category=item.get('category', 'CPU'),
                spec='',
                url=item.get('url', ''),
                image_url=item.get('img_url', ''),
            )
            insert_price(product_id, item.get('price', 0), source='zol')
            self.count += 1
        except Exception as e:
            spider.logger.error(f'写入数据库失败: {e}')

        return item
