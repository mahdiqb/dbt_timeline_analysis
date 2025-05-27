with source as (
    select * from {{ source('ecommerce', 'orders') }}
),

orders as (
    select
        -- ids
        order_id,
        customer_id,
        
        -- timestamps
        cast(order_date as date) as order_date,
        
        -- order properties
        status,
        {{ cents_to_dollars('total_amount_cents') }} as total_amount,
        {{ cents_to_dollars('shipping_amount_cents') }} as shipping_amount,
        {{ cents_to_dollars('tax_amount_cents') }} as tax_amount,
        
        -- metadata
        created_at,
        updated_at
    
    from source
)

select * from orders
