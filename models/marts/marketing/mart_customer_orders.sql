with customers as (
    select * from {{ ref('dim_customers') }}
),

orders as (
    select * from {{ ref('fct_orders') }}
),

customer_order_summary as (
    select
        customer_id,
        count(order_id) as order_count,
        min(order_date) as first_order_date,
        max(order_date) as most_recent_order_date,
        sum(total_amount) as total_spend,
        sum(total_items) as total_items_purchased,
        avg(total_amount) as average_order_value,
        sum(items_total_profit) as total_profit_generated
    from orders
    group by 1
),

final as (
    select
        -- customer info
        customers.customer_id,
        customers.first_name,
        customers.last_name,
        customers.full_name,
        customers.email,
        customers.created_at as customer_created_at,
        
        -- order metrics
        customer_order_summary.order_count,
        customer_order_summary.first_order_date,
        customer_order_summary.most_recent_order_date,
        
        -- Calculate days since last order
        datediff(
            'day', 
            customer_order_summary.most_recent_order_date, 
            current_date()
        ) as days_since_last_order,
        
        -- Calculate customer lifetime in days
        datediff(
            'day', 
            customers.created_at, 
            current_date()
        ) as customer_lifetime_days,
        
        -- Financial metrics
        customer_order_summary.total_spend,
        customer_order_summary.total_items_purchased,
        customer_order_summary.average_order_value,
        customer_order_summary.total_profit_generated,
        
        -- Segmentation
        case
            when customer_order_summary.order_count = 1 then 'New Customer'
            when customer_order_summary.order_count > 1 and 
                 datediff('day', customer_order_summary.most_recent_order_date, current_date()) <= 90 
                 then 'Active Repeat Customer'
            when customer_order_summary.order_count > 1 and 
                 datediff('day', customer_order_summary.most_recent_order_date, current_date()) > 90 
                 then 'Lapsed Repeat Customer'
            else 'Unknown'
        end as customer_segment,
        
        -- Value tier based on total spend
        case
            when customer_order_summary.total_spend < 100 then 'Low Value'
            when customer_order_summary.total_spend >= 100 and 
                 customer_order_summary.total_spend < 500 then 'Medium Value'
            when customer_order_summary.total_spend >= 500 then 'High Value'
            else 'Unknown'
        end as customer_value_tier
        
    from customers
    left join customer_order_summary on customers.customer_id = customer_order_summary.customer_id
)

select * from final
