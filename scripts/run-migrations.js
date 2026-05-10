#!/usr/bin/env node

/**
 * Migration runner for Supabase
 * This script applies pending migrations to the Supabase database
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://ymtdrtmmqyhjvhrjyuoo.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InltdGRydG1tcXloanZocmp5dW9vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODA5MDQ2NSwiZXhwIjoyMDkzNjY2NDY1fQ.Pp_zOTD3ssjCGHsRUJniMFDPmXzVpk-qnNzEetWk9Qk';

const migrationSQL = `
CREATE TABLE IF NOT EXISTS public.user_daily_roadmap (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users(id) on delete cascade,
  logged_date     date not null,                          
  task_id         text not null,                          
  task_title      text not null,                          
  activity_type   text not null,                          
  duration_min    integer not null default 30,            
  estimated_kcal  integer not null default 0,             
  is_custom       boolean default false,                  
  is_removed      boolean default false,                  
  is_completed    boolean default false,                  
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

ALTER TABLE public.user_daily_roadmap ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own roadmap" ON public.user_daily_roadmap;
CREATE POLICY "Users manage own roadmap"
  ON public.user_daily_roadmap FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS user_daily_roadmap_user_date ON public.user_daily_roadmap (user_id, logged_date);
CREATE INDEX IF NOT EXISTS user_daily_roadmap_user_task ON public.user_daily_roadmap (user_id, task_id);
`;

console.log('⚠️  Manual migration required!');
console.log('');
console.log('Since Supabase REST API does not support executing raw SQL,');
console.log('please manually run the migration using the Supabase dashboard:');
console.log('');
console.log('1. Visit: https://app.supabase.com/project/ymtdrtmmqyhjvhrjyuoo/sql/new');
console.log('2. Paste the following SQL:');
console.log('');
console.log('-------------------------------------------');
console.log(migrationSQL);
console.log('-------------------------------------------');
console.log('');
console.log('3. Click "Run" to execute the migration');
console.log('');
console.log('After applying the migration, the roadmap API will work correctly.');
