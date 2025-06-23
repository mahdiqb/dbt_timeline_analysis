import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ProjectFilters } from "./components/project-filters";
import { TimelineVisualization } from "./components/timeline-visualization";
import { ThemeToggle } from "./components/theme-toggle";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle } from "lucide-react";
// Type definitions
interface DbtProject {
  id: number;
  name: string;
  description: string | null;
  createdAt: string | null;
}

interface ModelExecutionWithDetails {
  modelExecutionId: string;
  modelName: string;
  database: string;
  schema: string;
  dependencies: string[];
  startTime: string;
  endTime: string;
  duration: number;
  executionTimeStatus: string;
}

interface TimelineData {
  project: DbtProject;
  executions: ModelExecutionWithDetails[];
  timeExtent: [string, string];
}

export default function Timeline() {
  const [selectedProjectId, setSelectedProjectId] = useState<number>(1);
  const [selectedDate, setSelectedDate] = useState<string>("2025-06-22");

  const { 
    data: projects, 
    isLoading: projectsLoading,
    error: projectsError 
  } = useQuery<DbtProject[]>({
    queryKey: ['/api/projects'],
  });

  const { 
    data: timelineData, 
    isLoading: timelineLoading,
    error: timelineError 
  } = useQuery<TimelineData>({
    queryKey: [`/api/timeline/${selectedProjectId}/${selectedDate}`],
    enabled: !!selectedProjectId && !!selectedDate,
  });

  if (projectsError || timelineError) {
    return (
      <div className="min-h-screen bg-white dark:bg-slate-900 p-6">
        <Alert className="max-w-2xl mx-auto">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load data. Please check your connection and try again.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-slate-900">
      <div className="absolute top-4 right-4 z-50">
        <ThemeToggle />
      </div>

      <div className="p-6 space-y-6">
        <div className="max-w-sm">
          {projectsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : projects ? (
            <ProjectFilters
              projects={projects}
              selectedProjectId={selectedProjectId}
              selectedDate={selectedDate}
              onProjectChange={setSelectedProjectId}
              onDateChange={setSelectedDate}
            />
          ) : null}
        </div>

        {timelineLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-96 w-full" />
          </div>
        ) : timelineData ? (
          <TimelineVisualization data={timelineData} />
        ) : null}
      </div>
    </div>
  );
}