import type { IncomingMessage, ServerResponse } from 'http';
import { GeminiRpcErrorResponse, GeminiRpcRequest, GeminiRpcSuccessResponse } from '../geminiApi';
import { runGeminiRpc } from '../server/geminiRpcHandler';

const readJsonBody = async (req: IncomingMessage): Promise<GeminiRpcRequest> => {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  return JSON.parse(raw || '{}') as GeminiRpcRequest;
};

const sendJson = (
  res: ServerResponse,
  statusCode: number,
  payload: GeminiRpcSuccessResponse<unknown> | GeminiRpcErrorResponse
) => {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
};

export default async function handler(req: IncomingMessage & { body?: unknown }, res: ServerResponse) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'Only POST /api/gemini is supported.' });
    return;
  }

  try {
    const body =
      typeof req.body === 'object' && req.body !== null
        ? (req.body as GeminiRpcRequest)
        : await readJsonBody(req);

    const data = await runGeminiRpc(body);
    sendJson(res, 200, { ok: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Gemini API error.';
    sendJson(res, 500, { ok: false, error: message });
  }
}
