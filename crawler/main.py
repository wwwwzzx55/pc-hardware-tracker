"""爬虫命令行入口 — 被 NestJS spawn 调用

用法: python main.py <keyword> <category>

输出: JSON 到 stdout，NestJS 读取解析
"""
import sys
import json
from manmanbuy import search_product, get_price_history_from_page
from db import upsert_product, insert_price

CATEGORY_MAP = {
    'CPU': 'CPU', 'cpu': 'CPU',
    'GPU': 'GPU', 'gpu': 'GPU', '显卡': 'GPU',
    'RAM': 'RAM', 'ram': 'RAM', '内存': 'RAM',
    'MB': 'MB', 'mb': 'MB', '主板': 'MB',
    'SSD': 'SSD', 'ssd': 'SSD', '硬盘': 'SSD',
}


def main():
    if len(sys.argv) < 3:
        print(json.dumps({'success': False, 'error': 'Usage: python main.py <keyword> <category>'}))
        sys.exit(1)

    keyword = sys.argv[1]
    category_raw = sys.argv[2]
    category = CATEGORY_MAP.get(category_raw, 'CPU')

    try:
        products = search_product(keyword)
        if not products:
            print(json.dumps({'success': False, 'error': f'未找到 {keyword} 相关产品'}))
            sys.exit(0)

        results = []
        for name, price, url, img_url in products:
            product_id = upsert_product(name, category, spec='', url=url, image_url=img_url)
            insert_price(product_id, price, source='manmanbuy')

            results.append({
                'product_id': product_id,
                'name': name,
                'price': price,
                'url': url,
            })

        print(json.dumps({'success': True, 'count': len(results), 'products': results}, ensure_ascii=False))

    except Exception as e:
        print(json.dumps({'success': False, 'error': str(e)}, ensure_ascii=False))
        sys.exit(1)


if __name__ == '__main__':
    main()
