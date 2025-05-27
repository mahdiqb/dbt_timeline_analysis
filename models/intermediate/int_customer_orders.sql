with customers as (
    select * from {{ ref('stg_ecommerce__customers') }}
),

orders as (
    select * from {{ ref('stg_ecommerce__orders') }}
),

customer_orders as (
    select
        -- customer info
        customers.customer_id,
        customers.first_name,
        customers.last_name,
        customers.email,
        
        -- order info
        orders.order_id,
        orders.order_date,
        orders.status,
        orders.total_amount,
        orders.shipping_amount,
        orders.tax_amount
    
    from customers
    left join orders on customers.customer_id = orders.customer_id
)

select * from customer_orders
