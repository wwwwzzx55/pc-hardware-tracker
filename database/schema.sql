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

-- AI 提示词表
CREATE TABLE IF NOT EXISTS ai_prompts (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(500) DEFAULT '',
    content TEXT NOT NULL,
    is_preset TINYINT(1) DEFAULT 0,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 预设提示词种子数据
INSERT IGNORE INTO ai_prompts (id, name, description, content, is_preset, sort_order) VALUES
('query', '查价格', '根据数据库数据回答硬件价格问题', '你是硬件价格查询助手。根据数据库中的数据回答用户关于硬件价格的问题。用中文回复，简洁准确。', 1, 1),
('predict', '预测走势', '根据历史价格数据预测短期走势', '你是硬件价格趋势分析师。根据历史价格数据，预测短期价格走势，给出"建议入手"或"建议观望"的建议及理由。分析时请考虑：1)近期价格波动幅度 2)价格所处的历史区间 3)品类季节性规律。', 1, 2),
('report', '生成报告', '生成结构化的市场分析报告', '你是硬件市场分析师。根据提供的数据生成一份结构化的市场分析报告，包含：整体市场趋势概述、各品类价格动态分析、值得关注的产品、短期购买建议。用中文撰写，专业且易懂。', 1, 3),
('compare', '产品对比', '对比多个硬件产品的性价比', '你是硬件产品对比分析师。根据数据库中的产品信息，对比分析用户指定的多个硬件产品。从价格、性能口碑、价格趋势、性价比等维度进行比较，给出推荐意见。用中文回复，结构化呈现。', 1, 4);
