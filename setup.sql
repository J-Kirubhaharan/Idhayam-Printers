-- ============================================================
-- IDHAYAM PRINTING OFFSET - SUPABASE DATABASE SETUP
-- Run this in your Supabase SQL Editor (Project -> SQL Editor)
-- ============================================================

-- Enable required extensions
create extension if not exists "uuid-ossp";

-- ============================================================
-- 1. CUSTOMERS
-- ============================================================
create table if not exists customers (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  contact text,        -- primary / WhatsApp number
  alt_contact text,    -- additional number (optional)
  total_spent numeric(12,2) default 0,
  total_pending numeric(12,2) default 0,
  created_at timestamptz default now()
);

create index if not exists idx_customers_name on customers (lower(name));

-- additional number (for existing databases)
alter table customers add column if not exists alt_contact text;

-- ============================================================
-- 2. JOB TYPES (master list + custom usage tracking)
-- ============================================================
create table if not exists job_types (
  id uuid primary key default uuid_generate_v4(),
  name text unique not null,
  is_custom boolean default false,
  usage_count integer default 0
);

-- Seed default job types
insert into job_types (name, is_custom) values
  ('Banner', false),('Flex', false),('Poster', false),('Pamphlet/Flyer', false),
  ('Brochure', false),('Visiting Card', false),('Letter Head', false),('ID Card', false),
  ('Sticker', false),('Calendar', false),('Book Printing', false),('Binding', false),
  ('Notebook', false),('Bill Book', false),('Invoice Book', false),('Certificate', false),
  ('Envelope', false),('Stamp', false),('Receipt Book', false),('Files & Folders', false)
on conflict (name) do nothing;

-- ============================================================
-- 3. JOBS
-- ============================================================
create table if not exists jobs (
  id uuid primary key default uuid_generate_v4(),
  job_id text unique not null,
  customer_id uuid references customers(id) on delete set null,
  job_type text not null,
  custom_job_type text,
  paper_size text,
  custom_paper_size text,
  flex_width text,
  flex_height text,
  flex_unit text,
  quantity integer not null default 1,
  rate numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null default 0,
  payment_type text not null check (payment_type in ('Cash','UPI','Credit')),
  -- delivery / fulfilment status only. Payment status is derived from the payments table.
  status text not null default 'Pending' check (status in ('Pending','In Progress','Ready for Pickup','Delivered')),
  delivery_date date,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz,  -- soft delete: non-null means the job is in the trash
  is_urgent boolean not null default false,
  assigned_to text,  -- name of the employee this job is assigned to (optional)
  delivered_at timestamptz,  -- when the job was actually marked Delivered
  order_group uuid,  -- links jobs created together in one multi-item order
  delivery_time text,  -- optional HH:MM deadline time alongside delivery_date
  ready_at timestamptz  -- when status became 'Ready for Pickup'
);

create index if not exists idx_jobs_job_id on jobs (job_id);
create index if not exists idx_jobs_customer_id on jobs (customer_id);
create index if not exists idx_jobs_status on jobs (status);
create index if not exists idx_jobs_created_at on jobs (created_at desc);

-- Migration: 'status' now means delivery only. Older rows may hold 'Paid'
-- (the old combined value) -> treat those as Delivered, then tighten the check.
alter table jobs drop constraint if exists jobs_status_check;
update jobs set status = 'Delivered' where status = 'Paid';
alter table jobs add constraint jobs_status_check check (status in ('Pending','In Progress','Ready for Pickup','Delivered'));

-- Soft delete: deleted jobs keep their row (so their Job ID is retired and never
-- reused) but are hidden everywhere except the Deleted Jobs page.
alter table jobs add column if not exists deleted_at timestamptz;
create index if not exists idx_jobs_deleted_at on jobs (deleted_at);

-- Urgent flag (shown to employees on the job board)
alter table jobs add column if not exists is_urgent boolean not null default false;

-- Assigned employee name (shown on the job board)
alter table jobs add column if not exists assigned_to text;

-- Actual delivered timestamp (auto-stamped when status becomes 'Delivered').
-- Backfill existing delivered jobs with their last-updated time as a best estimate.
alter table jobs add column if not exists delivered_at timestamptz;
update jobs set delivered_at = updated_at where status = 'Delivered' and delivered_at is null;

