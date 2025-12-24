import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Common bot user agents for social media crawlers
const BOT_USER_AGENTS = [
  "twitterbot",
  "facebookexternalhit",
  "linkedinbot",
  "slackbot",
  "discordbot",
  "telegrambot",
  "whatsapp",
  "applebot",
  "bingbot",
  "pinterest",
  "redditbot",
  "rogerbot",
  "embedly",
  "quora link preview",
  "showyoubot",
  "outbrain",
  "vkshare",
  "tumblr",
];

function isBot(userAgent: string | null): boolean {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return BOT_USER_AGENTS.some((bot) => ua.includes(bot));
}

const WORKER_URL = "https://epstein-files.rhys-669.workers.dev";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const userAgent = request.headers.get("user-agent");

  // Redirect /file/* to /?file=*
  if (pathname.startsWith("/file/")) {
    const filePath = pathname.replace(/^\/file\//, "");
    const decodedFilePath = decodeURIComponent(filePath);

    // If this is a bot, rewrite to the worker's OG endpoint
    if (isBot(userAgent)) {
      const workerUrl = `${WORKER_URL}/og?file=${encodeURIComponent(decodedFilePath)}`;
      return NextResponse.rewrite(workerUrl);
    }

    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.searchParams.set("file", decodedFilePath);
    return NextResponse.redirect(url);
  }

  // Check if this is the homepage with a file query parameter
  if (pathname === "/" && request.nextUrl.searchParams.has("file")) {
    // If this is a bot, rewrite to the worker's OG endpoint
    if (isBot(userAgent)) {
      const filePath = request.nextUrl.searchParams.get("file");
      const workerUrl = `${WORKER_URL}/og?file=${encodeURIComponent(filePath!)}`;
      return NextResponse.rewrite(workerUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/file/:path*", "/"],
};
