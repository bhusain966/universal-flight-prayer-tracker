CREATE TABLE `upcoming_trips` (
	`id` int AUTO_INCREMENT NOT NULL,
	`flightIata` varchar(16) NOT NULL,
	`airlineName` varchar(128),
	`depIata` varchar(8),
	`depCity` varchar(64),
	`arrIata` varchar(8),
	`arrCity` varchar(64),
	`scheduledDepUtc` varchar(32) NOT NULL,
	`scheduledDepLocal` varchar(32),
	`scheduledArrLocal` varchar(32),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `upcoming_trips_id` PRIMARY KEY(`id`)
);
