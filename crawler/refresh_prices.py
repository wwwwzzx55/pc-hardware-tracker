"""刷新所有产品价格 — 从数据库读取已有产品，重新爬取价格

用法: python refresh_prices.py

读取数据库中所有产品，逐个搜索并记录最新价格。
使用 Scrapy Spider (通过 CrawlerProcess) 进行爬取。
"""
import sys
import json
import os
from db import get_connection, insert_price


def main():
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
        try:
            # 直接使用旧版 zol.py 的 search_zol() — 简单可靠，不需要启动 CrawlerProcess
            from zol import search_zol
            items = search_zol(name, category, max_items=3)
            for item_name, price, url, img_url in items:
                if item_name.strip() == name.strip() or name.strip() in item_name.strip():
                    insert_price(prod_id, price, source='zol')
                    prices_added += 1
                    total_prices += 1
                    break
        except Exception as e:
            pass  # 某个产品失败不影响其他

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
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    main()
