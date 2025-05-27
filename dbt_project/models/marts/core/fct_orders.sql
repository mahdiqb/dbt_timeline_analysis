with orders as (
    select * from {{ ref('stg_ecommerce__orders') }}
),

order_items as (
    select * from {{ ref('int_order_items_products') }}
),

order_items_summary as (
    select
        order_id,
        sum(quantity) as total_items,
        sum(item_total) as items_total_amount,
        sum(item_cost) as items_total_cost,
        sum(item_profit) as items_total_profit
    from order_items
    group by 1
),

final as (
    select
        -- order info
        orders.order_id,
        orders.customer_id,
        orders.order_date,
        
        -- date dimensions for easy time analysis
        extract(year from orders.order_date) as order_year,
        extract(month from orders.order_date) as order_month,
        extract(quarter from orders.order_date) as order_quarter,
        extract(dow from orders.order_date) as order_day_of_week,
        
        -- order status
        orders.status,
        
        -- order metrics
        order_items_summary.total_items,
        orders.total_amount,
        orders.shipping_amount,
        orders.tax_amount,
        order_items_summary.items_total_amount,
        order_items_summary.items_total_cost,
        order_items_summary.items_total_profit,
        
        -- timestamps
        orders.created_at,
        orders.updated_at
        
    from orders
    left join order_items_summary on orders.order_id = order_items_summary.order_id
)

select * from final
