ALTER TABLE `matrix_unscheduled_todos` ADD `period` text CHECK (period IS NULL OR period GLOB '[0-9][0-9][0-9][0-9]-W[0-9][0-9]' OR period GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]');
