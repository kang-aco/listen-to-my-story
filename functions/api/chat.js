/**
 * Cloudflare Pages Function
 * POST /api/chat
 *
 * Gemini API 프록시
 * 환경변수 GEMINI_API_KEY 필요
 */

const API_BASE = 'https://generativelanguage.googleapis.com';

const MODEL_ATTEMPTS = [
  { ver: 'v1beta', model: 'gemini-2.5-flash-preview-04-17' },
  { ver: 'v1beta', model: 'gemini-2.5-flash' },
  { ver: 'v1', model: 'gemini-2.0-flash' },
  { ver: 'v1', model: 'gemini-2.0-flash-preview' },
  { ver: 'v1', model: 'gemini-1.5-flash' },
  { ver: 'v1', model: 'gemini-1.5-flash-latest' },
];

export async function onRequest(context) {
  const { request, env } = context;

  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    return json({ error: 'GEMINI_API_KEY not configured' }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request body' }, 400);
  }

  const { contents, generationConfig } = body;
  if (!contents) {
    return json({ error: 'contents is required' }, 400);
  }

  for (const { ver, model } of MODEL_ATTEMPTS) {
    let res;
    try {
      res = await fetch(
        `${API_BASE}/${ver}/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents, generationConfig }),
        }
      );
    } catch {
      continue;
    }

    if (res.ok) {
      const data = await res.json();
      return json(data);
    }

    // 404: 모델 없음 → 다음 모델 시도
    if (res.status === 404) continue;

    // 그 외 오류 → 그대로 반환
    const errText = await res.text().catch(() => '{}');
    return new Response(errText, {
      status: res.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  return json({ error: 'No available Gemini model found' }, 503);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
