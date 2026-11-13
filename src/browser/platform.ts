/** Web-standard adapter used only by the browser-worker build. */
export class NextRequest extends Request {
  get nextUrl() { return new URL(this.url); }
}
export const NextResponse = Response;

export async function getRateLimiter() { return undefined; }
