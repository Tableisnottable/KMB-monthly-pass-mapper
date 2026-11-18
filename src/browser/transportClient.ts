type Reply = { id: number; status: number; headers: [string, string][]; body: string; error?: string };
type Pending = { resolve: (response: Response) => void; reject: (error: Error) => void; cleanup: () => void };
type Connection = { worker: Worker; pending: Map<number, Pending> };
let shared: Connection | undefined;
let journey: Connection | undefined;
let sequence = 0;

function connect(): Connection {
  const connection: Connection = { worker: new Worker('/__planner/transport.worker.js', { type: 'module' }), pending: new Map() };
  connection.worker.onmessage = ({ data }: MessageEvent<Reply>) => {
    const pending = connection.pending.get(data.id);
    if (!pending) return;
    connection.pending.delete(data.id); pending.cleanup();
    if (data.error) pending.reject(new Error(data.error));
    else pending.resolve(new Response(data.body, { status: data.status, headers: data.headers }));
  };
  connection.worker.onerror = () => {
    for (const pending of Array.from(connection.pending.values())) {
      pending.cleanup(); pending.reject(new Error('Could not load the transport calculator. Please refresh and try again.'));
    }
    connection.pending.clear(); connection.worker.terminate();
    if (shared === connection) shared = undefined;
    if (journey === connection) journey = undefined;
  };
  return connection;
}

/** Fetch-compatible transport queries, calculated off the page's main thread. */
export async function transportFetch(input: string, init?: RequestInit): Promise<Response> {
  const url = new URL(input, window.location.origin);
  if (!url.pathname.startsWith('/api/')) return fetch(input, init);
  if (init?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  // Keep the journey calculator warm between completed searches. Abort still
  // terminates it, while a separate catalogue worker stays responsive.
  // Departure selection stays responsive while the graph worker refines the
  // preview. Cancelling a selection must not terminate that full search.
  const dedicated = url.pathname === '/api/journey' && url.searchParams.get('operation') !== 'retime'
    || url.pathname === '/api/macau' && url.searchParams.get('resource') === 'journey';
  const connection = dedicated ? journey ?? (journey = connect()) : shared ?? (shared = connect());
  const id = ++sequence;
  return new Promise<Response>((resolve, reject) => {
    const abort = () => {
      connection.pending.delete(id); cleanup();
      if (dedicated) dispose(); else connection.worker.postMessage({ id, cancel: true });
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const timeout = window.setTimeout(() => {
      connection.pending.delete(id); cleanup();
      if (dedicated) dispose(); else connection.worker.postMessage({ id, cancel: true });
      reject(new Error('Transport calculation timed out. Please try again.'));
    }, 60_000);
    const cleanup = () => {
      window.clearTimeout(timeout); init?.signal?.removeEventListener('abort', abort);
    };
    const dispose = () => {
      connection.worker.terminate();
      for (const other of Array.from(connection.pending.values())) {
        other.cleanup(); other.reject(new DOMException('Aborted', 'AbortError'));
      }
      connection.pending.clear();
      if (journey === connection) journey = undefined;
    };
    connection.pending.set(id, { resolve, reject, cleanup });
    init?.signal?.addEventListener('abort', abort, { once: true });
    connection.worker.postMessage({ id, url: url.href });
  });
}
