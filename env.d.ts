/// <reference types="@cloudflare/workers-types" />

declare module "@cloudflare/next-on-pages" {
  export function getRequestContext(): {
    env: {
      R2_BUCKET: R2Bucket;
    };
    ctx: ExecutionContext;
    cf: IncomingRequestCfProperties;
  };
}

export {};
