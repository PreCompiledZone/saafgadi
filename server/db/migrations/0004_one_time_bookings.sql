CREATE TABLE `booking_events` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`booking_id` bigint unsigned NOT NULL,
	`from_status` enum('REQUESTED','CONFIRMED','COMPLETED','CANCELLED','NOT_DONE'),
	`to_status` enum('REQUESTED','CONFIRMED','COMPLETED','CANCELLED','NOT_DONE') NOT NULL,
	`actor_user_id` bigint unsigned,
	`note` varchar(500),
	`created_at` datetime NOT NULL,
	CONSTRAINT `booking_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `bookings` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`service_id` bigint unsigned NOT NULL,
	`service_name` varchar(120) NOT NULL,
	`vehicle_type` enum('HATCHBACK','SEDAN','SUV','BIKE') NOT NULL,
	`price` int NOT NULL,
	`vehicle_id` bigint unsigned,
	`registration_number` varchar(12) NOT NULL,
	`vehicle_make` varchar(60),
	`vehicle_model` varchar(60),
	`vehicle_color` varchar(40) NOT NULL,
	`address_line` varchar(255),
	`society_or_building` varchar(160) NOT NULL,
	`flat_or_house_no` varchar(60) NOT NULL,
	`area` varchar(120) NOT NULL,
	`city` varchar(80) NOT NULL,
	`pincode` varchar(6) NOT NULL,
	`parking_notes` varchar(255),
	`preferred_date` date NOT NULL,
	`preferred_slot` enum('EARLY_MORNING','MORNING','LATE_MORNING','EVENING') NOT NULL,
	`status` enum('REQUESTED','CONFIRMED','COMPLETED','CANCELLED','NOT_DONE') NOT NULL DEFAULT 'REQUESTED',
	`assigned_washer_id` bigint unsigned,
	`scheduled_date` date,
	`scheduled_slot` enum('EARLY_MORNING','MORNING','LATE_MORNING','EVENING'),
	`completed_at` datetime,
	`not_done_reason` varchar(255),
	`cancel_reason` varchar(255),
	`customer_notes` varchar(500),
	`admin_notes` text,
	`payment_status` enum('UNPAID','PAID') NOT NULL DEFAULT 'UNPAID',
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bookings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `one_time_service_prices` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`service_id` bigint unsigned NOT NULL,
	`vehicle_type` enum('HATCHBACK','SEDAN','SUV','BIKE') NOT NULL,
	`price` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `one_time_service_prices_id` PRIMARY KEY(`id`),
	CONSTRAINT `one_time_service_prices_uq` UNIQUE(`service_id`,`vehicle_type`)
);
--> statement-breakpoint
CREATE TABLE `one_time_services` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`description` varchar(500),
	`includes` json NOT NULL,
	`applies_to` json NOT NULL,
	`duration_minutes` int NOT NULL,
	`is_active` boolean NOT NULL DEFAULT false,
	`sort_order` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `one_time_services_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `payments` ADD `booking_id` bigint unsigned;--> statement-breakpoint
ALTER TABLE `booking_events` ADD CONSTRAINT `booking_events_booking_id_bookings_id_fk` FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `booking_events` ADD CONSTRAINT `booking_events_actor_user_id_users_id_fk` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_service_id_one_time_services_id_fk` FOREIGN KEY (`service_id`) REFERENCES `one_time_services`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_vehicle_id_vehicles_id_fk` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_assigned_washer_id_users_id_fk` FOREIGN KEY (`assigned_washer_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `one_time_service_prices` ADD CONSTRAINT `one_time_service_prices_service_id_one_time_services_id_fk` FOREIGN KEY (`service_id`) REFERENCES `one_time_services`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `booking_events_booking_idx` ON `booking_events` (`booking_id`);--> statement-breakpoint
CREATE INDEX `bookings_user_idx` ON `bookings` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `bookings_status_idx` ON `bookings` (`status`,`preferred_date`);--> statement-breakpoint
CREATE INDEX `bookings_washer_date_idx` ON `bookings` (`assigned_washer_id`,`scheduled_date`);--> statement-breakpoint
CREATE INDEX `bookings_scheduled_idx` ON `bookings` (`scheduled_date`,`scheduled_slot`);--> statement-breakpoint
ALTER TABLE `payments` ADD CONSTRAINT `payments_booking_id_bookings_id_fk` FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `payments_booking_idx` ON `payments` (`booking_id`);