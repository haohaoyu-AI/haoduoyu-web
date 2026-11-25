ALTER TABLE `matrix_unscheduled_todos` ADD `recurrence` text CHECK (recurrence IS NULL OR recurrence IN ('week','month'));
