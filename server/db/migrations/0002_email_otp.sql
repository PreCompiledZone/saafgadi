CREATE TABLE `otp_codes` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`channel` enum('EMAIL') NOT NULL,
	`destination` varchar(255) NOT NULL,
	`purpose` enum('VERIFY_EMAIL','RESET_PASSWORD') NOT NULL,
	`user_id` bigint unsigned,
	`code_hash` varchar(255) NOT NULL,
	`attempts` tinyint NOT NULL DEFAULT 0,
	`expires_at` datetime NOT NULL,
	`consumed_at` datetime,
	`request_ip` varchar(45) NOT NULL,
	`created_at` datetime NOT NULL,
	CONSTRAINT `otp_codes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `email_verified_at` datetime;--> statement-breakpoint
ALTER TABLE `users` ADD `token_version` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `otp_codes` ADD CONSTRAINT `otp_codes_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `otp_codes_dest_idx` ON `otp_codes` (`destination`,`purpose`,`created_at`);--> statement-breakpoint
CREATE INDEX `otp_codes_ip_idx` ON `otp_codes` (`request_ip`,`created_at`);