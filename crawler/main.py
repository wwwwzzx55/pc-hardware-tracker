"""爬虫命令行入口 — 基于 Scrapy 框架，被 NestJS spawn 调用

用法:
  python main.py <keyword> <category> [count] [--preview]

数据源: 中关村在线 (detail.zol.com.cn) — 使用 Scrapy Spider

输出: JSON 到 stdout，NestJS 读取解析
"""
import sys
import json
import os

CATEGORY_MAP = {
    'CPU': 'CPU', 'cpu': 'CPU',
    'GPU': 'GPU', 'gpu': 'GPU', '显卡': 'GPU',
    'RAM': 'RAM', 'ram': 'RAM', '内存': 'RAM',
    'MB': 'MB', 'mb': 'MB', '主板': 'MB',
    'SSD': 'SSD', 'ssd': 'SSD', '硬盘': 'SSD',
}

# 模块级变量，供 Pipeline 收集结果
_collected_results = []
_preview_mode = False


class PreviewPipeline:
    """预览模式：只收集 Item 到列表，不写入数据库"""
    def __init__(self):
        self.seen = set()
        self.count = 0

    def process_item(self, item, spider):
        name = item.get('name', '')
        if name in self.seen:
            return item
        self.seen.add(name)
        max_items = getattr(spider, 'max_items', 30)
        if self.count >= max_items:
            return item
        self.count += 1
        _collected_results.append({
            'name': item.get('name', ''),
            'price': item.get('price', 0),
            'url': item.get('url', ''),
            'img_url': item.get('img_url', ''),
        })
        return item


def run_spider(keyword, category, max_items, preview=False):
    """直接调用 Spider + Pipeline，绕过 Scrapy CrawlerProcess

    Python 3.14 + Scrapy 2.16 + Windows 下 CrawlerProcess/CrawlerRunner
    的 asyncio reactor 存在阻塞/停止问题。由于 ZolSpider 内部使用
    requests 库直接发 HTTP 请求（绕过 Scrapy 引擎），这里也不再依赖
    Scrapy 的进程管理，手动驱动 Spider → Pipeline 数据流。
    """
    from zol_scraper.spiders.zol import ZolSpider

    global _collected_results
    _collected_results = []

    spider = ZolSpider(keyword=keyword, category=category, max_items=max_items)

    if preview:
        pipeline = PreviewPipeline()
    else:
        from zol_scraper.pipelines import ProductPipeline
        pipeline = ProductPipeline()
        pipeline.max_items = max_items

    for item in spider.start_requests():
        pipeline.process_item(item, spider)

    return _collected_results


def main():
    if len(sys.argv) < 3:
        print(json.dumps({
            'success': False,
            'error': 'Usage: python main.py <keyword> <category> [count] [--preview]',
        }))
        sys.exit(1)

    keyword = sys.argv[1]
    category_raw = sys.argv[2]
    category = CATEGORY_MAP.get(category_raw, 'CPU')
    max_items = int(sys.argv[3]) if len(sys.argv) > 3 and sys.argv[3].lstrip('-').isdigit() else 10
    max_items = max(10, min(max_items, 30))
    preview = '--preview' in sys.argv

    # 切换到 crawler 目录以确保 Scrapy 能找到 settings
    os.chdir(os.path.dirname(os.path.abspath(__file__)))

    try:
        raw_results = run_spider(keyword, category, max_items, preview=preview)
    except Exception as e:
        print(json.dumps({'success': False, 'error': f'爬虫运行失败: {e}'}))
        sys.exit(1)

    if not raw_results:
        print(json.dumps({
            'success': False,
            'error': f'未找到 {keyword}({category}) 相关产品，请换个关键词重试',
        }))
        sys.exit(0)

    if preview:
        print(json.dumps({
            'success': True,
            'count': len(raw_results),
            'source': '中关村在线',
            'preview': True,
            'products': raw_results,
        }, ensure_ascii=False))
        sys.exit(0)

    # 非预览模式：Pipeline 已经写入数据库，返回摘要
    print(json.dumps({
        'success': True,
        'count': len(raw_results),
        'source': '中关村在线',
        'products': raw_results,
    }, ensure_ascii=False))


if __name__ == '__main__':
    main()
