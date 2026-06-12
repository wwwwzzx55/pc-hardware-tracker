"""刷新所有产品价格 — 从数据库读取已有产品，重新爬取价格

用法: python refresh_prices.py [--source zol|pconline|both]

读取数据库中所有产品，逐个搜索并记录最新价格。
可同时从多个数据源获取，一次运行即可增加多个价格数据点。
"""
import sys
import json
from db import get_connection, upsert_product, insert_price
from zol import search_zol
from pconline import search_pconline
import time


def main():
    source = 'both'
    for arg in sys.argv[1:]:
        if arg.startswith('--source='):
            source = arg.split('=', 1)[1]
        elif arg in ('zol', 'pconline', 'both'):
            source = arg

    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute('SELECT id, name, category FROM products ORDER BY id')
        products = cursor.fetchall()
        cursor.close()
    finally:
        conn.close()

    if not products:
        print(json.dumps({'success': False, 'error': '数据库中没有产品，请先爬取'}))
        sys.exit(0)

    total_prices = 0
    results = []

    for prod_id, name, category in products:
        prices_added = 0

        # 从 ZOL 获取价格
        if source in ('zol', 'both'):
            try:
                items = search_zol(name, category, max_items=3)
                for item_name, price, url, img_url in items:
                    if item_name.strip() == name.strip() or name.strip() in item_name.strip():
                        insert_price(prod_id, price, source='zol')
                        prices_added += 1
                        total_prices += 1
                        break
                time.sleep(0.5)  # 避免请求过快
            except Exception as e:
                pass  # 某个源失败不影响另一个

        # 从太平洋电脑网获取价格
        if source in ('pconline', 'both'):
            try:
                items = search_pconline(name, category, max_items=3)
                for item_name, price, url, img_url in items:
                    if item_name.strip() == name.strip() or name.strip() in item_name.strip():
                        insert_price(prod_id, price, source='pconline')
                        prices_added += 1
                        total_prices += 1
                        break
                time.sleep(0.5)
            except Exception as e:
                pass

        if prices_added > 0:
            results.append({
                'product_id': prod_id,
                'name': name,
                'prices_added': prices_added,
            })

    print(json.dumps({
        'success': True,
        'total_products': len(products),
        'total_prices_added': total_prices,
        'updated': results,
    }, ensure_ascii=False))


if __name__ == '__main__':
    main()
