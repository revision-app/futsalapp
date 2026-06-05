alter type public.event_type add value if not exists 'camp';
alter type public.attendance_status add value if not exists 'tentative';

alter table public.events
  add column if not exists end_date timestamptz;
