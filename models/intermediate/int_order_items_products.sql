with order_items as (
    select * from {{ ref('stg_ecommerce__order_items') }}
),

products as (
    select * from {{ ref('stg_ecommerce__products') }}
),

order_items_with_products as (
    select
        -- order item keys
        order_items.order_item_id,
        order_items.order_id,
        
        -- product info
        products.product_id,
        products.name as product_name,
        products.category as product_category,
        
        -- order item details
        order_items.quantity,
        order_items.unit_price,
        order_items.item_total,
        
        -- product cost metrics
        products.cost as unit_cost,
        products.cost * order_items.quantity as item_cost,
        
        -- profitability
        order_items.item_total - (products.cost * order_items.quantity) as item_profit,
        case 
            when order_items.item_total = 0 then null
            else round(((order_items.item_total - (products.cost * order_items.quantity)) / order_items.item_total) * 100, 2)
        end as item_profit_margin
    
    from order_items
    left join products on order_items.product_id = products.product_id
)

select * from order_items_with_products
