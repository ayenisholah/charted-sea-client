import { vi } from "vitest";

export type Reply = Response | Error | ((init: RequestInit) => Promise<Response>);

/** A fetch that answers with each reply in turn (the last repeats) and records calls. */
export function fakeFetch(...replies: Reply[]) {
  let i = 0;
  return vi.fn(async (_url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const reply = replies[Math.min(i++, replies.length - 1)];
    if (reply === undefined) throw new Error("fakeFetch needs at least one reply");
    if (typeof reply === "function") return reply(init ?? {});
    if (reply instanceof Response) return reply.clone();
    throw reply;
  });
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

/** A fetch reply that never settles until the request's signal aborts. */
export const hang: Reply = (init) =>
  new Promise((_resolve, reject) => {
    init.signal?.addEventListener("abort", () => {
      reject(new DOMException("This operation was aborted", "AbortError"));
    });
  });
