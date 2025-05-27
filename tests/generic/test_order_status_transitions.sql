{% test order_status_transitions(model, column_name, from_status, to_status) %}

/*
This test validates that order status transitions follow the allowed flow.
For example, an order can transition from 'pending' to 'processing', but not from 'delivered' to 'pending'.

Parameters:
    model: The model to test
    column_name: The column containing the status
    from_status: The previous status
    to_status: The current status
*/

with current_status as (
    select
        order_id,
        {{ column_name }} as status,
        updated_at
    from {{ model }}
),

previous_status as (
    select
        order_id,
        {{ column_name }} as status,
        updated_at
    from {{ model }}
),

invalid_transitions as (
    select
        current.order_id,
        previous.status as from_status,
        current.status as to_status
    from current_status as current
    inner join previous_status as previous
        on current.order_id = previous.order_id
        and current.updated_at > previous.updated_at
    where previous.status = '{{ from_status }}'
        and current.status = '{{ to_status }}'
)

select * from invalid_transitions

{% endtest %}
