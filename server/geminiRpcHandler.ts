import { GeminiRpcRequest } from '../geminiApi';
import { GeminiRuntimeService } from './geminiRuntime';

export const runGeminiRpc = async (request: GeminiRpcRequest) => {
  const runtime = new GeminiRuntimeService();

  if (request.action === 'status') {
    return { configured: runtime.isConfigured() };
  }

  if (!runtime.isConfigured()) {
    throw new Error('Missing GEMINI_API_KEY on the server.');
  }

  switch (request.action) {
    case 'extractGlossary':
      return runtime.extractGlossary(request.payload.text, request.payload.analysisModel);
    case 'translateChunk':
      return runtime.translateChapterChunk(request.payload);
    case 'runChapterControlPass':
      return runtime.runChapterControlPass(request.payload);
    case 'lookupOriginalTerm':
      return runtime.lookupOriginalTerm(request.payload);
    default: {
      const exhaustiveCheck: never = request;
      throw new Error(`Unsupported Gemini RPC action: ${JSON.stringify(exhaustiveCheck)}`);
    }
  }
};
