-- database/schema.sql
-- PC Hardware Price Tracker - Database Initialization

CREATE DATABASE IF NOT EXISTS pc_hardware_tracker CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE pc_hardware_tracker;

CREATE TABLE IF NOT EXISTS products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    category ENUM('CPU','GPU','RAM','MB','SSD') NOT NULL,
    spec VARCHAR(500),
    manmanbuy_url VARCHAR(500),
    image_url VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_name_category (name, category)
);

CREATE TABLE IF NOT EXISTS price_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    source VARCHAR(100) DEFAULT 'pconline',
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    INDEX idx_product_time (product_id, recorded_at)
);
