-- MiniDrive database schema
-- Run this against an empty database (e.g. minidrive_db).

CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(64) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS files (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      owner_user_id INT NOT NULL,
      original_name VARCHAR(255) NOT NULL,
      stored_name   VARCHAR(255) NOT NULL,
      mime_type     VARCHAR(127) DEFAULT NULL,
      size_bytes    BIGINT NOT NULL,
      storage_path  TEXT NOT NULL,
      created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS file_shares (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      file_id BIGINT NOT NULL,
      owner_user_id INT NOT NULL,
      target_user_id INT NOT NULL,
      can_download TINYINT(1) DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_file_target (file_id, target_user_id),
      FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE,
      FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS link_shares (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      file_id BIGINT NOT NULL,
      owner_user_id INT NOT NULL,
      token CHAR(22) NOT NULL UNIQUE,
      expires_at DATETIME NULL,
      max_downloads INT NULL,
      download_count INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE,
      FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS comments (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      file_id BIGINT NOT NULL,
      author_user_id INT NOT NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE,
      FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
