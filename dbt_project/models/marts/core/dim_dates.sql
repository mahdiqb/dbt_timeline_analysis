{{ config(
    materialized = 'table',
) }}

with date_spine as (
    {% if target.name == 'dev' %}
        -- Use a smaller date range for development
        {{ dbt_utils.date_spine(
            datepart="day",
            start_date="cast('2020-01-01' as date)",
            end_date="cast('2023-12-31' as date)"
        )
        }}
    {% else %}
        -- Use a wider date range for production
        {{ dbt_utils.date_spine(
            datepart="day",
            start_date="cast('2010-01-01' as date)",
            end_date="cast('2030-12-31' as date)"
        )
        }}
    {% endif %}
),

dates as (
    select
        date_day as date_day,
        {{ get_date_parts('date_day') }}
    from date_spine
)

select * from dates
