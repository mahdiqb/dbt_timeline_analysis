import os
import glob
import re
import yaml
import json
import psycopg2
import psycopg2.extras
from datetime import datetime, timedelta
from flask import Flask, render_template, request, jsonify, send_from_directory

app = Flask(__name__)

def get_dbt_file_content(file_path):
    """Get the content of a dbt SQL or YML file."""
    # Prepend the dbt_project path if not already included
    if not file_path.startswith('dbt_project/'):
        full_path = os.path.join('dbt_project', file_path)
    else:
        full_path = file_path
        
    if not os.path.exists(full_path):
        return None
    
    with open(full_path, 'r') as f:
        content = f.read()
    
    return content

def get_yml_file_info(file_path):
    """Extract information from a YML file."""
    if not os.path.exists(file_path):
        return {}
    
    with open(file_path, 'r') as f:
        try:
            yml_content = yaml.safe_load(f)
            return yml_content
        except Exception as e:
            print(f"Error parsing YML file {file_path}: {e}")
            return {}

def get_project_structure():
    """Build the dbt project structure."""
    project_structure = {
        'models': {},
        'macros': {},
        'tests': {},
        'analyses': {},
        'seeds': {}
    }
    
    # Process models with their layers
    model_dirs = [d for d in glob.glob('dbt_project/models/*') if os.path.isdir(d)]
    for model_dir in model_dirs:
        layer_name = os.path.basename(model_dir)
        project_structure['models'][layer_name] = {}
        
        # Look for subdirectories (domains)
        domain_dirs = [d for d in glob.glob(f'{model_dir}/*') if os.path.isdir(d)]
        
        # If there are subdirectories, process them
        if domain_dirs:
            for domain_dir in domain_dirs:
                domain_name = os.path.basename(domain_dir)
                project_structure['models'][layer_name][domain_name] = []
                
                # Get SQL files in the domain directory
                sql_files = glob.glob(f'{domain_dir}/*.sql')
                for sql_file in sql_files:
                    model_name = os.path.basename(sql_file).replace('.sql', '')
                    project_structure['models'][layer_name][domain_name].append(model_name)
        else:
            # No subdirectories, just SQL files
            project_structure['models'][layer_name] = []
            sql_files = glob.glob(f'{model_dir}/*.sql')
            for sql_file in sql_files:
                model_name = os.path.basename(sql_file).replace('.sql', '')
                project_structure['models'][layer_name].append(model_name)
    
    # Process macros
    macro_files = glob.glob('dbt_project/macros/*.sql')
    for macro_file in macro_files:
        macro_name = os.path.basename(macro_file).replace('.sql', '')
        project_structure['macros'][macro_name] = macro_file
    
    # Process tests
    test_dirs = [d for d in glob.glob('dbt_project/tests/*') if os.path.isdir(d)]
    for test_dir in test_dirs:
        test_type = os.path.basename(test_dir)
        project_structure['tests'][test_type] = []
        
        test_files = glob.glob(f'{test_dir}/*.sql')
        for test_file in test_files:
            test_name = os.path.basename(test_file).replace('.sql', '')
            project_structure['tests'][test_type].append(test_name)
    
    # Process analyses
    analysis_files = glob.glob('dbt_project/analyses/*.sql')
    for analysis_file in analysis_files:
        analysis_name = os.path.basename(analysis_file).replace('.sql', '')
        project_structure['analyses'][analysis_name] = analysis_file
    
    return project_structure

def extract_model_dependencies():
    """Extract model dependencies by parsing SQL files."""
    dependencies = {}
    
    # Get all SQL files in the models directory
    model_files = glob.glob('dbt_project/models/**/*.sql', recursive=True)
    
    for model_file in model_files:
        model_name = os.path.basename(model_file).replace('.sql', '')
        dependencies[model_name] = []
        
        with open(model_file, 'r') as f:
            content = f.read()
            
            # Look for ref() function calls
            ref_matches = re.findall(r"ref\s*\(\s*['\"]([^'\"]+)['\"]", content)
            dependencies[model_name].extend([m for m in ref_matches if m != model_name])
            
            # Look for source() function calls
            source_matches = re.findall(r"source\s*\(\s*['\"]([^'\"]+)['\"]", content)
            if source_matches:
                # Mark sources with 'source:' prefix
                dependencies[model_name].extend([f"source:{m}" for m in source_matches])
    
    return dependencies

