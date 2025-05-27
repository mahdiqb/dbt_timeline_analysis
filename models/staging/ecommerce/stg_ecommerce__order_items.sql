with source as (
    select * from {{ source('ecommerce', 'order_items') }}
),

order_items as (
    select
        -- ids
        order_item_id,
        order_id,
        product_id,
        
        -- order item properties
        quantity,
        {{ cents_to_dollars('unit_price_cents') }} as unit_price,
        {{ cents_to_dollars('unit_price_cents') }} * quantity as item_total,
        
        -- metadata
        created_at,
        updated_at
    
    from source
)

select * from order_items
