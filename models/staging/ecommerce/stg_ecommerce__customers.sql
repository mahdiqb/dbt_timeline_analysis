with source as (
    select * from {{ source('ecommerce', 'customers') }}
),

customers as (
    select
        -- ids
        customer_id,
        
        -- customer attributes
        first_name,
        last_name,
        concat(first_name, ' ', last_name) as full_name,
        email,
        
        -- metadata
        created_at,
        updated_at
    
    from source
)

select * from customers
