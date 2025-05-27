#!/usr/bin/env python3
import os
import subprocess
import time
from datetime import datetime

def run_command(cmd, description):
    """Run a shell command and print output"""
    print(f"\n{'='*80}")
    print(f"RUNNING: {description}")
    print(f"COMMAND: {cmd}")
    print(f"{'='*80}\n")
    
    start_time = time.time()
    result = subprocess.run(
        cmd, 
        shell=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True
    )
    
    # Print the output
    print(result.stdout)
    
    end_time = time.time()
    
    print(f"\n{'='*80}")
    print(f"COMPLETED: {description}")
    print(f"RETURN CODE: {result.returncode}")
    print(f"EXECUTION TIME: {end_time - start_time:.2f} seconds")
    print(f"{'='*80}\n")
    
    return result.returncode

def run_dbt_cycle(cycle_num):
    """Run a single cycle of data ingestion, dbt models, and dbt_artifacts"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"\n\n{'#'*100}")
    print(f"STARTING CYCLE {cycle_num} AT {timestamp}")
    print(f"{'#'*100}\n")
    
    # 1. Ingest dummy data
    run_command("python ingest_data.py", "Ingesting dummy data into database")
    
    # 2. Run dbt models
    run_command("DBT_PROFILES_DIR=. dbt run", "Running main dbt models")
    
    # 3. Run dbt_artifacts models
    run_command("DBT_PROFILES_DIR=. dbt run --select dbt_artifacts", "Running dbt_artifacts models")
    
    print(f"\n{'#'*100}")
    print(f"CYCLE {cycle_num} COMPLETED AT {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'#'*100}\n")

def main():
    """Run three cycles as requested"""
    # Run each cycle
    for cycle in range(1, 4):
        print(f"\n\n{'*'*100}")
        print(f"EXECUTING CYCLE {cycle} OF 3")
        print(f"{'*'*100}\n")
        
        run_dbt_cycle(cycle)
        
        if cycle < 3:
            # Wait 5 seconds between cycles
            print("Waiting 5 seconds before next cycle...")
            time.sleep(5)
    
    print("All three cycles completed successfully!")

if __name__ == "__main__":
    main()