def get_dbt_artifacts_info():
    """Get information about dbt_artifacts package configuration."""
    artifacts_info = {}
    
    # Check for dbt_artifacts in packages.yml
    packages = get_yml_file_info('dbt_project/packages.yml')
    artifacts_configured = False
    
    if 'packages' in packages:
        for package in packages['packages']:
            if 'brooklyn-data/dbt_artifacts' in package.get('package', ''):
                artifacts_configured = True
                artifacts_info['package_version'] = package.get('version', 'Unknown')
                break
    
    artifacts_info['configured'] = artifacts_configured
    
    # Check for dbt_artifacts configuration in dbt_project.yml
    project = get_yml_file_info('dbt_project/dbt_project.yml')
    
    # Check on-run-start hooks
    if 'on-run-start' in project:
        for hook in project['on-run-start']:
            if 'dbt_artifacts.upload_dbt_artifacts' in hook:
                artifacts_info['on_run_start_hook'] = True
    
    # Check on-run-end hooks
    if 'on-run-end' in project:
        for hook in project['on-run-end']:
            if 'dbt_artifacts.upload_dbt_artifacts' in hook:
                artifacts_info['on_run_end_hook'] = True
    
    # Check models config
    if 'models' in project and 'dbt_artifacts' in project['models']:
        artifacts_info['models_configured'] = True
    
    return artifacts_info

@app.route('/')
def index():
    # Get project structure
    project_structure = get_project_structure()
    
    # Get dbt_artifacts info
    artifacts_info = get_dbt_artifacts_info()
    
    # Get dbt_project.yml info
    project_info = get_yml_file_info('dbt_project/dbt_project.yml')
    project_name = project_info.get('name', 'Unknown')
    project_version = project_info.get('version', 'Unknown')
    
    return render_template('index.html', 
                          project_structure=project_structure, 
                          project_name=project_name,
                          project_version=project_version,
                          artifacts_info=artifacts_info)

@app.route('/file/<path:file_path>')
def view_file(file_path):
    # Safety check to prevent directory traversal
    normalized_path = os.path.normpath(file_path)
    if normalized_path.startswith('..'):
        return "Access denied", 403
    
    # Replace forward slashes with OS-specific separator
    file_path = os.path.join(*normalized_path.split('/'))
    
    # Get file content
    content = get_dbt_file_content(file_path)
    if content is None:
        return "File not found", 404
    
    file_name = os.path.basename(file_path)
    file_type = os.path.splitext(file_name)[1].lower()
    
    # Process YML files for better display
    if file_type == '.yml':
        try:
            yml_content = yaml.safe_load(content)
            yml_pretty = yaml.dump(yml_content, default_flow_style=False, sort_keys=False)
            content = yml_pretty
        except:
            pass
    
    return render_template('file_view.html', 
                          file_path=file_path, 
                          file_name=file_name,
                          file_type=file_type,
                          content=content)

@app.route('/dependencies')
def dependencies():
    # Extract model dependencies
    dependencies = extract_model_dependencies()
    
    return render_template('dependencies.html', 
                          dependencies=dependencies)

@app.route('/macros')
def macros():
    # Get project structure
    project_structure = get_project_structure()
    macros = project_structure['macros']
    
    return render_template('macros.html', 
                          macros=macros)

@app.route('/static/<path:path>')
def send_static(path):
    return send_from_directory('static', path)

# Removed timeline route - consolidated with advanced-timeline

@app.route('/advanced-timeline')
def advanced_timeline():
    """Advanced timeline visualization with all enhanced features."""
    project_info = get_yml_file_info('dbt_project/dbt_project.yml')
    project_name = project_info.get('name', 'dbt Project')
    return render_template('advanced_timeline.html', project_name=project_name)

