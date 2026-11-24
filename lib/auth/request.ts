/**
 * Read the client address only from the reverse-proxy header controlled by
 * the deployment platform. Do not trust the first X-Forwarded-For value:
 * clients can supply that header themselves.
 */
export function getClientIp(request: Pick<Request, "headers">): string {
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}
