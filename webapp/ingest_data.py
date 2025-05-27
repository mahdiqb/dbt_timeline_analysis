import os
import psycopg2
from datetime import datetime, timedelta
import random
import sys

def main():
    """Main function to ingest data into our dbt project"""
    # Get database connection info from environment variables
    # Connect with each parameter explicitly
    print("Connecting to database...")
    try:
        conn = psycopg2.connect(
            host=os.environ.get('PGHOST'),
            port=os.environ.get('PGPORT'),
            dbname=os.environ.get('PGDATABASE'),
            user=os.environ.get('PGUSER'),
            password=os.environ.get('PGPASSWORD')
        )
        conn.autocommit = False  # We'll manage transactions manually
        cursor = conn.cursor()
        print("Connected successfully!")
    except Exception as e:
        print(f"Error connecting to database: {e}")
        sys.exit(1)
    
    try:
        # 1. Setup schemas
        print("\nCreating schemas...")
        schemas = ["raw_data", "staging", "intermediate", "marts"]
        for schema in schemas:
            cursor.execute(f"CREATE SCHEMA IF NOT EXISTS {schema}")
        conn.commit()
        print("Schemas created successfully")
        
        # 2. Drop existing tables if they exist (in reverse dependency order)
        print("\nDropping existing tables...")
        tables = [
            "raw_data.order_items",
            "raw_data.orders",
            "raw_data.products",
            "raw_data.customers"
        ]
        
        for table in tables:
            try:
                cursor.execute(f"DROP TABLE IF EXISTS {table} CASCADE")
                conn.commit()
                print(f"Dropped table {table}")
            except Exception as e:
                print(f"Error dropping table {table}: {e}")
                conn.rollback()
        
        # 3. Create tables
        print("\nCreating tables...")
        
        # Customers table
        cursor.execute("""
        CREATE TABLE raw_data.customers (
            customer_id SERIAL PRIMARY KEY,
            first_name VARCHAR(50) NOT NULL,
            last_name VARCHAR(50) NOT NULL,
            email VARCHAR(100) UNIQUE NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
        """)
        
        # Products table
        cursor.execute("""
        CREATE TABLE raw_data.products (
            product_id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            description TEXT,
            category VARCHAR(50),
            price_cents INTEGER NOT NULL,
            cost_cents INTEGER NOT NULL,
            inventory_quantity INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
        """)
        
        # Orders table
        cursor.execute("""
        CREATE TABLE raw_data.orders (
            order_id SERIAL PRIMARY KEY,
            customer_id INTEGER NOT NULL,
            order_date TIMESTAMP NOT NULL,
            status VARCHAR(20) NOT NULL,
            total_amount_cents INTEGER NOT NULL,
            shipping_amount_cents INTEGER NOT NULL,
            tax_amount_cents INTEGER NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
            FOREIGN KEY (customer_id) REFERENCES raw_data.customers(customer_id)
        )
        """)
        
        # Order Items table
        cursor.execute("""
        CREATE TABLE raw_data.order_items (
            order_item_id SERIAL PRIMARY KEY,
            order_id INTEGER NOT NULL,
            product_id INTEGER NOT NULL,
            quantity INTEGER NOT NULL,
            unit_price_cents INTEGER NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
            FOREIGN KEY (order_id) REFERENCES raw_data.orders(order_id),
            FOREIGN KEY (product_id) REFERENCES raw_data.products(product_id)
        )
        """)
        
        conn.commit()
        print("Tables created successfully")
        
        # 4. Insert sample data
        print("\nInserting sample data...")
        
        # Insert customers
        print("Inserting customers...")
        first_names = ['John', 'Jane', 'Michael', 'Emily', 'David', 'Sarah', 'James', 'Emma', 'Robert', 'Olivia']
        last_names = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Miller', 'Davis', 'Garcia', 'Wilson', 'Martinez']
        
        for i in range(1, 51):
            first_name = random.choice(first_names)
            last_name = random.choice(last_names)
            email = f"{first_name.lower()}.{last_name.lower()}{i}@example.com"
            created_at = datetime.now() - timedelta(days=random.randint(1, 365))
            updated_at = created_at + timedelta(days=random.randint(0, 30))
            
            cursor.execute("""
            INSERT INTO raw_data.customers 
            (first_name, last_name, email, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s)
            """, (first_name, last_name, email, created_at, updated_at))
        
        conn.commit()
        print("Inserted 50 customers")
        
        # Insert products
        print("Inserting products...")
        product_categories = ['Electronics', 'Clothing', 'Home', 'Books', 'Toys']
        product_names = [
            'Smartphone', 'Laptop', 'Headphones', 'Tablet', 'Monitor',  # Electronics
            'T-shirt', 'Jeans', 'Sweater', 'Jacket', 'Sneakers',        # Clothing
            'Pillow', 'Blanket', 'Lamp', 'Sofa', 'Chair',               # Home
            'Novel', 'Cookbook', 'Biography', 'Self-help', 'Dictionary' # Books
        ]
        
        for i in range(20):
            name = product_names[i]
            category = product_categories[min(4, i // 5)]
            description = f"This is a description for {name}"
            price_cents = random.randint(1000, 10000) # $10 - $100
            cost_cents = int(price_cents * random.uniform(0.4, 0.8)) # 40-80% of price
            inventory = random.randint(10, 100)
            created_at = datetime.now() - timedelta(days=random.randint(1, 180))
            updated_at = created_at + timedelta(days=random.randint(0, 30))
            
            cursor.execute("""
            INSERT INTO raw_data.products 
            (name, description, category, price_cents, cost_cents, inventory_quantity, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """, (name, description, category, price_cents, cost_cents, inventory, created_at, updated_at))
        
        conn.commit()
        print("Inserted 20 products")
        
        # Create batches of orders for different time periods
        statuses = ['pending', 'processing', 'shipped', 'delivered', 'returned', 'cancelled']
        
        for batch in range(3):
            print(f"Creating batch {batch+1} of orders...")
            time_offset = timedelta(days=30 * batch)
            
            # Generate 30 orders per batch
            for i in range(30):
                # Get a random customer_id (we know we have 50 customers with IDs 1-50)
                cursor.execute("SELECT customer_id FROM raw_data.customers ORDER BY RANDOM() LIMIT 1")
                result = cursor.fetchone()
                customer_id = result[0] if result else None
                
                if not customer_id:
                    print("Error: Could not get customer ID")
                    continue
                
                order_date = datetime.now() - timedelta(days=random.randint(1, 60)) - time_offset
                status = random.choice(statuses)
                
                # Initialize order values
                shipping_cents = random.randint(500, 1500)  # $5 - $15
                
                # Create the order first
                cursor.execute("""
                INSERT INTO raw_data.orders 
                (customer_id, order_date, status, total_amount_cents, shipping_amount_cents, tax_amount_cents, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING order_id
                """, (
                    customer_id, 
                    order_date, 
                    status, 
                    0,  # Temporary total that we'll update later
                    shipping_cents,
                    0,  # Temporary tax that we'll update later
                    order_date,
                    order_date + timedelta(minutes=random.randint(5, 60))
                ))
                
                result = cursor.fetchone()
                order_id = result[0] if result else None
                
                if not order_id:
                    print("Error: Failed to get order_id")
                    continue
                
                # Generate 1-5 order items per order
                num_items = random.randint(1, 5)
                subtotal_cents = 0
                
                # Get random products for this order
                cursor.execute(f"""
                SELECT product_id, price_cents 
                FROM raw_data.products 
                ORDER BY RANDOM() 
                LIMIT {num_items}
                """)
                products = cursor.fetchall()
                
                for product_id, price_cents in products:
                    quantity = random.randint(1, 3)
                    item_total = price_cents * quantity
                    subtotal_cents += item_total
                    
                    cursor.execute("""
                    INSERT INTO raw_data.order_items
                    (order_id, product_id, quantity, unit_price_cents, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    """, (
                        order_id,
                        product_id,
                        quantity,
                        price_cents,
                        order_date,
                        order_date + timedelta(minutes=random.randint(1, 5))
                    ))
                
                # Calculate tax and total for the order
                tax_cents = int(subtotal_cents * 0.08)  # 8% tax
                total_cents = subtotal_cents + shipping_cents + tax_cents
                
                # Update the order with correct totals
                cursor.execute("""
                UPDATE raw_data.orders
                SET total_amount_cents = %s, tax_amount_cents = %s
                WHERE order_id = %s
                """, (total_cents, tax_cents, order_id))
            
            conn.commit()
            print(f"Completed batch {batch+1} with 30 orders")
        
        # 5. Print summary stats
        print("\nData generation summary:")
        
        cursor.execute("SELECT COUNT(*) FROM raw_data.customers")
        result = cursor.fetchone()
        customer_count = result[0] if result else 0
        print(f"Customers: {customer_count}")
        
        cursor.execute("SELECT COUNT(*) FROM raw_data.products")
        result = cursor.fetchone()
        product_count = result[0] if result else 0
        print(f"Products: {product_count}")
        
        cursor.execute("SELECT COUNT(*) FROM raw_data.orders")
        result = cursor.fetchone()
        order_count = result[0] if result else 0
        print(f"Orders: {order_count}")
        
        cursor.execute("SELECT COUNT(*) FROM raw_data.order_items")
        result = cursor.fetchone()
        item_count = result[0] if result else 0
        print(f"Order items: {item_count}")
        
        print("\nData ingestion completed successfully!")
        
    except Exception as e:
        print(f"Error during data ingestion: {e}")
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()
        print("Database connection closed")

if __name__ == "__main__":
    main()