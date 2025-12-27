"use client";

import { useMemo, useState, useCallback } from "react";
import { Celebrity } from "@/lib/celebrity-data";
import {
  findCelebrityConnections,
  getTopCelebrities,
  CelebrityLink,
} from "@/lib/search-utils";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface NetworkGraphProps {
  celebrities: Celebrity[];
  onSelectCelebrity?: (name: string) => void;
  maxNodes?: number;
}

/**
 * SVG-based network graph showing celebrity connections
 * Renders as an interactive force-directed graph
 */
export function NetworkGraph({
  celebrities,
  onSelectCelebrity,
  maxNodes = 15,
}: NetworkGraphProps) {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  const { nodes, links, topCelebrities } = useMemo(() => {
    const topCelebs = getTopCelebrities(celebrities, maxNodes);
    const topNames = new Set(topCelebs.map((c) => c.name));

    // Find connections between top celebrities only
    const allConnections = findCelebrityConnections(celebrities);
    const filteredLinks = allConnections.filter(
      (link) => topNames.has(link.source) && topNames.has(link.target)
    );

    // Create nodes with positions using a simple circle layout
    const nodePositions = new Map<string, { x: number; y: number }>();
    const centerX = 200;
    const centerY = 200;
    const radius = 150;

    topCelebs.forEach((celeb, index) => {
      const angle = (index / topCelebs.length) * Math.PI * 2;
      nodePositions.set(celeb.name, {
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius,
      });
    });

    return {
      nodes: topCelebs.map((celeb) => ({
        name: celeb.name,
        count: celeb.count,
        position: nodePositions.get(celeb.name)!,
      })),
      links: filteredLinks.map((link) => ({
        ...link,
        sourcePos: nodePositions.get(link.source)!,
        targetPos: nodePositions.get(link.target)!,
      })),
      topCelebrities: topCelebs,
    };
  }, [celebrities, maxNodes]);

  const handleNodeClick = useCallback(
    (name: string) => {
      setSelectedNode(name);
      onSelectCelebrity?.(name);
    },
    [onSelectCelebrity]
  );

  const maxConnections = useMemo(
    () => Math.max(...links.map((l) => l.connections), 1),
    [links]
  );

  // Calculate node size based on appearance count
  const maxCount = Math.max(...nodes.map((n) => n.count), 1);

  return (
    <div className="space-y-4">
      <h3 className="font-semibold">Celebrity Network</h3>

      <div className="bg-secondary/20 rounded-lg p-4">
        <svg width="100%" height="400" viewBox="0 0 400 400" className="bg-background rounded border">
          <defs>
            <marker
              id="arrowhead"
              markerWidth="10"
              markerHeight="10"
              refX="9"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 10 3, 0 6" fill="currentColor" className="text-border" />
            </marker>
          </defs>

          {/* Links/edges */}
          {links.map((link, index) => {
            const strength = link.connections / maxConnections;
            const isRelated =
              !hoveredNode ||
              hoveredNode === link.source ||
              hoveredNode === link.target;

            return (
              <line
                key={index}
                x1={link.sourcePos.x}
                y1={link.sourcePos.y}
                x2={link.targetPos.x}
                y2={link.targetPos.y}
                stroke="currentColor"
                strokeWidth={1 + strength * 2}
                className={cn(
                  "text-border transition-all",
                  !isRelated && "opacity-20"
                )}
                markerEnd="url(#arrowhead)"
              />
            );
          })}

          {/* Nodes */}
          {nodes.map((node) => {
            const radius = 5 + (node.count / maxCount) * 15;
            const isHovered = hoveredNode === node.name;
            const isSelected = selectedNode === node.name;
            const isRelated =
              !hoveredNode ||
              hoveredNode === node.name ||
              links.some(
                (l) =>
                  (l.source === node.name && l.target === hoveredNode) ||
                  (l.target === node.name && l.source === hoveredNode)
              );

            return (
              <g
                key={node.name}
                onMouseEnter={() => setHoveredNode(node.name)}
                onMouseLeave={() => setHoveredNode(null)}
                onClick={() => handleNodeClick(node.name)}
                className="cursor-pointer"
              >
                {/* Highlight circle on hover */}
                {isHovered && (
                  <circle
                    cx={node.position.x}
                    cy={node.position.y}
                    r={radius + 8}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="text-primary"
                  />
                )}

                {/* Main node */}
                <circle
                  cx={node.position.x}
                  cy={node.position.y}
                  r={radius}
                  fill="currentColor"
                  className={cn(
                    "text-primary transition-all",
                    isSelected && "text-accent",
                    !isRelated && "opacity-30"
                  )}
                />

                {/* Label on hover/select */}
                {(isHovered || isSelected) && (
                  <g>
                    {/* Background for text */}
                    <rect
                      x={node.position.x - 40}
                      y={node.position.y - 25}
                      width="80"
                      height="20"
                      fill="currentColor"
                      className="text-background"
                      rx="3"
                    />
                    {/* Text */}
                    <text
                      x={node.position.x}
                      y={node.position.y - 10}
                      textAnchor="middle"
                      fontSize="10"
                      fontWeight="bold"
                      fill="currentColor"
                      className="text-primary pointer-events-none"
                    >
                      {node.name.length > 15
                        ? node.name.slice(0, 12) + "..."
                        : node.name}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend and info */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="bg-secondary/50 rounded p-3">
          <div className="font-semibold mb-2">Top Celebrities</div>
          <div className="space-y-1">
            {topCelebrities.slice(0, 5).map((celeb) => (
              <Button
                key={celeb.name}
                variant="ghost"
                size="sm"
                className="w-full justify-start text-left text-xs"
                onClick={() => handleNodeClick(celeb.name)}
              >
                <span className="flex-1">{celeb.name}</span>
                <span className="text-muted-foreground">{celeb.count}</span>
              </Button>
            ))}
          </div>
        </div>

        <div className="bg-secondary/50 rounded p-3">
          <div className="font-semibold mb-2">Connection Info</div>
          <div className="space-y-1 text-xs text-muted-foreground">
            <div>Total nodes: {nodes.length}</div>
            <div>Total connections: {links.length}</div>
            {selectedNode && (
              <div className="pt-2 border-t">
                <div className="font-semibold text-foreground">{selectedNode}</div>
                <div>
                  {links.filter(
                    (l) => l.source === selectedNode || l.target === selectedNode
                  ).length}{" "}
                  connections
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