@app.route('/api/real-timeline-data')
def real_timeline_data():
    """API endpoint to get real historical timeline data from dbt_artifacts."""
    try:
        # Connect to database
        conn = psycopg2.connect(os.environ.get('DATABASE_URL'))
        cursor = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
        
        # Query model execution data from dbt_artifacts
        query = """
        WITH latest_runs AS (
            SELECT DISTINCT invocation_id, run_started_at::timestamp as run_time
            FROM dbt_artifacts.model_executions 
            ORDER BY run_started_at DESC 
            LIMIT 5
        ),
        model_performance AS (
            SELECT 
                me.name,
                me.schema,
                me.execution_time,
                me.status,
                lr.run_time,
                ROW_NUMBER() OVER (PARTITION BY me.name ORDER BY lr.run_time DESC) as run_rank
            FROM dbt_artifacts.model_executions me
            JOIN latest_runs lr ON me.invocation_id = lr.invocation_id
            WHERE me.execution_time IS NOT NULL
        )
        SELECT 
            name,
            schema,
            AVG(execution_time) as avg_execution_time,
            MAX(execution_time) as max_execution_time,
            MIN(execution_time) as min_execution_time,
            COUNT(*) as run_count,
            ARRAY_AGG(execution_time ORDER BY run_time DESC) as historical_times,
            ARRAY_AGG(run_time ORDER BY run_time DESC) as historical_dates,
            MAX(CASE WHEN run_rank = 1 THEN execution_time END) as latest_execution_time,
            MAX(CASE WHEN run_rank = 1 THEN status END) as latest_status
        FROM model_performance
        GROUP BY name, schema
        ORDER BY avg_execution_time DESC;
        """
        
        cursor.execute(query)
        results = cursor.fetchall()
        
        # Transform results into timeline format
        timeline_data = []
        for row in results:
            # Determine layer from schema or name
            layer = 'staging' if 'staging' in row['schema'] or row['name'].startswith('stg_') else \
                   'intermediate' if 'intermediate' in row['schema'] or row['name'].startswith('int_') else \
                   'marts' if 'marts' in row['schema'] or row['name'].startswith(('dim_', 'fct_', 'mart_')) else \
                   'staging'
            
            # Determine performance status
            latest_time = float(row['latest_execution_time'] or 0)
            avg_time = float(row['avg_execution_time'] or 0)
            
            if latest_time > 5.0:
                performance_status = 'critical'
            elif latest_time > 2.0:
                performance_status = 'slow'
            elif latest_time < avg_time * 0.8:
                performance_status = 'fast'
            else:
                performance_status = 'normal'
            
            timeline_data.append({
                'id': row['name'],
                'name': row['name'],
                'layer': layer,
                'executionTime': float(latest_time or 0),
                'avgExecutionTime': float(avg_time or 0),
                'maxExecutionTime': float(row['max_execution_time'] or 0),
                'minExecutionTime': float(row['min_execution_time'] or 0),
                'runCount': int(row['run_count'] or 0),
                'historicalTimes': [float(t) for t in (row['historical_times'] or []) if t is not None][:5],
                'historicalDates': [d.isoformat() if d else None for d in (row['historical_dates'] or [])][:5],
                'status': row['latest_status'] or 'success',
                'performanceStatus': performance_status,
                'description': f"Model from {row['schema']} schema",
                'rowsProcessed': int(row['rows_affected']) if row.get('rows_affected') else None,
                'costUSD': None  # Would need warehouse-specific cost data
            })
        
        cursor.close()
        conn.close()
        
        return jsonify({
            'success': True,
            'data': timeline_data,
            'message': f'Found {len(timeline_data)} models with execution history'
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e),
            'message': 'Could not retrieve historical data from dbt_artifacts'
        }), 500