-- Links jobs created together in one multi-item order (for a combined invoice)
alter table jobs add column if not exists order_group uuid;
create index if not exists idx_jobs_order_group on jobs (order_group);

-- Optional delivery time + when a job became Ready for Pickup (for reminders)
alter table jobs add column if not exists delivery_time text;
alter table jobs add column if not exists ready_at timestamptz;
update jobs set ready_at = updated_at where status = 'Ready for Pickup' and ready_at is null;

-- Auto-update updated_at, and stamp/clear delivered_at on status change
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  -- record the moment a job is first marked Delivered; clear it if re-opened
  if new.status = 'Delivered' and (old.status is distinct from 'Delivered') then
    new.delivered_at = now();
  elsif new.status <> 'Delivered' then
    new.delivered_at = null;
  end if;
  -- record the moment a job becomes Ready for Pickup; clear it otherwise
  if new.status = 'Ready for Pickup' and (old.status is distinct from 'Ready for Pickup') then
    new.ready_at = now();
  elsif new.status <> 'Ready for Pickup' then
    new.ready_at = null;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_jobs_updated_at on jobs;
create trigger trg_jobs_updated_at
before update on jobs
for each row execute function set_updated_at();

-- ============================================================
-- 4. PAYMENTS
-- ============================================================
create table if not exists payments (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid references jobs(id) on delete cascade,
  amount numeric(12,2) not null,
  payment_type text not null check (payment_type in ('Cash','UPI')),
  payment_date timestamptz default now(),
  notes text
);

create index if not exists idx_payments_job_id on payments (job_id);
create index if not exists idx_payments_payment_date on payments (payment_date desc);

-- ============================================================
-- 5. EXPENSES
-- ============================================================
create table if not exists expenses (
  id uuid primary key default uuid_generate_v4(),
  category text not null,
  custom_category text,
  amount numeric(12,2) not null,
  description text,
  created_at timestamptz default now()
);

create index if not exists idx_expenses_created_at on expenses (created_at desc);

-- ============================================================
-- 6. DAILY SUMMARY
-- ============================================================
create table if not exists daily_summary (
  id uuid primary key default uuid_generate_v4(),
  date date unique not null,
  total_cash numeric(12,2) default 0,
  total_upi numeric(12,2) default 0,
  total_credit numeric(12,2) default 0,
  total_income numeric(12,2) default 0,
  total_expenses numeric(12,2) default 0,
  net_profit numeric(12,2) default 0
);

create index if not exists idx_daily_summary_date on daily_summary (date desc);

-- ============================================================
-- 7. AUTO-GENERATE JOB ID (IPO-YYYY-001)
-- ============================================================
create or replace function generate_job_id()
returns trigger as $$
declare
  yr text;
  next_seq int;
  new_id text;
begin
  if new.job_id is null or new.job_id = '' then
    yr := to_char(now(), 'YYYY');
    select coalesce(max(cast(split_part(job_id, '-', 3) as int)), 0) + 1
      into next_seq
      from jobs
      where job_id like 'IPO-' || yr || '-%';
    new_id := 'IPO-' || yr || '-' || lpad(next_seq::text, 3, '0');
    new.job_id := new_id;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_jobs_generate_id on jobs;
create trigger trg_jobs_generate_id
before insert on jobs
for each row execute function generate_job_id();

-- ============================================================
-- 8. AUTO-UPDATE CUSTOMER TOTALS
--    total_spent   = all money actually received from the customer (payments)
--    total_pending = remaining balance on unpaid credit jobs (total - payments)
-- ============================================================
create or replace function recompute_customer_totals(cid uuid)
returns void as $$
begin
  if cid is null then return; end if;

  update customers c
  set
    total_spent = coalesce((
      select sum(p.amount)
      from payments p
      join jobs j on j.id = p.job_id
      where j.customer_id = cid
        and j.deleted_at is null
    ), 0),
    total_pending = coalesce((
      select sum(greatest(j.total_amount - coalesce((
                select sum(p2.amount) from payments p2 where p2.job_id = j.id
              ), 0), 0))
      from jobs j
      where j.customer_id = cid
        and j.deleted_at is null
    ), 0)
  where c.id = cid;
end;
$$ language plpgsql;

