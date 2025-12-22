"use client";

import React, { useMemo } from "react";
import { FileItem } from "@/lib/cache";
import { CELEBRITY_DATA, getFilesForCelebrity } from "@/lib/celebrity-data";
import { Button } from "@/components/ui/button";
import {
  BarChart3,
  FileText,
  HardDrive,
  Calendar,
  Zap,
} from "lucide-react";

interface Stats {
  totalFiles: number;
  totalSize: number;
  averageFileSize: number;
  medianFileSize: number;
  largestFile: { name: string; size: number };
  smallestFile: { name: string; size: number };
  topPeople: { name: string; count: number }[];
  totalPeopleRecognized: number;
  filesByYear: { year: number; count: number }[];
  fileSizeRanges: { range: string; count: number }[];
  mostRecentUpload: string;
}

function calculateStats(files: FileItem[]): Stats {
  const topPeople: { [key: string]: number } = {};
  const filesByYear: { [key: number]: number } = {};
  const fileSizeRanges: { [key: string]: number } = {
    "0-1MB": 0,
    "1-10MB": 0,
    "10-50MB": 0,
    "50-100MB": 0,
    "100MB+": 0,
  };
  
  let totalSize = 0;
  let largestFile = { name: "", size: 0 };
  let smallestFile = { name: files[0]?.key || "", size: files[0]?.size || 0 };
  let mostRecentUpload = "";

  // Process each file
  files.forEach((file) => {
    const size = file.size || 0;
    totalSize += size;

    // Track largest and smallest files
    if (size > largestFile.size) {
      largestFile = { name: file.key, size };
    }
    if (size < smallestFile.size && size > 0) {
      smallestFile = { name: file.key, size };
    }

    // Track most recent upload
    if (file.uploaded) {
      if (!mostRecentUpload || new Date(file.uploaded) > new Date(mostRecentUpload)) {
        mostRecentUpload = file.uploaded;
      }
    }

    // Categorize by file size
    const sizeInMB = size / (1024 * 1024);
    if (sizeInMB < 1) fileSizeRanges["0-1MB"]++;
    else if (sizeInMB < 10) fileSizeRanges["1-10MB"]++;
    else if (sizeInMB < 50) fileSizeRanges["10-50MB"]++;
    else if (sizeInMB < 100) fileSizeRanges["50-100MB"]++;
    else fileSizeRanges["100MB+"]++;

    // Count files by year
    if (file.uploaded) {
      const year = new Date(file.uploaded).getFullYear();
      filesByYear[year] = (filesByYear[year] || 0) + 1;
    }
  });

  // Count people recognized in files (based on filtered files)
  const fileKeys = new Set(files.map(f => f.key));
  
  CELEBRITY_DATA.forEach((celeb) => {
    // Count how many of the filtered files this celebrity appears in
    const celebFiles = getFilesForCelebrity(celeb.name, 99);
    const count = celebFiles.filter((f) => fileKeys.has(f)).length;
    if (count > 0) {
      topPeople[celeb.name] = count;
    }
  });

  // Sort and get top items
  const sortedPeople = Object.entries(topPeople)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const sortedYears = Object.entries(filesByYear)
    .map(([year, count]) => ({ year: parseInt(year), count }))
    .sort((a, b) => a.year - b.year);

  const sortedSizeRanges = Object.entries(fileSizeRanges)
    .map(([range, count]) => ({ range, count }))
    .filter((item) => item.count > 0);

  const averageFileSize = files.length > 0 ? totalSize / files.length : 0;

  // Calculate median
  const fileSizes = files.map((f) => f.size || 0).sort((a, b) => a - b);
  const medianFileSize =
    fileSizes.length > 0
      ? fileSizes.length % 2 === 0
        ? (fileSizes[fileSizes.length / 2 - 1] +
            fileSizes[fileSizes.length / 2]) /
          2
        : fileSizes[Math.floor(fileSizes.length / 2)]
      : 0;

  const uniquePeople = Object.keys(topPeople).length;

  return {
    totalFiles: files.length,
    totalSize,
    averageFileSize,
    medianFileSize,
    largestFile,
    smallestFile,
    topPeople: sortedPeople,
    totalPeopleRecognized: uniquePeople,
    filesByYear: sortedYears,
    fileSizeRanges: sortedSizeRanges,
    mostRecentUpload,
  };
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
}

function StatCard({
  icon: Icon,
  label,
  value,
  subtext,
}: {
  icon: React.ComponentType<{ className: string }>;
  label: string;
  value: string | number;
  subtext?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 sm:p-6 h-full">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-2 text-xl sm:text-2xl font-bold text-foreground line-clamp-2">
            {value}
          </p>
          {subtext && (
            <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
              {subtext}
            </p>
          )}
        </div>
        <div className="flex-shrink-0 rounded-lg bg-accent p-2 sm:p-3">
          <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-accent-foreground" />
        </div>
      </div>
    </div>
  );
}

