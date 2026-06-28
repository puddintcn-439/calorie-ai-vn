alter table if exists public.users
  add column if not exists sensitive_nutrition_mode boolean not null default false;

create table if not exists public.clinical_nutrition_target_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  previous_target jsonb,
  next_target jsonb,
  changed_by uuid,
  changed_at timestamptz not null default now()
);

alter table public.clinical_nutrition_target_audit enable row level security;

drop policy if exists "Users can view own clinical target audit" on public.clinical_nutrition_target_audit;
create policy "Users can view own clinical target audit"
  on public.clinical_nutrition_target_audit for select
  using (auth.uid() = user_id);

create index if not exists clinical_target_audit_user_changed_idx
  on public.clinical_nutrition_target_audit(user_id, changed_at desc);

create or replace function public.audit_clinical_nutrition_target_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.clinician_nutrition_targets is distinct from new.clinician_nutrition_targets then
    insert into public.clinical_nutrition_target_audit (
      user_id,
      previous_target,
      next_target,
      changed_by
    ) values (
      new.id,
      old.clinician_nutrition_targets,
      new.clinician_nutrition_targets,
      auth.uid()
    );
  end if;
  return new;
end;
$$;

drop trigger if exists users_clinical_target_audit on public.users;
create trigger users_clinical_target_audit
  after update of clinician_nutrition_targets on public.users
  for each row execute function public.audit_clinical_nutrition_target_change();
