-- Forecast calibration buckets for validating whether Success Forecast probabilities are trustworthy.

create or replace view public.beta_forecast_calibration as
with completed as (
  select
    forecast_score,
    actual_success
  from public.beta_forecast_accuracy_weekly
  where local_date <= current_date - 7
),
bucketed as (
  select
    case
      when forecast_score < 20 then 1
      when forecast_score < 40 then 2
      when forecast_score < 60 then 3
      when forecast_score < 80 then 4
      else 5
    end as bucket_order,
    case
      when forecast_score < 20 then '0-20'
      when forecast_score < 40 then '20-40'
      when forecast_score < 60 then '40-60'
      when forecast_score < 80 then '60-80'
      else '80-100'
    end as forecast_bucket,
    forecast_score,
    actual_success
  from completed
),
aggregated as (
  select
    bucket_order,
    forecast_bucket,
    count(*)::integer as samples,
    round(avg(forecast_score)::numeric, 1) as avg_forecast_score,
    round(avg(case when actual_success then 100 else 0 end)::numeric, 1) as actual_success_rate
  from bucketed
  group by bucket_order, forecast_bucket
)
select
  bucket_order,
  forecast_bucket,
  samples,
  avg_forecast_score,
  actual_success_rate,
  round(abs(avg_forecast_score - actual_success_rate), 1) as calibration_error,
  case
    when samples < 20 then 'insufficient'
    when avg_forecast_score - actual_success_rate >= 15 then 'overconfident'
    when actual_success_rate - avg_forecast_score >= 15 then 'underconfident'
    else 'calibrated'
  end as calibration_status,
  case
    when samples < 20 then 'low'
    when samples < 100 then 'medium'
    else 'high'
  end as confidence_level
from aggregated
order by bucket_order;

alter view public.beta_forecast_calibration set (security_invoker = true);