function BarItem({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color?: string;
}) {
  const percentage = (value / max) * 100;
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <p className="text-sm text-foreground truncate">{label}</p>
        <p className="text-sm font-medium text-muted-foreground">{value}</p>
      </div>
      <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
        <div
          className={`h-full ${
            color || "bg-primary"
          } rounded-full transition-all duration-300`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

export function StatisticsDashboard({ 
  files, 
  allFiles,
  hasActiveFilter,
}: { 
  files: FileItem[];
  allFiles?: FileItem[];
  hasActiveFilter?: boolean;
}) {
  const [showFiltered, setShowFiltered] = React.useState(false);
  const stats = useMemo(() => calculateStats(files), [files]);
  const globalStats = useMemo(() => allFiles ? calculateStats(allFiles) : null, [allFiles]);

  return (
    <div className="w-full space-y-6 sm:space-y-8">
      {/* Header with Tabs */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground">
              Statistics
            </h2>
          </div>
          {hasActiveFilter && globalStats && (
            <div className="flex gap-2">
              <Button
                onClick={() => setShowFiltered(false)}
                variant={!showFiltered ? "default" : "outline"}
                size="sm"
                className="cursor-pointer"
              >
                Global
              </Button>
              <Button
                onClick={() => setShowFiltered(true)}
                variant={showFiltered ? "default" : "outline"}
                size="sm"
                className="cursor-pointer"
              >
                Gefiltert
              </Button>
            </div>
          )}
        </div>
        <p className="text-sm sm:text-base text-muted-foreground">
          {showFiltered ? "Analysis of filtered files" : "Comprehensive analysis of the file collection"}
        </p>
      </div>

      {/* Use filtered or global stats depending on selection */}
      {showFiltered && globalStats ? (
        renderStatistics(stats, files.length, true)
      ) : (
        renderStatistics(globalStats || stats, (globalStats && !showFiltered) ? (allFiles?.length || files.length) : files.length, false)
      )}
    </div>
  );
}

function renderStatistics(stats: Stats, filesCount: number, isFiltered: boolean = false) {
  return (
    <div className="w-full space-y-6 sm:space-y-8">
      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          icon={FileText}
          label="Total files"
          value={stats.totalFiles.toLocaleString()}
        />
        <StatCard
          icon={HardDrive}
          label="Total size"
          value={formatBytes(stats.totalSize)}
          subtext={`Avg ${formatBytes(stats.averageFileSize)}`}
        />
        <StatCard
          icon={Calendar}
          label="Last update"
          value={stats.mostRecentUpload ? formatDate(stats.mostRecentUpload) : "N/A"}
        />
      </div>

      {/* File Size Statistics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
        <div className="rounded-lg border border-border bg-card p-4 sm:p-6">
          <h3 className="text-lg sm:text-xl font-semibold text-foreground mb-4">
            File size metrics
          </h3>
          <div className="space-y-3">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Average</p>
              <p className="text-xl font-bold text-foreground">
                {formatBytes(stats.averageFileSize)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Median</p>
              <p className="text-xl font-bold text-foreground">
                {formatBytes(stats.medianFileSize)}
              </p>
            </div>
            <div className="pt-3 border-t border-border">
              <p className="text-sm text-muted-foreground mb-1">Largest file</p>
              <p className="text-sm font-mono text-foreground truncate">
                {stats.largestFile.name}
              </p>
              <p className="text-lg font-bold text-foreground">
                {formatBytes(stats.largestFile.size)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Smallest file</p>
              <p className="text-sm font-mono text-foreground truncate">
                {stats.smallestFile.name}
              </p>
              <p className="text-lg font-bold text-foreground">
                {formatBytes(stats.smallestFile.size)}
              </p>
            </div>
          </div>
        </div>

        {/* File Size Distribution */}
        <div className="rounded-lg border border-border bg-card p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-5 h-5 text-primary" />
            <h3 className="text-lg sm:text-xl font-semibold text-foreground">
              Size distribution
            </h3>
          </div>
          <div className="space-y-4">
            {stats.fileSizeRanges.length > 0 ? (
              stats.fileSizeRanges.map((item, idx) => (
                <BarItem
                  key={item.range}
                  label={item.range}
                  value={item.count}
                  max={Math.max(...stats.fileSizeRanges.map((r) => r.count))}
                  color={
                    ["bg-primary", "bg-purple-500", "bg-blue-500", "bg-green-500", "bg-orange-500"][
                      idx % 5
                    ]
                  }
                />
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                No data available
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <div className="rounded-lg bg-accent/10 border border-accent/20 p-4 sm:p-6">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-accent-foreground">Note:</span>{" "}
          These statistics are based on {stats.totalFiles.toLocaleString()} {filesCount === 1 ? "file" : "files"} and update in real time.
        </p>
      </div>
    </div>
  );
}
