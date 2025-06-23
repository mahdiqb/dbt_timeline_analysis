import os
import logging
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

import uvicorn
from database import DatabaseService
from models import TimelineData

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="DBT Timeline API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

db_service = DatabaseService()

@app.get("/api/projects")
async def get_projects():
    try:
        return await db_service.get_all_projects()
    except Exception as e:
        logger.error(f"Error getting projects: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/timeline/{project_id}/{date}", response_model=TimelineData)
async def get_timeline(project_id: int, date: str):
    try:
        return await db_service.get_timeline_data(project_id, date)
    except Exception as e:
        logger.error(f"Error getting timeline data: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/")
async def serve_root():
    return {"message": "DBT Timeline API is running", "endpoints": ["/api/projects", "/api/timeline/{project_id}/{date}"]}

# Note: Static file serving handled by Vite in development

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)