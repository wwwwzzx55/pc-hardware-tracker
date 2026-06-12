"""批量写入产品数据 — 从 stdin 读取 JSON，写入数据库

用法: echo '[{"name":"xxx","price":123,"url":"..."},...]' | python save.py <category>

输入 JSON 格式: [{name, price, url, img_url}, ...]
输出: JSON {success, count, products: [{product_id, name, price, url}]}
"""
import sys
import json
from db import upsert_product, insert_price


def main():
    category = sys.argv[1] if len(sys.argv) > 1 else 'CPU'
    raw = sys.stdin.read().strip()
    if not raw:
        print(json.dumps({'success': False, 'error': '无数据'}))
        sys.exit(1)

    try:
        items = json.loads(raw)
    except json.JSONDecodeError as e:
        print(json.dumps({'success': False, 'error': f'JSON解析失败: {e}'}))
        sys.exit(1)

    if not isinstance(items, list) or len(items) == 0:
        print(json.dumps({'success': False, 'error': '数据为空'}))
        sys.exit(0)

    results = []
    try:
        for item in items:
            product_id = upsert_product(item['name'], category, spec='', url=item.get('url', ''), image_url=item.get('img_url', ''))
            insert_price(product_id, item['price'], source='zol')
            results.append({
                'product_id': product_id,
                'name': item['name'],
                'price': item['price'],
                'url': item.get('url', ''),
            })
    except Exception as db_err:
        print(json.dumps({'success': False, 'error': f'数据库写入失败: {db_err}'}))
        sys.exit(1)

    print(json.dumps({
        'success': True, 'count': len(results), 'products': results,
    }, ensure_ascii=False))


if __name__ == '__main__':
    main()
