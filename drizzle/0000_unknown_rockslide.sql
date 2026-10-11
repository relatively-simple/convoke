CREATE TABLE `daily_usage` (
	`owner` text NOT NULL,
	`day` text NOT NULL,
	`calls` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`owner`, `day`)
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`state` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	`locked_by` text,
	`locked_until` integer
);
--> statement-breakpoint
CREATE INDEX `idx_projects_owner_updated` ON `projects` (`owner`,`updated_at`);--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`project_id` text NOT NULL,
	`status` text NOT NULL,
	`model` text,
	`tokens` integer,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_runs_project_owner` ON `runs` (`project_id`,`owner`);