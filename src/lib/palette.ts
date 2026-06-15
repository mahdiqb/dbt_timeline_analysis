// Hex values for SVG/canvas fills, kept in sync with styles/tokens.css.

import type { ModelLayer } from "@/types/dbt";
import type { TimelinessStatus } from "./status";

export interface StatusColor {
  fg: string;
  bg: string;
  soft: string;
  label: string;
}

export const STATUS_COLORS: Record<TimelinessStatus, StatusColor> = {
  on_time: { fg: "#1f9d6b", bg: "#e7f5ee", soft: "#b9e3cd", label: "On time" },
  behind: { fg: "#d9912b", bg: "#fbf0db", soft: "#f1d59a", label: "Behind" },
  late: { fg: "#e1463f", bg: "#fce8e7", soft: "#f4b9b6", label: "Late" },
  error: { fg: "#b11f2a", bg: "#f9e3e4", soft: "#e8a9ac", label: "Failed" },
  skipped: { fg: "#7c8090", bg: "#eef0f3", soft: "#cdd1d9", label: "Skipped" },
};

export const LAYER_COLORS: Record<ModelLayer, string> = {
  source: "#8a8f99",
  staging: "#5b8def",
  intermediate: "#9b6dde",
  marts: "#1f9d6b",
};

export const LAYER_LABEL: Record<ModelLayer, string> = {
  source: "Source",
  staging: "Staging",
  intermediate: "Intermediate",
  marts: "Mart",
};

export const BAR_NEUTRAL = "#c7cad2";
export const TYPICAL_BAND = "#e9ebf0";
export const TYPICAL_LINE = "#aab0bd";
export const SLA_LINE = "#e1463f";
export const GRID_LINE = "#eef0f3";
export const AXIS_TEXT = "#8a8f99";
