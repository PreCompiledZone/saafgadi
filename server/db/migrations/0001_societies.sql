CREATE TABLE `societies` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`name` varchar(160) NOT NULL,
	`area` varchar(120) NOT NULL,
	`city` varchar(80) NOT NULL,
	`pincode` varchar(6) NOT NULL,
	`address_line` varchar(255),
	`notes` text,
	`default_washer_id` bigint unsigned,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `societies_id` PRIMARY KEY(`id`),
	CONSTRAINT `societies_name_area_uq` UNIQUE(`name`,`area`)
);
--> statement-breakpoint
ALTER TABLE `audit_log` MODIFY COLUMN `action` enum('SUBSCRIPTION_ACTIVATED','SUBSCRIPTION_RENEWED','SUBSCRIPTION_CANCELLED','WASHER_ASSIGNED','PAYMENT_RECORDED','PRICE_CHANGED','PLAN_UPDATED','ACTIVITIES_UPDATED','WASH_LOG_EDITED','USER_UPDATED','PASSWORD_RESET','SETTINGS_UPDATED','ADMIN_CREATED','SOCIETY_CREATED','SOCIETY_UPDATED','SOCIETY_WASHER_ASSIGNED') NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `society_id` bigint unsigned;--> statement-breakpoint
ALTER TABLE `societies` ADD CONSTRAINT `societies_default_washer_id_users_id_fk` FOREIGN KEY (`default_washer_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_society_id_societies_id_fk` FOREIGN KEY (`society_id`) REFERENCES `societies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `users_society_idx` ON `users` (`society_id`);