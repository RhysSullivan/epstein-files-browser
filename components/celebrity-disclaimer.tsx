import { cn } from "@/lib/utils";
import { XCircleIcon, XIcon } from "lucide-react";
import { useState } from "react";

export function CelebrityDisclaimer({
  className = "",
}: {
  className?: string;
}) {
  const [isDismissed, setIsDismissed] = useState(false);

  return (
    <div
      className={cn(
        "mx-auto mt-5 max-h-24 max-w-7xl transition-[max-height] duration-300 ease-in-out",
        isDismissed && "max-h-0 overflow-hidden"
      )}
    >
      <div className="relative rounded-2xl border border-amber-500/20 bg-amber-500/10 px-16 py-4 text-amber-200 backdrop-blur-sm">
        <button
          className="absolute top-2 right-2 cursor-pointer text-amber-200 hover:text-amber-100"
          onClick={() => setIsDismissed(true)}
        >
          <XCircleIcon className="size-5" />
        </button>
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/20">
            <svg
              className="h-4 w-4 text-amber-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <div>
            <div
              className={`text-muted-foreground text-xs leading-relaxed ${className}`}
            >
              <p>
                Detection powered by{" "}
                <a
                  href="https://aws.amazon.com/rekognition/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary/80 hover:text-primary underline-offset-2 transition-colors hover:underline"
                >
                  AWS Rekognition
                </a>
                . Results may not be accurate.{" "}
                <a
                  href="https://github.com/RhysSullivan/epstein-files-browser"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary/80 hover:text-primary underline-offset-2 transition-colors hover:underline"
                >
                  View source
                </a>
                .
              </p>
            </div>
            <p className="mt-1.5 text-sm text-amber-200/70">
              Results limited to {">"}99% confidence matches from AWS
              Rekognition.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
