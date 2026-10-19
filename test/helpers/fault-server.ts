import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

/** Marker planted in fault replies so tests can prove no reply body reaches CLI output. */
export const SECRET_MARKER = 'SECRETMARK-9f3a';

export const FAULT_MODES = [
  'unauthorized',
  'forbidden',
  'not-found',
  'rate-limited',
  'server-error-with-secret-body',
  'html-page',
  'truncated-json',
  'connection-reset',
] as const;

export type FaultMode = (typeof FAULT_MODES)[number];

const STATUS_BY_MODE: Partial<Record<FaultMode, number>> = {
  unauthorized: 401,
  forbidden: 403,
  'not-found': 404,
  'rate-limited': 429,
  'server-error-with-secret-body': 500,
};

/** Local HTTP server whose first path segment picks the fault, for example `/rate-limited`. */
export const startFaultServer = async (): Promise<{ baseUrl: string; close: () => Promise<void> }> => {
  const server: Server = createServer((request, response) => {
    const mode = (request.url ?? '/').split('/')[1] as FaultMode;
    request.resume();
    if (mode === 'connection-reset') {
      request.socket.destroy();
      return;
    }
    if (mode === 'html-page') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end(`<html>login page ${SECRET_MARKER}</html>`);
      return;
    }
    if (mode === 'truncated-json') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(`{"ok": tr${SECRET_MARKER}`);
      return;
    }
    response.writeHead(STATUS_BY_MODE[mode] ?? 500, { 'content-type': 'text/plain' });
    response.end(`fault ${mode} token=${SECRET_MARKER}`);
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
};