@app.route('/api/timeline_data')
def timeline_data():
    """API endpoint to get data for the timeline visualization."""
    try:
        # Database connection string from environment variables
        db_url = os.environ.get('DATABASE_URL')
        
        # Connect to the database
        conn = psycopg2.connect(db_url)
        cursor = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
        
        # Get invocation data
        cursor.execute("""
        SELECT * FROM artifacts.dbt_invocations 
        ORDER BY run_started_at DESC LIMIT 1
        """)
        invocation = dict(cursor.fetchone())
        
        # Convert datetime objects to ISO format strings for JSON serialization
        invocation['run_started_at'] = invocation['run_started_at'].isoformat() if invocation['run_started_at'] else None
        invocation['run_completed_at'] = invocation['run_completed_at'].isoformat() if invocation['run_completed_at'] else None
        
        # Get model data
        cursor.execute("""
        SELECT * FROM artifacts.dbt_models
        ORDER BY schema_name, model_name
        """)
        models = [dict(row) for row in cursor.fetchall()]
        
        # Get model execution data
        cursor.execute("""
        SELECT * FROM artifacts.dbt_model_executions
        WHERE invocation_id = %s
        ORDER BY schema_name, model_name
        """, (invocation['invocation_id'],))
        executions = [dict(row) for row in cursor.fetchall()]
        
        # Process datetime objects for JSON serialization
        for execution in executions:
            execution['executed_at'] = execution['executed_at'].isoformat() if execution['executed_at'] else None
        
        # Get model dependencies
        # Let's use the unnest function directly on the PostgreSQL array
        cursor.execute("""
        SELECT 
            md.model as target_model,
            split_part(md.model, '.', 1) as target_schema,
            split_part(md.model, '.', 2) as target_model_name,
            unnest(md.depends_on) as source_model,
            split_part(unnest(md.depends_on), '.', 1) as source_schema,
            split_part(unnest(md.depends_on), '.', 2) as source_model_name
        FROM artifacts.dbt_model_dependencies md
        ORDER BY target_model, source_model
        """)
        dependencies = [dict(row) for row in cursor.fetchall()]
        
        # Close the database connection
        cursor.close()
        conn.close()
        
        # Create the response data structure
        data = {
            'invocation': invocation,
            'models': models,
            'executions': executions,
            'dependencies': dependencies
        }
        
        return jsonify(data)
    
    except Exception as e:
        print(f"Error getting timeline data: {e}")
        
        # If the database query fails, create demo data for visualization
        # This ensures the visualization still works even without real artifact data
        demo_data = create_demo_timeline_data()
        return jsonify(demo_data)