-- recompute when a job changes
create or replace function update_customer_totals()
returns trigger as $$
begin
  perform recompute_customer_totals(coalesce(new.customer_id, old.customer_id));
  return coalesce(new, old);
end;
$$ language plpgsql;

drop trigger if exists trg_jobs_customer_totals on jobs;
create trigger trg_jobs_customer_totals
after insert or update or delete on jobs
for each row execute function update_customer_totals();

-- recompute when a payment changes (advance, credit collection, etc.)
create or replace function update_customer_totals_from_payment()
returns trigger as $$
declare
  cid uuid;
begin
  select customer_id into cid from jobs where id = coalesce(new.job_id, old.job_id);
  perform recompute_customer_totals(cid);
  return coalesce(new, old);
end;
$$ language plpgsql;

drop trigger if exists trg_payments_customer_totals on payments;
create trigger trg_payments_customer_totals
after insert or update or delete on payments
for each row execute function update_customer_totals_from_payment();

-- Backfill: older Cash/UPI jobs created before payments were auto-recorded have
-- no payment row. They were fully paid by definition, so add a payment for the
-- full amount (dated to the job's creation, so it doesn't inflate today's income).
-- Idempotent: only touches jobs that currently have no payment.
insert into payments (job_id, amount, payment_type, payment_date, notes)
select j.id, j.total_amount, j.payment_type, j.created_at, 'Backfill: paid at creation'
from jobs j
where j.payment_type in ('Cash','UPI')
  and j.deleted_at is null
  and j.total_amount > 0
  and not exists (select 1 from payments p where p.job_id = j.id);

-- ============================================================
-- 9. ROLES & PROFILES
--    Each login is either 'owner' (full access) or 'employee'
--    (read-only job board only — no money details).
-- ============================================================
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner','employee')),
  created_at timestamptz default now()
);

alter table profiles enable row level security;
drop policy if exists "profiles_read_own" on profiles;
create policy "profiles_read_own" on profiles
  for select to authenticated using (id = auth.uid());

-- Every existing login becomes an owner (the shop's original account)
insert into profiles (id, role)
  select id, 'owner' from auth.users
on conflict (id) do nothing;

-- NOTE: we deliberately do NOT put a trigger on auth.users — such triggers can
-- cause "Database error creating new user". Existing logins are backfilled above;
-- new logins get their profile from the assignment command at the bottom of this
-- file. (These two lines remove the old trigger if a previous run added it.)
drop trigger if exists trg_auth_user_created on auth.users;
drop function if exists handle_new_user();

-- Helper: is the current user an owner?
create or replace function is_owner()
returns boolean as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'owner');
$$ language sql security definer stable;

-- ============================================================
-- 10. ROW LEVEL SECURITY  (owner-only on all business tables)
--     Employees cannot read these at all; they use job_board.
-- ============================================================
alter table customers enable row level security;
alter table jobs enable row level security;
alter table payments enable row level security;
alter table expenses enable row level security;
alter table job_types enable row level security;
alter table daily_summary enable row level security;

do $$
declare
  t text;
begin
  for t in select unnest(array['customers','jobs','payments','expenses','job_types','daily_summary'])
  loop
    execute format('drop policy if exists "allow_all_authenticated" on %I', t);
    execute format('drop policy if exists "owner_all" on %I', t);
    execute format(
      'create policy "owner_all" on %I for all to authenticated using (is_owner()) with check (is_owner())',
      t
    );
  end loop;
end$$;

-- ============================================================
-- 11. EMPLOYEE JOB BOARD  (safe columns only — NO money)
--     Mirror table kept in sync by triggers; holds only active
--     jobs (not delivered, not deleted). Readable by everyone
--     logged in; written only by the triggers below.
-- ============================================================
create table if not exists job_board (
  id uuid primary key,
  job_id text,
  customer_name text,
  customer_contact text,
  job_type text,
  custom_job_type text,
  paper_size text,
  custom_paper_size text,
  flex_width text,
  flex_height text,
  flex_unit text,
  quantity integer,
  status text,
  delivery_date date,
  delivery_time text,
  is_urgent boolean default false,
  assigned_to text,
  notes text,
  created_at timestamptz
);

create index if not exists idx_job_board_delivery on job_board (delivery_date);
alter table job_board add column if not exists assigned_to text;
alter table job_board add column if not exists delivery_time text;

