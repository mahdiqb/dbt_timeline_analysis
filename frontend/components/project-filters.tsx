import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
interface DbtProject {
  id: number;
  name: string;
  description: string | null;
  createdAt: string | null;
}

interface ProjectFiltersProps {
  projects: DbtProject[];
  selectedProjectId: number;
  selectedDate: string;
  onProjectChange: (projectId: number) => void;
  onDateChange: (date: string) => void;
}

export function ProjectFilters({
  projects,
  selectedProjectId,
  selectedDate,
  onProjectChange,
  onDateChange,
}: ProjectFiltersProps) {
  return (
    <div className="flex items-center space-x-4">
      <div className="flex items-center space-x-2">
        <Label htmlFor="project-select" className="text-sm font-medium text-gray-700">
          Project:
        </Label>
        <Select 
          value={selectedProjectId.toString()} 
          onValueChange={(value) => onProjectChange(parseInt(value))}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Select project" />
          </SelectTrigger>
          <SelectContent>
            {projects.map((project) => (
              <SelectItem key={project.id} value={project.id.toString()}>
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      <div className="flex items-center space-x-2">
        <Label htmlFor="date-select" className="text-sm font-medium text-gray-700">
          Date:
        </Label>
        <Input
          id="date-select"
          type="date"
          value={selectedDate}
          onChange={(e) => onDateChange(e.target.value)}
          className="w-40"
        />
      </div>
    </div>
  );
}
