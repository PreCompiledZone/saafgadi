CREATE TABLE `audit_log` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`actor_id` bigint unsigned,
	`action` enum('SUBSCRIPTION_ACTIVATED','SUBSCRIPTION_RENEWED','SUBSCRIPTION_CANCELLED','WASHER_ASSIGNED','PAYMENT_RECORDED','PRICE_CHANGED','PLAN_UPDATED','ACTIVITIES_UPDATED','WASH_LOG_EDITED','USER_UPDATED','PASSWORD_RESET','SETTINGS_UPDATED','ADMIN_CREATED') NOT NULL,
	`entity` varchar(40) NOT NULL,
	`entity_id` bigint unsigned,
	`details` json,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `enquiries` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` bigint unsigned,
	`vehicle_id` bigint unsigned,
	`plan_id` bigint unsigned,
	`type` enum('NEW_PLAN','CHANGE_PLAN','GENERAL') NOT NULL,
	`message` text,
	`status` enum('OPEN','CONTACTED','CLOSED') NOT NULL DEFAULT 'OPEN',
	`admin_notes` text,
	`handled_by` bigint unsigned,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `enquiries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`subscription_id` bigint unsigned,
	`user_id` bigint unsigned NOT NULL,
	`amount` decimal(10,2) NOT NULL,
	`mode` enum('CASH','UPI','BANK_TRANSFER','OTHER') NOT NULL,
	`reference` varchar(120),
	`paid_on` date NOT NULL,
	`recorded_by` bigint unsigned NOT NULL,
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `payments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `plan_activities` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`plan_id` bigint unsigned NOT NULL,
	`name` varchar(120) NOT NULL,
	`description` varchar(500),
	`quota_per_month` int NOT NULL,
	`min_gap_days` int NOT NULL DEFAULT 1,
	`sort_order` int NOT NULL DEFAULT 0,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `plan_activities_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `plan_prices` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`plan_id` bigint unsigned NOT NULL,
	`vehicle_type` enum('HATCHBACK','SEDAN','SUV','BIKE') NOT NULL,
	`monthly_price` decimal(10,2) NOT NULL,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `plan_prices_id` PRIMARY KEY(`id`),
	CONSTRAINT `plan_prices_plan_type_uq` UNIQUE(`plan_id`,`vehicle_type`)
);
--> statement-breakpoint
CREATE TABLE `plans` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`name` varchar(80) NOT NULL,
	`vehicle_category` enum('CAR','BIKE') NOT NULL,
	`description` text,
	`is_active` boolean NOT NULL DEFAULT true,
	`sort_order` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `plans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`key` varchar(64) NOT NULL,
	`value` text NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `settings_key_uq` UNIQUE(`key`)
);
--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`vehicle_id` bigint unsigned NOT NULL,
	`plan_id` bigint unsigned NOT NULL,
	`vehicle_type` enum('HATCHBACK','SEDAN','SUV','BIKE') NOT NULL,
	`monthly_price` decimal(10,2) NOT NULL,
	`months` int NOT NULL,
	`total_amount` decimal(10,2) NOT NULL,
	`start_date` date NOT NULL,
	`end_date` date NOT NULL,
	`status` enum('PENDING','ACTIVE','CANCELLED') NOT NULL DEFAULT 'PENDING',
	`assigned_washer_id` bigint unsigned,
	`activated_by` bigint unsigned,
	`activated_at` datetime,
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `subscriptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`mobile` varchar(10) NOT NULL,
	`email` varchar(190),
	`password_hash` varchar(100) NOT NULL,
	`role` enum('ADMIN','WASHER','USER') NOT NULL DEFAULT 'USER',
	`is_active` boolean NOT NULL DEFAULT true,
	`address_line` varchar(255),
	`society_or_building` varchar(160),
	`flat_or_house_no` varchar(60),
	`area` varchar(120),
	`city` varchar(80),
	`pincode` varchar(6),
	`last_login_at` datetime,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_mobile_uq` UNIQUE(`mobile`),
	CONSTRAINT `users_email_uq` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `vehicles` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`category` enum('CAR','BIKE') NOT NULL,
	`car_type` enum('HATCHBACK','SEDAN','SUV'),
	`registration_number` varchar(12) NOT NULL,
	`make` varchar(60) NOT NULL,
	`model` varchar(60) NOT NULL,
	`color` varchar(40) NOT NULL,
	`parking_notes` varchar(255),
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vehicles_id` PRIMARY KEY(`id`),
	CONSTRAINT `vehicles_reg_uq` UNIQUE(`registration_number`)
);
--> statement-breakpoint
CREATE TABLE `wash_logs` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`subscription_id` bigint unsigned NOT NULL,
	`vehicle_id` bigint unsigned NOT NULL,
	`plan_activity_id` bigint unsigned NOT NULL,
	`washer_id` bigint unsigned NOT NULL,
	`service_date` date NOT NULL,
	`performed_at` datetime NOT NULL,
	`status` enum('DONE','NOT_DONE') NOT NULL,
	`reason` enum('VEHICLE_NOT_AVAILABLE','NO_ACCESS','WEATHER','OTHER'),
	`notes` varchar(500),
	`is_catch_up` boolean NOT NULL DEFAULT false,
	`edited_by` bigint unsigned,
	`edited_at` datetime,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `wash_logs_id` PRIMARY KEY(`id`),
	CONSTRAINT `wash_logs_sub_activity_date_uq` UNIQUE(`subscription_id`,`plan_activity_id`,`service_date`)
);
--> statement-breakpoint
ALTER TABLE `audit_log` ADD CONSTRAINT `audit_log_actor_id_users_id_fk` FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `enquiries` ADD CONSTRAINT `enquiries_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `enquiries` ADD CONSTRAINT `enquiries_vehicle_id_vehicles_id_fk` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `enquiries` ADD CONSTRAINT `enquiries_plan_id_plans_id_fk` FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `enquiries` ADD CONSTRAINT `enquiries_handled_by_users_id_fk` FOREIGN KEY (`handled_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payments` ADD CONSTRAINT `payments_subscription_id_subscriptions_id_fk` FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payments` ADD CONSTRAINT `payments_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payments` ADD CONSTRAINT `payments_recorded_by_users_id_fk` FOREIGN KEY (`recorded_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `plan_activities` ADD CONSTRAINT `plan_activities_plan_id_plans_id_fk` FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `plan_prices` ADD CONSTRAINT `plan_prices_plan_id_plans_id_fk` FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_vehicle_id_vehicles_id_fk` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_plan_id_plans_id_fk` FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_assigned_washer_id_users_id_fk` FOREIGN KEY (`assigned_washer_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_activated_by_users_id_fk` FOREIGN KEY (`activated_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vehicles` ADD CONSTRAINT `vehicles_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wash_logs` ADD CONSTRAINT `wash_logs_subscription_id_subscriptions_id_fk` FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wash_logs` ADD CONSTRAINT `wash_logs_vehicle_id_vehicles_id_fk` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wash_logs` ADD CONSTRAINT `wash_logs_plan_activity_id_plan_activities_id_fk` FOREIGN KEY (`plan_activity_id`) REFERENCES `plan_activities`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wash_logs` ADD CONSTRAINT `wash_logs_washer_id_users_id_fk` FOREIGN KEY (`washer_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wash_logs` ADD CONSTRAINT `wash_logs_edited_by_users_id_fk` FOREIGN KEY (`edited_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `audit_log_entity_idx` ON `audit_log` (`entity`,`entity_id`);--> statement-breakpoint
CREATE INDEX `enquiries_status_idx` ON `enquiries` (`status`);--> statement-breakpoint
CREATE INDEX `enquiries_user_idx` ON `enquiries` (`user_id`);--> statement-breakpoint
CREATE INDEX `payments_paid_on_idx` ON `payments` (`paid_on`);--> statement-breakpoint
CREATE INDEX `payments_user_idx` ON `payments` (`user_id`);--> statement-breakpoint
CREATE INDEX `payments_subscription_idx` ON `payments` (`subscription_id`);--> statement-breakpoint
CREATE INDEX `plan_activities_plan_idx` ON `plan_activities` (`plan_id`);--> statement-breakpoint
CREATE INDEX `subscriptions_vehicle_idx` ON `subscriptions` (`vehicle_id`,`status`);--> statement-breakpoint
CREATE INDEX `subscriptions_user_idx` ON `subscriptions` (`user_id`);--> statement-breakpoint
CREATE INDEX `subscriptions_washer_idx` ON `subscriptions` (`assigned_washer_id`,`status`);--> statement-breakpoint
CREATE INDEX `subscriptions_end_idx` ON `subscriptions` (`status`,`end_date`);--> statement-breakpoint
CREATE INDEX `users_role_idx` ON `users` (`role`);--> statement-breakpoint
CREATE INDEX `vehicles_user_idx` ON `vehicles` (`user_id`);--> statement-breakpoint
CREATE INDEX `wash_logs_date_idx` ON `wash_logs` (`service_date`);--> statement-breakpoint
CREATE INDEX `wash_logs_washer_date_idx` ON `wash_logs` (`washer_id`,`service_date`);--> statement-breakpoint
CREATE INDEX `wash_logs_vehicle_date_idx` ON `wash_logs` (`vehicle_id`,`service_date`);