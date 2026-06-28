CREATE TABLE IF NOT EXISTS login_logs (
  id            INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  user_id       INT UNSIGNED    NULL,
  login_status  ENUM('success','failed') NOT NULL DEFAULT 'failed',
  failed_reason VARCHAR(255)    NULL,
  ip_address    VARCHAR(45)     NULL,
  browser       VARCHAR(500)    NULL,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  INDEX idx_login_logs_user_id    (user_id),
  INDEX idx_login_logs_status     (login_status),
  INDEX idx_login_logs_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
