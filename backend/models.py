from pydantic import BaseModel, Field
from typing import List, Optional, Tuple
from datetime import datetime

class DbtProject(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    createdAt: Optional[datetime] = None

class ModelExecutionWithDetails(BaseModel):
    modelExecutionId: str
    modelName: str
    database: str
    schema_name: str = Field(alias="schema")
    dependencies: List[str]
    startTime: datetime
    endTime: datetime
    duration: int  # in milliseconds
    executionTimeStatus: str  # 'success', 'warning', 'danger'

class TimelineData(BaseModel):
    project: DbtProject
    executions: List[ModelExecutionWithDetails]
    timeExtent: Tuple[datetime, datetime]