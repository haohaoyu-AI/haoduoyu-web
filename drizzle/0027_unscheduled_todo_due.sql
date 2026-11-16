ALTER TABLE `matrix_unscheduled_todos` ADD `due_date` text CHECK (due_date IS NULL OR due_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]');
