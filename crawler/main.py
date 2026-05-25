"""爬虫命令行入口 — 被 NestJS spawn 调用

用法: python main.py <keyword> <category>

数据源: 中关村在线 (detail.zol.com.cn)
  CPU/GPU/RAM/MB: 服务端HTML列表页
  SSD: 搜索接口降级方案

输出: JSON 到 stdout，NestJS 读取解析
"""
import sys
import json
from zol import search_zol
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

    # 中关村在线爬虫（按关键词过滤）
    try:
        products = search_zol(keyword, category)
    except Exception as e:
        print(json.dumps({'success': False, 'error': f'网络请求失败: {e}'}))
        sys.exit(1)

    if not products:
        print(json.dumps({'success': False, 'error': f'未找到 {keyword}({category}) 相关产品，请换个关键词重试'}))
        sys.exit(0)

    # 写入数据库
    results = []
    try:
        for name, price, url, img_url in products:
            product_id = upsert_product(name, category, spec='', url=url, image_url=img_url)
            insert_price(product_id, price, source='zol')
            results.append({
                'product_id': product_id,
                'name': name,
                'price': price,
                'url': url,
            })
    except Exception as db_err:
        print(json.dumps({'success': False, 'error': f'数据库写入失败: {db_err}'}))
        sys.exit(1)

    print(json.dumps({
        'success': True, 'count': len(results), 'source': '中关村在线',
        'products': results,
    }, ensure_ascii=False))


if __name__ == '__main__':
    main()
