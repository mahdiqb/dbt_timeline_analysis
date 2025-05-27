with source as (
    select * from {{ source('ecommerce', 'products') }}
),

products as (
    select
        -- ids
        product_id,
        
        -- product properties
        name,
        description,
        category,
        {{ cents_to_dollars('price_cents') }} as price,
        {{ cents_to_dollars('cost_cents') }} as cost,
        {{ cents_to_dollars('price_cents - cost_cents') }} as margin,
        case 
            when price_cents = 0 then null
            else round(((price_cents - cost_cents) / price_cents::float) * 100, 2)
        end as margin_percent,
        inventory_quantity,
        
        -- metadata
        created_at,
        updated_at
    
    from source
)

select * from products
