-- Align person default hours with typical Di–Do kitchen shift.
update people set work_start = '16:00' where work_start = '08:00';
update people set work_end = '22:00' where work_end = '16:00';
