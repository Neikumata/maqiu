CREATE TABLE `exam_answers` (
	`id` text PRIMARY KEY NOT NULL,
	`exam_id` text NOT NULL,
	`question_id` text NOT NULL,
	`user_answer` text DEFAULT '',
	`correct` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`exam_id`) REFERENCES `exam_results`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `exam_results` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`total_score` integer DEFAULT 0,
	`max_score` integer DEFAULT 0,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `knowledge_edges` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`target_id` text NOT NULL,
	`type` text NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `knowledge_nodes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_id`) REFERENCES `knowledge_nodes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `knowledge_nodes` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`content` text DEFAULT '',
	`category` text DEFAULT '',
	`tags` text DEFAULT '[]',
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `learning_progress` (
	`id` text PRIMARY KEY NOT NULL,
	`node_id` text NOT NULL,
	`status` text DEFAULT 'not_started' NOT NULL,
	`score` integer DEFAULT 0,
	`review_count` integer DEFAULT 0 NOT NULL,
	`last_reviewed_at` integer,
	`next_review_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`node_id`) REFERENCES `knowledge_nodes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `questions` (
	`id` text PRIMARY KEY NOT NULL,
	`node_id` text NOT NULL,
	`type` text NOT NULL,
	`content` text NOT NULL,
	`options` text DEFAULT '[]',
	`answer` text NOT NULL,
	`explanation` text DEFAULT '',
	`difficulty` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`node_id`) REFERENCES `knowledge_nodes`(`id`) ON UPDATE no action ON DELETE cascade
);
