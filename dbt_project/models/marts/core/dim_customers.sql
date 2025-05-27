with customers as (
    select * from {{ ref('stg_ecommerce__customers') }}
),

customer_orders as (
    select
        customer_id,
        min(order_date) as first_order_date,
        max(order_date) as most_recent_order_date,
        count(order_id) as number_of_orders,
        sum(total_amount) as lifetime_value
    from {{ ref('stg_ecommerce__orders') }}
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
        
        -- customer order metrics
        coalesce(customer_orders.first_order_date, null) as first_order_date,
        coalesce(customer_orders.most_recent_order_date, null) as most_recent_order_date,
        coalesce(customer_orders.number_of_orders, 0) as number_of_orders,
        case 
            when customer_orders.number_of_orders > 0 then true
            else false
        end as is_repeat_customer,
        coalesce(customer_orders.lifetime_value, 0) as lifetime_value,
        
        -- timestamps
        customers.created_at,
        customers.updated_at
        
    from customers
    left join customer_orders on customers.customer_id = customer_orders.customer_id
)

select * from final
