"""数据库操作 — 硬件产品与价格读写"""
import mysql.connector
from datetime import datetime

DB_CONFIG = {
    'host': 'localhost',
    'user': 'root',
    'password': '908%Wang',
    'database': 'pc_hardware_tracker',
    'charset': 'utf8mb4'
}

def get_connection():
    return mysql.connector.connect(**DB_CONFIG)

def upsert_product(name, category, spec='', url='', image_url=''):
    """插入或更新产品，返回 product_id"""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO products (name, category, spec, manmanbuy_url, image_url)
        VALUES (%s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE spec=VALUES(spec), manmanbuy_url=VALUES(manmanbuy_url), image_url=VALUES(image_url)
    ''', (name, category, spec, url, image_url))
    conn.commit()
    cursor.execute('SELECT id FROM products WHERE name=%s AND category=%s', (name, category))
    product_id = cursor.fetchone()[0]
    cursor.close()
    conn.close()
    return product_id

def insert_price(product_id, price, source='manmanbuy'):
    """记录一条价格"""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO price_history (product_id, price, source)
        VALUES (%s, %s, %s)
    ''', (product_id, price, source))
    conn.commit()
    cursor.close()
    conn.close()

def get_latest_price(product_id):
    """获取某产品最新价格"""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT price FROM price_history
        WHERE product_id=%s ORDER BY recorded_at DESC LIMIT 1
    ''', (product_id,))
    row = cursor.fetchone()
    cursor.close()
    conn.close()
    return row[0] if row else None
