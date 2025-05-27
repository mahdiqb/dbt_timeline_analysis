with products as (
    select * from {{ ref('stg_ecommerce__products') }}
),

product_order_metrics as (
    select
        product_id,
        sum(quantity) as total_quantity_ordered,
        sum(item_total) as total_revenue,
        sum(item_profit) as total_profit
    from {{ ref('int_order_items_products') }}
    group by 1
),

final as (
    select
        -- product info
        products.product_id,
        products.name,
        products.description,
        products.category,
        products.price,
        products.cost,
        products.margin,
        products.margin_percent,
        products.inventory_quantity,
        
        -- product order metrics
        coalesce(product_order_metrics.total_quantity_ordered, 0) as total_quantity_ordered,
        coalesce(product_order_metrics.total_revenue, 0) as total_revenue,
        coalesce(product_order_metrics.total_profit, 0) as total_profit,
        
        -- timestamps
        products.created_at,
        products.updated_at
        
    from products
    left join product_order_metrics on products.product_id = product_order_metrics.product_id
)

select * from final
