{% macro get_date_parts(date_col) %}
    extract(dow from {{ date_col }})::int as day_of_week,
    case
        when extract(dow from {{ date_col }}) = 0 then 'Sunday'
        when extract(dow from {{ date_col }}) = 1 then 'Monday'
        when extract(dow from {{ date_col }}) = 2 then 'Tuesday'
        when extract(dow from {{ date_col }}) = 3 then 'Wednesday'
        when extract(dow from {{ date_col }}) = 4 then 'Thursday'
        when extract(dow from {{ date_col }}) = 5 then 'Friday'
        when extract(dow from {{ date_col }}) = 6 then 'Saturday'
    end as day_of_week_name,
    extract(day from {{ date_col }})::int as day_of_month,
    extract(doy from {{ date_col }})::int as day_of_year,
    extract(week from {{ date_col }})::int as week_of_year,
    extract(month from {{ date_col }})::int as month_number,
    case
        when extract(month from {{ date_col }}) = 1 then 'January'
        when extract(month from {{ date_col }}) = 2 then 'February'
        when extract(month from {{ date_col }}) = 3 then 'March'
        when extract(month from {{ date_col }}) = 4 then 'April'
        when extract(month from {{ date_col }}) = 5 then 'May'
        when extract(month from {{ date_col }}) = 6 then 'June'
        when extract(month from {{ date_col }}) = 7 then 'July'
        when extract(month from {{ date_col }}) = 8 then 'August'
        when extract(month from {{ date_col }}) = 9 then 'September'
        when extract(month from {{ date_col }}) = 10 then 'October'
        when extract(month from {{ date_col }}) = 11 then 'November'
        when extract(month from {{ date_col }}) = 12 then 'December'
    end as month_name,
    extract(quarter from {{ date_col }})::int as quarter,
    extract(year from {{ date_col }})::int as year,
    case
        when extract(dow from {{ date_col }}) in (0, 6) then true
        else false
    end as is_weekend,
    case
        when {{ date_col }} = date_trunc('month', {{ date_col }}) + interval '1 month - 1 day' then true
        else false
    end as is_end_of_month
{% endmacro %}