alter table job_board enable row level security;
drop policy if exists "job_board_read" on job_board;
create policy "job_board_read" on job_board
  for select to authenticated using (true);

-- Sync one job into / out of the board
create or replace function sync_job_board()
returns trigger as $$
declare
  cust customers%rowtype;
begin
  if tg_op = 'DELETE' then
    delete from job_board where id = old.id;
    return old;
  end if;

  -- only active work (Pending / In Progress) stays on the board.
  -- Ready for Pickup and Delivered are considered done and leave the board.
  if new.deleted_at is null and new.status in ('Pending', 'In Progress') then
    select * into cust from customers where id = new.customer_id;
    insert into job_board (
      id, job_id, customer_name, customer_contact, job_type, custom_job_type,
      paper_size, custom_paper_size, flex_width, flex_height, flex_unit,
      quantity, status, delivery_date, delivery_time, is_urgent, assigned_to, notes, created_at
    ) values (
      new.id, new.job_id, cust.name, cust.contact, new.job_type, new.custom_job_type,
      new.paper_size, new.custom_paper_size, new.flex_width, new.flex_height, new.flex_unit,
      new.quantity, new.status, new.delivery_date, new.delivery_time, new.is_urgent, new.assigned_to, new.notes, new.created_at
    )
    on conflict (id) do update set
      job_id = excluded.job_id,
      customer_name = excluded.customer_name,
      customer_contact = excluded.customer_contact,
      job_type = excluded.job_type,
      custom_job_type = excluded.custom_job_type,
      paper_size = excluded.paper_size,
      custom_paper_size = excluded.custom_paper_size,
      flex_width = excluded.flex_width,
      flex_height = excluded.flex_height,
      flex_unit = excluded.flex_unit,
      quantity = excluded.quantity,
      status = excluded.status,
      delivery_date = excluded.delivery_date,
      delivery_time = excluded.delivery_time,
      is_urgent = excluded.is_urgent,
      assigned_to = excluded.assigned_to,
      notes = excluded.notes,
      created_at = excluded.created_at;
  else
    delete from job_board where id = new.id;  -- ready/delivered/deleted -> clear from board
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_sync_job_board on jobs;
create trigger trg_sync_job_board
after insert or update or delete on jobs
for each row execute function sync_job_board();

-- Keep customer name/number on the board fresh if the customer is edited
create or replace function sync_job_board_customer()
returns trigger as $$
begin
  update job_board
    set customer_name = new.name, customer_contact = new.contact
    where id in (select id from jobs where customer_id = new.id);
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_sync_job_board_customer on customers;
create trigger trg_sync_job_board_customer
after update on customers
for each row execute function sync_job_board_customer();

-- Backfill the board from existing active jobs
insert into job_board (
  id, job_id, customer_name, customer_contact, job_type, custom_job_type,
  paper_size, custom_paper_size, flex_width, flex_height, flex_unit,
  quantity, status, delivery_date, delivery_time, is_urgent, assigned_to, notes, created_at
)
select j.id, j.job_id, c.name, c.contact, j.job_type, j.custom_job_type,
       j.paper_size, j.custom_paper_size, j.flex_width, j.flex_height, j.flex_unit,
       j.quantity, j.status, j.delivery_date, j.delivery_time, j.is_urgent, j.assigned_to, j.notes, j.created_at
from jobs j left join customers c on c.id = j.customer_id
where j.deleted_at is null and j.status in ('Pending', 'In Progress')
on conflict (id) do nothing;

-- Remove any board rows that are no longer active (e.g. Ready for Pickup / Delivered)
delete from job_board where status not in ('Pending', 'In Progress');

-- Enable realtime so employee boards update instantly
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'job_board'
  ) then
    alter publication supabase_realtime add table job_board;
  end if;
end$$;

-- ============================================================
-- DONE. Logins (Authentication -> Users -> Add User):
--   1. Owner login (already created) — full access.
--   2. Employee login (shared on shop computers). After creating it, run
--      this (creates the profile row AND sets the role in one go):
--        insert into profiles (id, role)
--          select id, 'employee' from auth.users where email = 'EMPLOYEE_EMAIL_HERE'
--        on conflict (id) do update set role = 'employee';
-- ============================================================
