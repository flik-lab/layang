"use client";

import type { CSSProperties } from "react";
import {
  ArrowUp,
  ArrowUpDown,
  BookOpen,
  Braces,
  CardSim,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleStop,
  CircleX,
  ClipboardList,
  Copy,
  Download as DownloadIcon,
  FileCodeCorner,
  FileText,
  Folder as FolderIcon,
  FolderOpen as FolderOpenIcon,
  GripVertical as GripVerticalIcon,
  Filter,
  Gauge,
  Globe2,
  GitBranch,
  GitCommitHorizontal,
  GitCompareArrows,
  RefreshCw,
  RotateCcw,
  CloudDownload,
  CloudUpload,
  ShieldCheck,
  Check,
  Hammer,
  History as HistoryIcon,
  Minus,
  Monitor,
  MoreHorizontal,
  Moon,
  PanelBottom as PanelBottomIcon,
  PanelRight as PanelRightIcon,
  Pencil,
  Pin,
  Play,
  Plus,
  Podcast,
  RadioTower,
  Search as SearchIcon,
  Settings2,
  Square,
  Sun,
  Trash2,
  Upload,
  ExternalLink,
  CircleCheckBig,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type IconProps = {
  fontSize?: "small" | "medium" | "large" | number;
  color?: "primary" | "secondary" | "disabled" | "error" | "warning" | string;
  sx?: CSSProperties & Record<string, unknown>;
  className?: string;
};

function createCompatIcon(Icon: LucideIcon) {
  return function CompatIcon({ fontSize = "medium", color, sx, className }: IconProps) {
    const size = typeof fontSize === "number" ? fontSize : fontSize === "small" ? 16 : fontSize === "large" ? 22 : 18;
    const style: CSSProperties = {
      width: sx?.fontSize ?? size,
      height: sx?.fontSize ?? size,
      ...sx,
    };
    delete (style as Record<string, unknown>).mr;
    if (sx?.mr) style.marginRight = typeof sx.mr === "number" ? sx.mr * 8 : String(sx.mr);
    return (
      <Icon
        aria-hidden="true"
        className={cn(
          "shrink-0",
          color === "primary" && "text-primary",
          color === "secondary" && "text-emerald-500",
          color === "disabled" && "text-muted-foreground opacity-60",
          color === "error" && "text-destructive",
          color === "warning" && "text-amber-500",
          className,
        )}
        style={style}
      />
    );
  };
}

/**
 * Single place to review or change the app icon mapping.
 * Keys are the compatibility icon names used across the workbench;
 * values are the Lucide symbol names rendered by this file.
 */
export const iconSourceMap = {
  Add: "Plus",
  Api: "Braces",
  DocsIcon: "BookOpen",
  ExampleIcon: "ClipboardList",
  Edit: "Pencil",
  ProtoIcon: "FileCodeCorner",
  KeyboardArrowDown: "ChevronDown",
  KeyboardArrowLeft: "ChevronLeft",
  KeyboardArrowRight: "ChevronRight",
  KeyboardArrowUp: "ArrowUp",
  Close: "X",
  ContentCopy: "Copy",
  CropSquare: "Square",
  DarkMode: "Moon",
  Delete: "Trash2",
  Description: "FileText",
  DesktopWindows: "Monitor",
  Download: "Download",
  FilterAlt: "Filter",
  Folder: "Folder",
  FolderOpen: "FolderOpen",
  GripVertical: "GripVertical",
  History: "History",
  Language: "Globe2",
  LightMode: "Sun",
  MoreHoriz: "MoreHorizontal",
  OpenInNew: "ExternalLink",
  PlayArrow: "Play",
  PushPin: "Pin",
  Remove: "Minus",
  Schema: "CardSim",
  Search: "Search",
  Settings: "Settings2",
  Build: "Hammer",
  CheckCircle: "CircleCheckBig",
  ErrorIcon: "CircleX",
  Speed: "Gauge",
  Storage: "FileCodeCorner",
  StopCircle: "CircleStop",
  Stream: "Podcast",
  MockServer: "RadioTower",
  PanelBottom: "PanelBottom",
  PanelRight: "PanelRight",
  Terminal: "ArrowUpDown",
  UploadFile: "Upload",
  SourceControl: "GitBranch",
  GitCommit: "GitCommitHorizontal",
  GitDiff: "GitCompareArrows",
  Refresh: "RefreshCw",
  Restore: "RotateCcw",
  Pull: "CloudDownload",
  Push: "CloudUpload",
  ShieldCheck: "ShieldCheck",
  Check: "Check",
} as const;

export const Add = createCompatIcon(Plus);
export const Api = createCompatIcon(Braces);
export const DocsIcon = createCompatIcon(BookOpen);
export const ExampleIcon = createCompatIcon(ClipboardList);
export const Edit = createCompatIcon(Pencil);
export const ProtoIcon = createCompatIcon(FileCodeCorner);
export const KeyboardArrowDown = createCompatIcon(ChevronDown);
export const KeyboardArrowLeft = createCompatIcon(ChevronLeft);
export const KeyboardArrowRight = createCompatIcon(ChevronRight);
export const KeyboardArrowUp = createCompatIcon(ArrowUp);
export const Close = createCompatIcon(X);
export const ContentCopy = createCompatIcon(Copy);
export const CropSquare = createCompatIcon(Square);
export const DarkMode = createCompatIcon(Moon);
export const Delete = createCompatIcon(Trash2);
export const Description = createCompatIcon(FileText);
export const DesktopWindows = createCompatIcon(Monitor);
export const Download = createCompatIcon(DownloadIcon);
export const FilterAlt = createCompatIcon(Filter);
export const Folder = createCompatIcon(FolderIcon);
export const FolderOpen = createCompatIcon(FolderOpenIcon);
export const GripVertical = createCompatIcon(GripVerticalIcon);
export const History = createCompatIcon(HistoryIcon);
export const Language = createCompatIcon(Globe2);
export const LightMode = createCompatIcon(Sun);
export const MoreHoriz = createCompatIcon(MoreHorizontal);
export const OpenInNew = createCompatIcon(ExternalLink);
export const PlayArrow = createCompatIcon(Play);
export const PushPin = createCompatIcon(Pin);
export const Remove = createCompatIcon(Minus);
export const Schema = createCompatIcon(CardSim);
export const Search = createCompatIcon(SearchIcon);
export const Settings = createCompatIcon(Settings2);
export const Build = createCompatIcon(Hammer);
export const CheckCircle = createCompatIcon(CircleCheckBig);
export const ErrorIcon = createCompatIcon(CircleX);
export const Speed = createCompatIcon(Gauge);
export const Storage = createCompatIcon(FileCodeCorner);
export const StopCircle = createCompatIcon(CircleStop);
export const Stream = createCompatIcon(Podcast);
export const MockServer = createCompatIcon(RadioTower);
export const PanelBottom = createCompatIcon(PanelBottomIcon);
export const PanelRight = createCompatIcon(PanelRightIcon);
export const Terminal = createCompatIcon(ArrowUpDown);
export const UploadFile = createCompatIcon(Upload);
export const SourceControl = createCompatIcon(GitBranch);
export const GitCommit = createCompatIcon(GitCommitHorizontal);
export const GitDiff = createCompatIcon(GitCompareArrows);
export const Refresh = createCompatIcon(RefreshCw);
export const Restore = createCompatIcon(RotateCcw);
export const Pull = createCompatIcon(CloudDownload);
export const Push = createCompatIcon(CloudUpload);
export const ShieldCheckIcon = createCompatIcon(ShieldCheck);
export const CheckIcon = createCompatIcon(Check);
