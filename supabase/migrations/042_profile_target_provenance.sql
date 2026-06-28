alter table if exists public.users
  drop constraint if exists users_clinician_target_provenance;

alter table if exists public.users
  add constraint users_clinician_target_provenance
  check (
    clinician_nutrition_targets is null
    or (
      coalesce(clinician_nutrition_targets ->> 'provenance', 'user_reported')
        in ('user_reported', 'provider_verified')
      and coalesce(clinician_nutrition_targets ->> 'verification_status', 'self_attested')
        in ('self_attested', 'verified')
      and (
        coalesce(clinician_nutrition_targets ->> 'verification_status', 'self_attested') <> 'verified'
        or (
          clinician_nutrition_targets ? 'verified_at'
          and clinician_nutrition_targets ? 'verified_by'
          and clinician_nutrition_targets ->> 'provenance' = 'provider_verified'
        )
      )
    )
  );

comment on column public.users.clinician_nutrition_targets is
  'User-reported clinician plans are self_attested. Only trusted provider/admin workflows may persist provider_verified + verified.';
