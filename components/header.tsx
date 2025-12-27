"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function Header() {
  const pathname = usePathname();

  return (
    <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40">
      <div className="container flex h-14 max-w-screen-2xl items-center">
        <Link href="/" className="flex items-center space-x-2 mr-auto">
          <span className="font-bold text-lg">Epstein Files Browser</span>
        </Link>

        <nav className="flex items-center space-x-1 text-sm font-medium">
          <Link
            href="/"
            className={cn(
              "px-3 py-2 rounded-md transition-colors hover:bg-accent hover:text-accent-foreground",
              pathname === "/" ? "bg-accent text-accent-foreground" : "text-muted-foreground"
            )}
          >
            Browse
          </Link>
          <Link
            href="/features"
            className={cn(
              "px-3 py-2 rounded-md transition-colors hover:bg-accent hover:text-accent-foreground",
              pathname === "/features" ? "bg-accent text-accent-foreground" : "text-muted-foreground"
            )}
          >
            Analysis Tools
          </Link>
        </nav>
      </div>
    </header>
  );
}
