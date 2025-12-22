"use client";

import * as React from "react";
import { useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useQueryState } from "nuqs";
import { cn } from "@/lib/utils";
import { Search, X, Clock, FileText, User, FolderOpen } from "lucide-react";
import { useFiles } from "@/lib/files-context";
import { getCelebritiesAboveConfidence } from "@/lib/celebrity-data";
import { fuzzySearch } from "@/lib/fuzzy-search";

export type GlobalSearchHandle = {
  focus: () => void;
  blur: () => void;
};

type GlobalSearchProps = {
  onFocusChange?: (focused: boolean) => void;
};

const GlobalSearch = React.forwardRef<GlobalSearchHandle, GlobalSearchProps>(
  function GlobalSearch({ onFocusChange }, ref) {
  const [q, setQ] = useQueryState("q", { defaultValue: "" });
  const [value, setValue] = useState(q);
  const [focused, setFocused] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { files } = useFiles();

  const celebrities = useMemo(() => getCelebritiesAboveConfidence(99), []);
  const volumeList = useMemo(() => {
    const set = new Set<string>();
    for (const f of files) {
      const prefix = f.key.split("/")[0];
      if (prefix) set.add(prefix);
    }
    return Array.from(set).sort();
  }, [files]);
  const fileIndex = useMemo(() => files.map((f) => ({ id: (f.key.match(/EFTA\d+/) || [f.key])[0], key: f.key })), [files]);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => inputRef.current?.focus(),
      blur: () => inputRef.current?.blur(),
    }),
    []
  );

  const saveRecent = (entry: string) => {
    const clean = entry.trim();
    if (!clean) return;
    try {
      const raw = localStorage.getItem("recent_searches");
      const list: string[] = raw ? JSON.parse(raw) : [];
      const next = [clean, ...list.filter((s) => s !== clean)].slice(0, 10);
      localStorage.setItem("recent_searches", JSON.stringify(next));
      setRecent(next);
    } catch {
      // ignore persistence errors
    }
  };

  // Debounce URL updates for smoother typing
  useEffect(() => {
    setValue(q);
  }, [q]);

  // Refresh recent list when focus changes or query updates
  useEffect(() => {
    try {
      const raw = localStorage.getItem("recent_searches");
      setRecent(raw ? JSON.parse(raw) : []);
    } catch {
      setRecent([]);
    }
  }, [focused, q]);

  const suggestions = useMemo(() => {
    const term = value.trim();
    if (!term) return { files: [] as { id: string; key: string }[], people: [] as { name: string }[], volumes: [] as string[] };

    // Use fuzzy search for better matching
    const fileMatches = fuzzySearch(
      term,
      fileIndex,
      (f) => [f.id, f.key],
      6
    );

    const peopleMatches = fuzzySearch(
      term,
      celebrities,
      (c) => c.name,
      6
    ).map((c) => ({ name: c.name }));

    const volumeMatches = fuzzySearch(
      term,
      volumeList,
      (v) => v,
      6
    );

    return { files: fileMatches, people: peopleMatches, volumes: volumeMatches };
  }, [value, fileIndex, celebrities, volumeList]);

  // Close on outside click/tap
  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      if (!containerRef.current) return;
      if (containerRef.current.contains(e.target as Node)) return;
      saveRecent(value);
      setFocused(false);
      onFocusChange?.(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [value, onFocusChange]);

  return (
    <div className="w-full">
      <div ref={containerRef} className="relative w-full sm:max-w-[520px] lg:max-w-[640px]" role="search">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            <Search className="h-4 w-4" />
          </span>
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => {
              const next = e.target.value;
              setValue(next);
              setQ(next || null); // immediate update → filters apply instantly
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                saveRecent(value);
              } else if (e.key === "Escape") {
                e.currentTarget.blur();
                setFocused(false);
              }
            }}
            placeholder="Search files, people, volumes..."
            className={cn(
              "w-full rounded-xl bg-secondary border border-border text-sm px-9 py-2.5 outline-none",
              "placeholder:text-muted-foreground text-foreground",
              "focus-visible:ring-[3px] focus-visible:ring-ring/50"
            )}
            aria-label="Global search"
            onFocus={() => {
              setFocused(true);
              onFocusChange?.(true);
            }}
            onBlur={() => {
              saveRecent(value);
              setFocused(false);
              onFocusChange?.(false);
            }}
          />
          {value && (
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer"
              onClick={() => {
                setValue("");
                setQ(null);
              }}
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          {/* Dropdown: suggestions while typing, otherwise recent */}
          {focused && (value.trim() || recent.length > 0) && (
            <div
              className="absolute left-0 right-0 top-full mt-2 bg-card border border-border rounded-xl shadow-xl z-20"
              onMouseDown={(e) => e.preventDefault()}
              role="listbox"
              aria-label="Search suggestions"
            >
              <div className="py-1">
                {value.trim() ? (
                  <>
                    {suggestions.files.length > 0 && (
                      <div className="px-3 py-1 text-xs font-semibold text-muted-foreground">Files</div>
                    )}
                    {suggestions.files.map((f) => (
                      <button
                        key={`file-${f.key}`}
                        className="w-full text-left px-3 py-2 hover:bg-accent flex items-center gap-2 cursor-pointer"
                        onClick={() => {
                          setValue(f.id);
                          setQ(f.id);
                          saveRecent(f.id);
                          setFocused(false);
                        }}
                        role="option"
                      >
                        <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <span className="text-sm text-foreground truncate font-mono">{f.id}</span>
                        <span className="text-[11px] text-muted-foreground truncate">{f.key}</span>
                      </button>
                    ))}

                    {suggestions.people.length > 0 && (
                      <div className="px-3 py-1 text-xs font-semibold text-muted-foreground">People</div>
                    )}
                    {suggestions.people.map((p) => (
                      <button
                        key={`person-${p.name}`}
                        className="w-full text-left px-3 py-2 hover:bg-accent flex items-center gap-2 cursor-pointer"
                        onClick={() => {
                          setValue(p.name);
                          setQ(p.name);
                          saveRecent(p.name);
                          setFocused(false);
                        }}
                        role="option"
                      >
                        <User className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <span className="text-sm text-foreground truncate">{p.name}</span>
                      </button>
                    ))}

                    {suggestions.volumes.length > 0 && (
                      <div className="px-3 py-1 text-xs font-semibold text-muted-foreground">Volumes</div>
                    )}
                    {suggestions.volumes.map((v) => (
                      <button
                        key={`vol-${v}`}
                        className="w-full text-left px-3 py-2 hover:bg-accent flex items-center gap-2 cursor-pointer"
                        onClick={() => {
                          setValue(v);
                          setQ(v);
                          saveRecent(v);
                          setFocused(false);
                        }}
                        role="option"
                      >
                        <FolderOpen className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <span className="text-sm text-foreground truncate">{v}</span>
                      </button>
                    ))}

                    {suggestions.files.length === 0 && suggestions.people.length === 0 && suggestions.volumes.length === 0 && (
                      <div className="px-3 py-3 text-sm text-muted-foreground">Keine Treffer</div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="px-3 py-2 flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Recent searches</span>
                      <button
                        className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4 cursor-pointer"
                        onClick={() => {
                          try { localStorage.removeItem("recent_searches"); } catch {}
                          setRecent([]);
                        }}
                      >
                        Clear
                      </button>
                    </div>
                    <div className="py-1">
                      {recent.map((s) => (
                        <button
                          key={`recent-${s}`}
                          className="w-full text-left px-3 py-2 hover:bg-accent flex items-center gap-2 cursor-pointer"
                          onClick={() => {
                            setValue(s);
                            setQ(s);
                            saveRecent(s);
                            setFocused(false);
                          }}
                          role="option"
                        >
                          <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                          <span className="text-sm text-foreground truncate">{s}</span>
                        </button>
                      ))}
                      {recent.length === 0 && (
                        <div className="px-3 py-3 text-sm text-muted-foreground">Noch keine Suchen</div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
    </div>
  );
});

export default GlobalSearch;
