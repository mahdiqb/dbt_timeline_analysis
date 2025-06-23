import asyncpg
import logging
from typing import List, Optional
from datetime import datetime, timedelta
from models import DbtProject, ModelExecutionWithDetails, TimelineData
from config_loader import config_loader

logger = logging.getLogger(__name__)

class DatabaseService:
    def __init__(self):
        db_config = config_loader.get_database_config()
        self.database_url = db_config['url']
        self.schema = db_config['schema']
        
        if not self.database_url:
            raise ValueError("DATABASE_URL is required in config.yaml or environment variables")
    
    async def get_connection(self):
        return await asyncpg.connect(self.database_url)
    
    async def get_all_projects(self) -> List[DbtProject]:
        conn = await self.get_connection()
        try:
            rows = await conn.fetch(f"SELECT id, name, description, created_at FROM {self.schema}.dbt_projects ORDER BY id")
            return [DbtProject(
                id=row['id'],
                name=row['name'],
                description=row['description'],
                createdAt=row['created_at']
            ) for row in rows]
        finally:
            await conn.close()
    
    async def get_project(self, project_id: int) -> Optional[DbtProject]:
        conn = await self.get_connection()
        try:
            row = await conn.fetchrow(f"SELECT id, name, description, created_at FROM {self.schema}.dbt_projects WHERE id = $1", project_id)
            if row:
                return DbtProject(
                    id=row['id'],
                    name=row['name'],
                    description=row['description'],
                    createdAt=row['created_at']
                )
            return None
        finally:
            await conn.close()
    
    async def get_executions_by_project_and_date(self, project_id: int, date: str) -> List[ModelExecutionWithDetails]:
        conn = await self.get_connection()
        try:
            start_of_day = datetime.fromisoformat(f"{date}T00:00:00")
            end_of_day = datetime.fromisoformat(f"{date}T23:59:59")
            
            rows = await conn.fetch(f"""
                SELECT m.model_execution_id, m.name as model_name, m.database, m.schema,
                       m.depends_on_nodes, e.run_started_at, e.total_node_runtime
                FROM {self.schema}.dim_dbt__models m
                INNER JOIN {self.schema}.fct_dbt__model_executions e ON m.model_execution_id = e.model_execution_id
                WHERE e.run_started_at >= $1 AND e.run_started_at < $2
                ORDER BY e.run_started_at
            """, start_of_day, end_of_day)
            
            executions = []
            for row in rows:
                duration_ms = int(float(row['total_node_runtime']) * 1000)
                start_time = row['run_started_at']
                end_time = start_time + timedelta(milliseconds=duration_ms)
                duration_minutes = duration_ms // (1000 * 60)
                
                execution_time_status = (
                    'success' if duration_minutes < 5 else
                    'warning' if duration_minutes < 15 else
                    'danger'
                )
                
                executions.append(ModelExecutionWithDetails(
                    modelExecutionId=row['model_execution_id'],
                    modelName=row['model_name'],
                    database=row['database'],
                    schema=row['schema'],
                    dependencies=row['depends_on_nodes'] or [],
                    startTime=start_time,
                    endTime=end_time,
                    duration=duration_ms,
                    executionTimeStatus=execution_time_status
                ))
            
            return executions
        finally:
            await conn.close()
    
    async def get_timeline_data(self, project_id: int, date: str) -> TimelineData:
        project = await self.get_project(project_id)
        if not project:
            raise ValueError(f"Project with id {project_id} not found")
        
        executions = await self.get_executions_by_project_and_date(project_id, date)
        
        if executions:
            all_times = [time for exec in executions for time in [exec.startTime, exec.endTime]]
            time_extent = (min(all_times), max(all_times))
        else:
            # Use timezone-naive datetime to match the database data
            base_time = datetime.fromisoformat(f"{date}T00:00:00")
            time_extent = (base_time, base_time + timedelta(days=1))
        
        return TimelineData(
            project=project,
            executions=executions,
            timeExtent=time_extent
        )