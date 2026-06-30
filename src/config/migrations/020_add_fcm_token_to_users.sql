-- Migration: 020_add_fcm_token_to_users
-- Adds FCM (Firebase Cloud Messaging) device token column to users table

ALTER TABLE users
  ADD COLUMN fcm_token VARCHAR(500) NULL DEFAULT NULL COMMENT 'Firebase Cloud Messaging device token for push notifications';
