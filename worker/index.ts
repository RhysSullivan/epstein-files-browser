interface Env {
  R2_BUCKET: R2Bucket;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.slice(1); // Remove leading slash

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    // Get files by keys endpoint (POST with array of keys)
    if (path === "api/files-by-keys" && request.method === "POST") {
      const body = await request.json() as { keys: string[] };
      const keys = body.keys || [];
      
      // Fetch metadata for each file in parallel
      const files: { key: string; size: number; uploaded: string }[] = [];
      
      await Promise.all(
        keys.map(async (key) => {
          const obj = await env.R2_BUCKET.head(key);
          if (obj) {
            files.push({
              key: obj.key,
              size: obj.size,
              uploaded: obj.uploaded.toISOString(),
            });
          }
        })
      );

      // Sort by key to maintain consistent order
      files.sort((a, b) => a.key.localeCompare(b.key));

      return new Response(
        JSON.stringify({
          files,
          totalReturned: files.length,
        }),
        {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "public, max-age=60",
          },
        }
      );
    }

    // List all files endpoint (returns everything)
    if (path === "api/all-files") {
      const files: { key: string; size: number; uploaded: string }[] = [];
      let hasMoreInBucket = true;
      let bucketCursor: string | undefined = undefined;

      while (hasMoreInBucket) {
        const listOptions: R2ListOptions = {
          limit: 1000,
        };
        
        if (bucketCursor) {
          listOptions.cursor = bucketCursor;
        }

        const listed = await env.R2_BUCKET.list(listOptions);

        for (const obj of listed.objects) {
          if (obj.key.toLowerCase().endsWith(".pdf")) {
            files.push({
              key: obj.key,
              size: obj.size,
              uploaded: obj.uploaded.toISOString(),
            });
          }
        }

        hasMoreInBucket = listed.truncated;
        bucketCursor = listed.truncated ? listed.cursor : undefined;
      }

      return new Response(
        JSON.stringify({
          files,
          totalReturned: files.length,
        }),
        {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "public, max-age=3600",
          },
        }
      );
    }

    // List files endpoint (paginated)
    if (path === "api/files" || path === "files") {
      const startAfter = url.searchParams.get("cursor") || undefined;
      const limit = Math.min(parseInt(url.searchParams.get("limit") || "100"), 1000);
      const prefix = url.searchParams.get("prefix") || "";

      // We need to fetch more than requested since we filter out non-PDFs
      const files: { key: string; size: number; uploaded: string }[] = [];
      let hasMoreInBucket = true;
      let bucketCursor: string | undefined = undefined;
      let isFirstRequest = true;

      while (files.length <= limit && hasMoreInBucket) {
        const listOptions: R2ListOptions = {
          prefix,
          limit: 1000,
        };
        
        if (isFirstRequest && startAfter) {
          listOptions.startAfter = startAfter;
          isFirstRequest = false;
        } else if (bucketCursor) {
          listOptions.cursor = bucketCursor;
        }

        const listed = await env.R2_BUCKET.list(listOptions);

        for (const obj of listed.objects) {
          if (obj.key.toLowerCase().endsWith(".pdf")) {
            files.push({
              key: obj.key,
              size: obj.size,
              uploaded: obj.uploaded.toISOString(),
            });
          }
        }

        hasMoreInBucket = listed.truncated;
        bucketCursor = listed.truncated ? listed.cursor : undefined;
      }

      // Trim to limit and determine if there's more
      const hasMore = files.length > limit || hasMoreInBucket;
      const returnFiles = files.slice(0, limit);
      
      // Use the last key as cursor for next request
      const nextCursor = hasMore && returnFiles.length > 0 
        ? returnFiles[returnFiles.length - 1].key 
        : null;

      return new Response(
        JSON.stringify({
          files: returnFiles,
          truncated: hasMore,
          cursor: nextCursor,
          totalReturned: returnFiles.length,
        }),
        {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "public, max-age=60",
          },
        }
      );
    }

    // Serve file from R2
    const object = await env.R2_BUCKET.get(path);

    if (!object) {
      return new Response("Not Found", { 
        status: 404,
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    const headers = new Headers();
    headers.set("Content-Type", object.httpMetadata?.contentType || "application/pdf");
    headers.set("Content-Length", object.size.toString());
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Content-Disposition", `inline; filename="${path.split("/").pop()}"`);

    return new Response(object.body, { headers });
  },
};
