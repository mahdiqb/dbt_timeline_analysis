import { useMemo, useState } from "react";
import { formatDuration } from "@/lib/utils";
import { TimeRangeSlider } from "./time-range-slider";
// Type definitions
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

interface DbtProject {
  id: number;
  name: string;
  description: string | null;
  createdAt: string | null;
}

interface TimelineData {
  project: DbtProject;
  executions: ModelExecutionWithDetails[];
  timeExtent: [string, string];
}

const formatTime = (date: Date | string): string => {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
};

interface TimelineVisualizationProps {
  data: TimelineData;
}

interface TimelineRow {
  modelName: string;
  execution: ModelExecutionWithDetails;
  startPercent: number;
  widthPercent: number;
  dependencies: string[];
}

export function TimelineVisualization({ data }: TimelineVisualizationProps) {
  const [hoveredModel, setHoveredModel] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{
    visible: boolean;
    content: any;
    x: number;
    y: number;
  }>({ visible: false, content: null, x: 0, y: 0 });
  
  // Time range state for slider functionality
  const fullTimeExtent = data.timeExtent;
  const [visibleTimeRange, setVisibleTimeRange] = useState<[Date, Date]>([
    new Date(fullTimeExtent[0]), 
    new Date(fullTimeExtent[1])
  ]);

  const timelineRows = useMemo(() => {
    if (!data.executions.length) return [];

    const [visibleStart, visibleEnd] = visibleTimeRange;
    const visibleStartMs = visibleStart.getTime();
    const visibleEndMs = visibleEnd.getTime();
    const totalDuration = visibleEndMs - visibleStartMs;

    // Filter and adjust executions that are visible in the current time range
    const visibleExecutions = data.executions.filter(execution => {
      const execStartTime = execution.startTime instanceof Date ? execution.startTime.getTime() : new Date(execution.startTime).getTime();
      const execEndTime = execution.endTime instanceof Date ? execution.endTime.getTime() : new Date(execution.endTime).getTime();
      // Show execution if it overlaps with visible range
      return execEndTime >= visibleStartMs && execStartTime <= visibleEndMs;
    });

    return visibleExecutions.map((execution): TimelineRow => {
      const execStartTime = execution.startTime instanceof Date ? execution.startTime.getTime() : new Date(execution.startTime).getTime();
      const execEndTime = execution.endTime instanceof Date ? execution.endTime.getTime() : new Date(execution.endTime).getTime();
      
      // Clamp execution times to visible range
      const clampedStart = Math.max(execStartTime, visibleStartMs);
      const clampedEnd = Math.min(execEndTime, visibleEndMs);
      
      const start = clampedStart - visibleStartMs;
      const duration = clampedEnd - clampedStart;

      return {
        modelName: execution.modelName,
        execution,
        startPercent: (start / totalDuration) * 100,
        widthPercent: Math.max((duration / totalDuration) * 100, 0.5), // Minimum width for visibility
        dependencies: execution.dependencies
      };
    });
  }, [data, visibleTimeRange]);

  const getExecutionTimeColor = (status: 'success' | 'warning' | 'danger') => {
    switch (status) {
      case 'success': return 'bg-green-500';
      case 'warning': return 'bg-yellow-500';
      case 'danger': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getConnectedModels = (modelName: string) => {
    const dependencies = new Set<string>();
    const dependents = new Set<string>();
    
    timelineRows.forEach(row => {
      if (row.modelName === modelName) {
        row.dependencies.forEach(dep => dependencies.add(dep));
      }
      if (row.dependencies.includes(modelName)) {
        dependents.add(row.modelName);
      }
    });
    
    return { dependencies, dependents };
  };

  const timeMarkers = useMemo(() => {
    if (!data.executions.length) return [];
    
    const [visibleStart, visibleEnd] = visibleTimeRange;
    const duration = visibleEnd.getTime() - visibleStart.getTime();
    
    const markers = [];
    
    // Dynamic interval based on visible duration and zoom level
    let intervalMinutes;
    const fullDuration = new Date(fullTimeExtent[1]).getTime() - new Date(fullTimeExtent[0]).getTime();
    const zoomFactor = fullDuration / duration;
    
    if (duration <= 30 * 60 * 1000) { // <= 30 minutes
      intervalMinutes = 5; // 5 minutes
    } else if (duration <= 2 * 60 * 60 * 1000) { // <= 2 hours
      intervalMinutes = 15; // 15 minutes
    } else if (duration <= 6 * 60 * 60 * 1000) { // <= 6 hours  
      intervalMinutes = 30; // 30 minutes
    } else {
      intervalMinutes = 60; // 1 hour
    }
    
    const current = new Date(visibleStart);
    // Round down to nearest interval
    current.setMinutes(Math.floor(current.getMinutes() / intervalMinutes) * intervalMinutes, 0, 0);
    
    while (current <= visibleEnd) {
      const percent = ((current.getTime() - visibleStart.getTime()) / duration) * 100;
      if (percent >= 0 && percent <= 100) {
        markers.push({
          time: new Date(current),
          percent
        });
      }
      current.setMinutes(current.getMinutes() + intervalMinutes);
    }
    
    return markers;
  }, [visibleTimeRange, fullTimeExtent]);

  return (
    <div className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      {/* Time Range Slider */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 px-8 py-4">
        <TimeRangeSlider
          timeExtent={[new Date(fullTimeExtent[0]), new Date(fullTimeExtent[1])]}
          onTimeRangeChange={(range) => setVisibleTimeRange(range)}
        />
      </div>
      
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
              {data.project.name} dbt Pipeline Timeline
            </h2>
            <p className="text-slate-600 dark:text-slate-400 mt-1">
              {formatTime(visibleTimeRange[0])} - {formatTime(visibleTimeRange[1])}
              {visibleTimeRange[0].getTime() !== new Date(fullTimeExtent[0]).getTime() || 
               visibleTimeRange[1].getTime() !== new Date(fullTimeExtent[1]).getTime() ? (
                <span className="ml-2 text-blue-600 dark:text-blue-400 text-sm">
                  (Zoomed View)
                </span>
              ) : null}
            </p>
          </div>
          <div className="flex items-center space-x-6 text-sm">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-emerald-500 rounded-sm"></div>
              <span className="text-slate-700 dark:text-slate-300">&lt; 5 min</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-amber-500 rounded-sm"></div>
              <span className="text-slate-700 dark:text-slate-300">5-15 min</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-red-500 rounded-sm"></div>
              <span className="text-slate-700 dark:text-slate-300">&gt; 15 min</span>
            </div>
          </div>
        </div>
      </div>

      {/* Timeline Content */}
      <div className="w-full overflow-x-auto">
        <div className="flex flex-col min-w-full">
          {/* Time axis */}
          <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 px-8 py-3">
            <div className="relative h-8 flex">
              <div className="w-80 flex-shrink-0"></div>
              <div className="flex-1 relative">
                {timeMarkers.map((marker, index) => (
                  <div
                    key={index}
                    className="absolute flex flex-col items-center"
                    style={{ left: `${marker.percent}%` }}
                  >
                    <div className="w-px h-4 bg-slate-300 dark:bg-slate-600"></div>
                    <span className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {formatTime(marker.time)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Model rows */}
          <div className="relative timeline-container">
            {/* Dependency lines connecting node edges */}
            <svg 
              className="absolute inset-0 pointer-events-none overflow-visible w-full h-full" 
              style={{ zIndex: 4 }}
            >
              <defs>
                <marker
                  id="dependency-arrow"
                  markerWidth="8"
                  markerHeight="6"
                  refX="7"
                  refY="3"
                  orient="auto"
                >
                  <polygon
                    points="0 0, 8 3, 0 6"
                    fill="rgb(59 130 246)"
                  />
                </marker>
              </defs>
              {timelineRows.map((row, targetIndex) => 
                row.dependencies.map((depName, depIndex) => {
                  const depRow = timelineRows.find(r => r.modelName === depName);
                  const sourceIndex = timelineRows.findIndex(r => r.modelName === depName);
                  if (!depRow || sourceIndex === -1) return null;

                  const isHighlighted = hoveredModel === row.modelName || hoveredModel === depName;
                  
                  // Calculate positions to connect bar edges precisely
                  const rowHeight = 65; // Row height including gap
                  
                  // Get the timeline container element to calculate real positions
                  const timelineContainer = document.querySelector('.timeline-container');
                  const modelColumnWidth = 320; // Width of model name column (w-80 = 320px)
                  const timelinePadding = 16; // px-4 = 16px
                  
                  // Use actual container width or fallback
                  const containerRect = timelineContainer?.getBoundingClientRect();
                  const availableWidth = containerRect ? containerRect.width - modelColumnWidth - (timelinePadding * 2) : 800;
                  
                  // Source position: right edge of upstream execution bar
                  const sourceY = sourceIndex * rowHeight + 32; // Center of source row
                  const sourceBarEndPercent = depRow.startPercent + depRow.widthPercent;
                  const sourceX = modelColumnWidth + timelinePadding + (sourceBarEndPercent * availableWidth / 100);
                  
                  // Target position: left edge of downstream execution bar  
                  const targetY = targetIndex * rowHeight + 32; // Center of target row
                  const targetX = modelColumnWidth + timelinePadding + (row.startPercent * availableWidth / 100);
                  
                  // Control points for smooth curve
                  const controlOffset = Math.min(Math.abs(targetX - sourceX) * 0.4, 100);
                  const verticalOffset = Math.abs(targetY - sourceY) * 0.2;

                  return (
                    <path
                      key={`${depName}-${row.modelName}-${depIndex}`}
                      d={`M ${sourceX} ${sourceY} 
                          C ${sourceX + controlOffset} ${sourceY + verticalOffset}, 
                            ${targetX - controlOffset} ${targetY - verticalOffset}, 
                            ${targetX} ${targetY}`}
                      stroke="rgb(59 130 246)"
                      strokeWidth={isHighlighted ? "3" : "2"}
                      fill="none"
                      opacity={isHighlighted ? "0.9" : "0.6"}
                      markerEnd="url(#dependency-arrow)"
                      className="transition-all duration-200"
                      strokeDasharray={isHighlighted ? "none" : "5,5"}
                    />
                  );
                })
              )}
            </svg>

            <div className="space-y-px bg-slate-200 dark:bg-slate-700 w-full">
              {timelineRows.map((row, index) => {
                const { dependencies, dependents } = getConnectedModels(row.modelName);
                const isHighlighted = hoveredModel === row.modelName ||
                  (hoveredModel && (dependencies.has(hoveredModel) || dependents.has(hoveredModel)));

                return (
                  <div
                    key={`${row.execution.modelExecutionId}-${index}`}
                    className={`bg-white dark:bg-slate-800 transition-all duration-200 ${
                      isHighlighted ? 'bg-blue-50 dark:bg-blue-950/30 shadow-lg' : ''
                    } w-full`}
                    onMouseEnter={() => setHoveredModel(row.modelName)}
                    onMouseLeave={() => setHoveredModel(null)}
                  >
                    <div className="flex items-center h-16 w-full">
                      {/* Model name column */}
                      <div className="w-80 flex-shrink-0 px-8 py-4 border-r border-slate-200 dark:border-slate-700">
                        <div className="flex items-center space-x-3">
                          <div className={`w-2 h-2 rounded-full ${getExecutionTimeColor(row.execution.executionTimeStatus)}`}></div>
                          <div className="flex-1">
                            <div className="font-semibold text-slate-900 dark:text-white">
                              {row.modelName}
                            </div>
                            <div className="flex items-center space-x-2 text-xs text-slate-500 dark:text-slate-400">
                              <span>{formatDuration(row.execution.duration)}</span>
                              {row.dependencies.length > 0 && (
                                <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded">
                                  {row.dependencies.length} deps
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Timeline column */}
                      <div className="flex-1 px-4 py-4 relative min-w-0">
                        <div className="relative h-8 bg-slate-100 dark:bg-slate-700 rounded-lg overflow-visible w-full">
                          {/* Execution bar */}
                          <div
                            className={`absolute top-0 h-full ${getExecutionTimeColor(row.execution.executionTimeStatus)} 
                              transition-all duration-300 hover:shadow-lg hover:scale-y-110 rounded-lg
                              cursor-pointer group flex items-center justify-center text-white text-xs font-medium px-2 execution-bar`}
                            style={{
                              left: `${row.startPercent}%`,
                              width: `${Math.max(row.widthPercent, 1)}%`,
                              minWidth: '4px'
                            }}
                            data-model-name={row.modelName}
                            onMouseEnter={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              setTooltip({
                                visible: true,
                                content: {
                                  modelName: row.modelName,
                                  execution: row.execution,
                                  dependencies: Array.from(dependencies),
                                  dependents: Array.from(dependents)
                                },
                                x: rect.left + rect.width / 2,
                                y: rect.top - 10
                              });
                            }}
                            onMouseLeave={() => {
                              setTooltip(prev => ({ ...prev, visible: false }));
                            }}
                          >
                            <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg"></div>
                            <div className="relative z-10 text-center leading-tight overflow-hidden">
                              <div className="truncate font-semibold">{row.modelName}</div>
                              <div className="text-xs opacity-90">{formatDuration(row.execution.duration)}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Time axis at bottom */}
          <div className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 px-8 py-4">
            <div className="relative h-12 flex">
              <div className="w-80 flex-shrink-0"></div>
              <div className="flex-1 relative">
                {timeMarkers.map((marker, index) => (
                  <div
                    key={index}
                    className="absolute flex flex-col items-center"
                    style={{ left: `${marker.percent}%` }}
                  >
                    <div className="w-px h-6 bg-slate-400 dark:bg-slate-500"></div>
                    <span className="text-xs text-slate-600 dark:text-slate-400 mt-1 font-medium">
                      {formatTime(marker.time)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tooltip */}
      {tooltip.visible && tooltip.content && (
        <div
          className="fixed bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 
            px-4 py-3 rounded-lg shadow-xl max-w-sm z-50 border border-slate-700 dark:border-slate-300
            pointer-events-none transform -translate-x-1/2 -translate-y-full"
          style={{
            left: tooltip.x,
            top: tooltip.y,
          }}
        >
          <div className="space-y-2">
            <div className="font-semibold text-lg">{tooltip.content.modelName}</div>
            <div className="text-sm space-y-1">
              <div>Start: {formatTime(tooltip.content.execution.startTime)}</div>
              <div>End: {formatTime(tooltip.content.execution.endTime)}</div>
              <div>Duration: {formatDuration(tooltip.content.execution.duration)}</div>
              <div className={`font-medium ${
                tooltip.content.execution.duration < 300000 ? 'text-emerald-400' :
                tooltip.content.execution.duration <= 900000 ? 'text-amber-400' : 'text-red-400'
              }`}>
                Performance: {tooltip.content.execution.duration < 300000 ? 'Fast' :
                           tooltip.content.execution.duration <= 900000 ? 'Moderate' : 'Slow'}
              </div>
              {tooltip.content.dependencies.length > 0 && (
                <div>Dependencies: {tooltip.content.dependencies.join(', ')}</div>
              )}
              {tooltip.content.dependents.length > 0 && (
                <div>Used by: {tooltip.content.dependents.join(', ')}</div>
              )}
            </div>
          </div>
          {/* Tooltip arrow */}
          <div className="absolute top-full left-1/2 transform -translate-x-1/2">
            <div className="w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-slate-900 dark:border-t-slate-100"></div>
          </div>
        </div>
      )}
    </div>
  );
}