# Removed demo data function - using real dbt_artifacts data
    
    # Create model data across all three layers
    models = []
    executions = []
    dependencies = []
    
    # Define model groups for our three-layer architecture
    model_groups = [
        {
            'schema_name': 'staging',
            'models': [
                {'model_name': 'stg_ecommerce__customers', 'execution_time': 0.5},
                {'model_name': 'stg_ecommerce__products', 'execution_time': 0.4},
                {'model_name': 'stg_ecommerce__orders', 'execution_time': 0.6},
                {'model_name': 'stg_ecommerce__order_items', 'execution_time': 0.4}
            ]
        },
        {
            'schema_name': 'intermediate',
            'models': [
                {'model_name': 'int_customer_orders', 'execution_time': 1.2},
                {'model_name': 'int_order_items_products', 'execution_time': 0.8}
            ]
        },
        {
            'schema_name': 'marts',
            'models': [
                {'model_name': 'dim_customers', 'execution_time': 0.4},
                {'model_name': 'dim_products', 'execution_time': 0.3},
                {'model_name': 'fct_orders', 'execution_time': 1.5},
                {'model_name': 'mart_customer_orders', 'execution_time': 1.1}
            ]
        }
    ]
    
    # Generate model data
    execution_start = run_started_at
    for group in model_groups:
        schema_name = group['schema_name']
        
        for model_info in group['models']:
            model_name = model_info['model_name']
            execution_time = model_info['execution_time']
            
            # Add model metadata
            models.append({
                'model_name': model_name,
                'schema_name': schema_name,
                'materialization': 'view',
                'description': f"Description for {model_name}",
                'tags': [schema_name]
            })
            
            # Add execution data with staggered times
            execution_start = execution_start + timedelta(seconds=0.5)
            executions.append({
                'model_name': model_name,
                'schema_name': schema_name,
                'invocation_id': invocation['invocation_id'],
                'materialization': 'view',
                'execution_time': execution_time,
                'status': 'success',
                'rows_affected': 10,
                'executed_at': execution_start.isoformat()
            })
    
    # Define dependencies between models
    dependency_definitions = [
        # Staging models depend on raw data
        {'source_schema': 'raw_data', 'source_model': 'customers', 'target_schema': 'staging', 'target_model': 'stg_ecommerce__customers'},
        {'source_schema': 'raw_data', 'source_model': 'products', 'target_schema': 'staging', 'target_model': 'stg_ecommerce__products'},
        {'source_schema': 'raw_data', 'source_model': 'orders', 'target_schema': 'staging', 'target_model': 'stg_ecommerce__orders'},
        {'source_schema': 'raw_data', 'source_model': 'order_items', 'target_schema': 'staging', 'target_model': 'stg_ecommerce__order_items'},
        
        # Intermediate models depend on staging models
        {'source_schema': 'staging', 'source_model': 'stg_ecommerce__orders', 'target_schema': 'intermediate', 'target_model': 'int_customer_orders'},
        {'source_schema': 'staging', 'source_model': 'stg_ecommerce__customers', 'target_schema': 'intermediate', 'target_model': 'int_customer_orders'},
        {'source_schema': 'staging', 'source_model': 'stg_ecommerce__order_items', 'target_schema': 'intermediate', 'target_model': 'int_customer_orders'},
        {'source_schema': 'staging', 'source_model': 'stg_ecommerce__order_items', 'target_schema': 'intermediate', 'target_model': 'int_order_items_products'},
        {'source_schema': 'staging', 'source_model': 'stg_ecommerce__products', 'target_schema': 'intermediate', 'target_model': 'int_order_items_products'},
        
        # Marts models depend on intermediate and staging models
        {'source_schema': 'staging', 'source_model': 'stg_ecommerce__customers', 'target_schema': 'marts', 'target_model': 'dim_customers'},
        {'source_schema': 'staging', 'source_model': 'stg_ecommerce__products', 'target_schema': 'marts', 'target_model': 'dim_products'},
        {'source_schema': 'intermediate', 'source_model': 'int_customer_orders', 'target_schema': 'marts', 'target_model': 'fct_orders'},
        {'source_schema': 'staging', 'source_model': 'stg_ecommerce__orders', 'target_schema': 'marts', 'target_model': 'fct_orders'},
        {'source_schema': 'intermediate', 'source_model': 'int_order_items_products', 'target_schema': 'marts', 'target_model': 'fct_orders'},
        {'source_schema': 'marts', 'source_model': 'dim_customers', 'target_schema': 'marts', 'target_model': 'mart_customer_orders'},
        {'source_schema': 'marts', 'source_model': 'fct_orders', 'target_schema': 'marts', 'target_model': 'mart_customer_orders'},
        {'source_schema': 'staging', 'source_model': 'stg_ecommerce__orders', 'target_schema': 'marts', 'target_model': 'mart_customer_orders'}
    ]
    
    # Add dependencies
    for dep in dependency_definitions:
        dependencies.append({
            'source_schema': dep['source_schema'],
            'source_model': dep['source_model'],
            'target_schema': dep['target_schema'],
            'target_model': dep['target_model'],
            'source_model': f"{dep['source_schema']}.{dep['source_model']}",
            'target_model': f"{dep['target_schema']}.{dep['target_model']}"
        })
    
    # Compile the final demo data structure
    return {
        'invocation': invocation,
        'models': models,
        'executions': executions,
        'dependencies': dependencies
    }

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)