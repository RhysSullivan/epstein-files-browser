interface Env {
  R2_BUCKET: R2Bucket;
}

function getFileId(key: string): string {
  const match = key.match(/EFTA\d+/);
  return match ? match[0] : key.split('/').pop() || key;
}

function generateOgHtml(filePath: string, thumbnailUrl: string, siteUrl: string): string {
  const fileId = getFileId(filePath);
  const title = `Epstein Files - ${fileId}`;
  const description = `View document ${fileId} from the Epstein Files archive`;
  const pageUrl = `${siteUrl}?file=${encodeURIComponent(filePath)}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  
  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="article">
  <meta property="og:url" content="${pageUrl}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="${thumbnailUrl}">
  <meta property="og:image:width" content="300">
  <meta property="og:image:height" content="400">
  <meta property="og:site_name" content="Epstein Files Browser">
  
  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:url" content="${pageUrl}">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${thumbnailUrl}">
  
  <!-- Redirect for non-bots that somehow end up here -->
  <meta http-equiv="refresh" content="0;url=${pageUrl}">
</head>
<body>
  <h1>${title}</h1>
  <p>${description}</p>
  <p><a href="${pageUrl}">View Document</a></p>
  <img src="${thumbnailUrl}" alt="${fileId}">
</body>
</html>`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.slice(1); // Remove leading slash

    const cacheHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=31536000, immutable",
    };

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          ...cacheHeaders,
          "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    // Serve PDF images manifest
    if (path === "api/pdf-manifest") {
      const manifestObject = await env.R2_BUCKET.get("pdfs-as-jpegs/manifest.json");
      
      if (!manifestObject) {
        return new Response(JSON.stringify({ error: "Manifest not found" }), {
          status: 404,
          headers: {
            ...cacheHeaders,
            "Content-Type": "application/json",
          },
        });
      }

      return new Response(manifestObject.body, {
        headers: {
          ...cacheHeaders,
          "Content-Type": "application/json",
        },
      });
    }

    // Handle OG metadata endpoint for social media bots
    if (path === "og" || path === "api/og") {
      const filePath = url.searchParams.get("file");
      
      if (!filePath) {
        return new Response("Missing file parameter", { status: 400 });
      }

      // Construct thumbnail URL - thumbnails are stored as .jpg versions of the PDF
      const thumbnailKey = `thumbnails/${filePath.replace(".pdf", ".jpg")}`;
      const thumbnailUrl = `${url.origin}/${thumbnailKey}`;
      
      // Use the main site URL for the page link
      const siteUrl = "https://epstein-files-browser.vercel.app";
      
      const html = generateOgHtml(filePath, thumbnailUrl, siteUrl);
      
      return new Response(html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "public, max-age=86400", // Cache for 1 day
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
            ...cacheHeaders,
            "Content-Type": "application/json",
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
            ...cacheHeaders,
            "Content-Type": "application/json",
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
            ...cacheHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // Serve file from R2
    const object = await env.R2_BUCKET.get(path);

    if (!object) {
      return new Response("Not Found", { 
        status: 404,
        headers: cacheHeaders,
      });
    }

    const headers = new Headers(cacheHeaders);
    headers.set("Content-Type", object.httpMetadata?.contentType || "application/pdf");
    headers.set("Content-Length", object.size.toString());
    headers.set("Content-Disposition", `inline; filename="${path.split("/").pop()}"`);

    return new Response(object.body, { headers });
  },
};
