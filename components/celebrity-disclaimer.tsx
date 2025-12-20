export function CelebrityDisclaimer({ className = "" }: { className?: string }) {
  return (
    <div className={`text-caption text-muted-foreground ${className}`}>
      <p>
        Detection powered by{" "}
        <a
          href="https://aws.amazon.com/rekognition/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary/80 hover:text-primary underline-offset-2 hover:underline transition-colors"
        >
          AWS Rekognition
        </a>
        . Results may not be accurate.{" "}
        <a
          href="https://github.com/RhysSullivan/epstein-files-browser"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary/80 hover:text-primary underline-offset-2 hover:underline transition-colors"
        >
          View source
        </a>
        .
      </p>
    </div>
  );
}
