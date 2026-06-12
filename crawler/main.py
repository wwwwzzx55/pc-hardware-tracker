"""爬虫命令行入口 — 被 NestJS spawn 调用

用法:
  python main.py <keyword> <category> [count] [--preview] [--source zol|pconline]

数据源:
  默认: 太平洋电脑网 (m.pconline.com.cn)
  --source zol: 中关村在线 (detail.zol.com.cn)

输出: JSON 到 stdout，NestJS 读取解析
"""
import sys
import json
from zol import search_zol
from pconline import search_pconline
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
        print(json.dumps({'success': False, 'error': 'Usage: python main.py <keyword> <category> [count] [--preview]'}))
        sys.exit(1)

    keyword = sys.argv[1]
    category_raw = sys.argv[2]
    category = CATEGORY_MAP.get(category_raw, 'CPU')
    max_items = int(sys.argv[3]) if len(sys.argv) > 3 and sys.argv[3].lstrip('-').isdigit() else 10
    max_items = max(10, min(max_items, 30))  # 限制10-30范围
    preview = '--preview' in sys.argv
    source = 'zol' if '--source' in sys.argv and 'zol' in sys.argv else 'pconline'

    # 选择数据源
    source_name = '中关村在线' if source == 'zol' else '太平洋电脑网'
    search_fn = search_zol if source == 'zol' else search_pconline
    try:
        products = search_fn(keyword, category, max_items)
    except Exception as e:
        print(json.dumps({'success': False, 'error': f'网络请求失败: {e}'}))
        sys.exit(1)

    if not products:
        print(json.dumps({'success': False, 'error': f'未找到 {keyword}({category}) 相关产品，请换个关键词重试'}))
        sys.exit(0)

    # 构建结果列表
    raw_results = [{'name': name, 'price': price, 'url': url, 'img_url': img_url} for name, price, url, img_url in products]

    if preview:
        # 预览模式：不写库，直接返回数据
        print(json.dumps({
            'success': True, 'count': len(raw_results), 'source': source_name,
            'preview': True, 'products': raw_results,
        }, ensure_ascii=False))
        sys.exit(0)

    # 写入数据库
    results = []
    try:
        for item in raw_results:
            product_id = upsert_product(item['name'], category, spec='', url=item['url'], image_url=item['img_url'])
            insert_price(product_id, item['price'], source=source)
            results.append({
                'product_id': product_id,
                'name': item['name'],
                'price': item['price'],
                'url': item['url'],
            })
    except Exception as db_err:
        print(json.dumps({'success': False, 'error': f'数据库写入失败: {db_err}'}))
        sys.exit(1)

    print(json.dumps({
        'success': True, 'count': len(results), 'source': source_name,
        'products': results,
    }, ensure_ascii=False))


if __name__ == '__main__':
    main()
