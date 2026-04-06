/**
 * Cloudflare Pages Function
 * POST /api/speak
 *
 * Typecast TTS 프록시
 * 환경변수 TYPECAST_API_KEY 필요
 */

const TYPECAST_BASE = 'https://typecast.ai';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return cors(null, 204);
  }

  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const apiKey = env.TYPECAST_API_KEY;
  if (!apiKey) {
    return json({ error: 'TYPECAST_API_KEY not configured' }, 500);
  }

  let text;
  try {
    const body = await request.json();
    text = body?.text;
  } catch {
    return json({ error: 'Invalid request body' }, 400);
  }

  if (!text || typeof text !== 'string') {
    return json({ error: 'text is required' }, 400);
  }

  // 1단계: 음성 합성 요청
  let speakRes;
  try {
    speakRes = await fetch(`${TYPECAST_BASE}/api/speak`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        actor_id: 'tc_6809c111e5e8c73f8a0237b2',
        text,
        lang: 'auto',
        xapi_hd: true,
        model_version: 'latest'
      })
    });
  } catch (e) {
    return json({ error: `Typecast network error: ${e.message}` }, 502);
  }

  if (!speakRes.ok) {
    const errBody = await speakRes.text().catch(() => '');
    console.error('[speak] Typecast error', speakRes.status, errBody);
    return json({
      error: `Typecast speak failed: ${speakRes.status}`,
      detail: errBody
    }, 200); // 200으로 반환해 클라이언트 console.warn이 detail을 볼 수 있도록
  }

  let speakData;
  try {
    speakData = await speakRes.json();
  } catch {
    return json({ error: 'Typecast speak response parse error' }, 502);
  }

  const speakV2Url = speakData?.result?.speak_v2_url;
  if (!speakV2Url) {
    return json({
      error: 'No speak_v2_url in response',
      detail: JSON.stringify(speakData)
    }, 502);
  }

  // speak_v2_url이 상대경로일 경우 base URL 추가
  const pollUrl = speakV2Url.startsWith('http')
    ? speakV2Url
    : `${TYPECAST_BASE}${speakV2Url}`;

  // 2단계: 완료될 때까지 폴링 (최대 30초, 1초 간격)
  for (let i = 0; i < 30; i++) {
    await sleep(1000);

    let pollRes;
    try {
      pollRes = await fetch(pollUrl, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
    } catch (e) {
      return json({ error: `Poll network error: ${e.message}` }, 502);
    }

    if (!pollRes.ok) {
      return json({ error: `Poll failed: ${pollRes.status}` }, pollRes.status);
    }

    let pollData;
    try {
      pollData = await pollRes.json();
    } catch {
      return json({ error: 'Poll response parse error' }, 502);
    }

    const status = pollData?.result?.status;

    if (status === 'done') {
      const audioUrl = pollData?.result?.audio_download_url;
      if (!audioUrl) {
        return json({
          error: 'No audio_download_url',
          detail: JSON.stringify(pollData)
        }, 502);
      }
      return json({ audioUrl });
    }

    if (status === 'error') {
      return json({
        error: 'Typecast synthesis error',
        detail: JSON.stringify(pollData)
      }, 502);
    }

    // status가 'progress' 또는 기타 → 계속 폴링
  }

  return json({ error: 'Typecast polling timeout (30s)' }, 504);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

function cors(body, status) {
  return new Response(body, {
    status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
