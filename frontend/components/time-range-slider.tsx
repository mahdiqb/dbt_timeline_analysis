import { useState, useEffect } from "react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";

interface TimeRangeSliderProps {
  timeExtent: [Date, Date];
  onTimeRangeChange: (range: [Date, Date]) => void;
  className?: string;
}

export function TimeRangeSlider({ timeExtent, onTimeRangeChange, className }: TimeRangeSliderProps) {
  const [startTime, endTime] = timeExtent;
  const totalDuration = endTime.getTime() - startTime.getTime();
  
  // Convert to percentage values for the slider (0-100)
  const [sliderValues, setSliderValues] = useState([0, 100]);

  // Reset slider when time extent changes
  useEffect(() => {
    setSliderValues([0, 100]);
  }, [startTime.getTime(), endTime.getTime()]);

  const handleSliderChange = (values: number[]) => {
    setSliderValues(values);
    
    // Convert percentage back to actual timestamps
    const rangeStart = new Date(startTime.getTime() + (totalDuration * values[0] / 100));
    const rangeEnd = new Date(startTime.getTime() + (totalDuration * values[1] / 100));
    
    onTimeRangeChange([rangeStart, rangeEnd]);
  };

  // Convert current slider values back to actual dates for display
  const currentStartTime = new Date(startTime.getTime() + (totalDuration * sliderValues[0] / 100));
  const currentEndTime = new Date(startTime.getTime() + (totalDuration * sliderValues[1] / 100));

  const resetToFullRange = () => {
    setSliderValues([0, 100]);
    onTimeRangeChange([startTime, endTime]);
  };

  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  };

  const isFullRange = sliderValues[0] === 0 && sliderValues[1] === 100;

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">Time Range Selector</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={resetToFullRange}
          disabled={isFullRange}
          className="h-8 px-3 text-xs"
        >
          <RotateCcw className="w-3 h-3 mr-1" />
          Reset
        </Button>
      </div>
      
      <div className="px-2">
        <Slider
          value={sliderValues}
          onValueChange={handleSliderChange}
          min={0}
          max={100}
          step={0.1}
          className="w-full"
        />
      </div>
      
      <div className="flex justify-between text-xs text-muted-foreground">
        <span className="font-mono">{formatTime(currentStartTime)}</span>
        <span className="text-primary">→</span>
        <span className="font-mono">{formatTime(currentEndTime)}</span>
      </div>
      
      <div className="flex justify-between items-center text-xs">
        <span className="text-muted-foreground">
          Showing {Math.round(sliderValues[1] - sliderValues[0])}% of timeline
        </span>
        <span className="text-muted-foreground">
          Duration: {Math.round((currentEndTime.getTime() - currentStartTime.getTime()) / (1000 * 60))} min
        </span>
      </div>
    </div>
  );
}