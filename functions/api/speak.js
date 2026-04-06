/**
 * Cloudflare Pages Function
 * POST /api/speak
 *
 * Typecast TTS 프록시
 * 환경변수 TYPECAST_API_KEY 필요
 */

const TYPECAST_BASE = 'https://typecast.ai';

/**
 * 계정에서 사용 가능한 한국어 actor ID 자동 탐색
 * 선호: 여성 → 한국어 → 첫 번째 actor
 */
async function resolveActorId(apiKey) {
  try {
    const res = await fetch(`${TYPECAST_BASE}/api/actor`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    if (!res.ok) return null;

    const data = await res.json();
    // Typecast 응답 구조: { result: [...] } 또는 { actors: [...] } 등
    const actors = Array.isArray(data?.result)
      ? data.result
      : Array.isArray(data?.actors)
        ? data.actors
        : Array.isArray(data)
          ? data
          : [];

    if (!actors.length) return null;

    console.log('[speak] available actors:', actors.length,
      actors.slice(0, 3).map(a => ({
        id: a.actor_id || a.id,
        name: a.name,
        lang: a.lang || a.language,
        gender: a.gender || a.sex
      }))
    );

    // 한국어 여성 우선
    const pick =
      actors.find(a =>
        (a.lang === 'ko' || a.language === 'ko') &&
        (a.gender === 'female' || a.sex === 'female')
      ) ||
      actors.find(a => a.lang === 'ko' || a.language === 'ko') ||
      actors[0];

    return pick?.actor_id || pick?.id || null;
  } catch (e) {
    console.error('[speak] actor list error:', e.message);
    return null;
  }
}

export async function onRequest(context) {
  const { request, env } = context;

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

  // actor 자동 탐색
  const actorId = await resolveActorId(apiKey);
  if (!actorId) {
    return json({ error: 'No accessible Typecast actor found for this API key' }, 500);
  }
  console.log('[speak] using actor:', actorId);

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
        actor_id: actorId,
        text,
        lang: 'auto',
        xapi_hd: true,
        model_version: 'latest'
      })
    });
  } catch (e) {
    return json({ error: `Typecast network error: ${e.message}` }, 200);
  }

  if (!speakRes.ok) {
    const errBody = await speakRes.text().catch(() => '');
    console.error('[speak] Typecast speak error', speakRes.status, errBody);
    return json({ error: `Typecast speak failed: ${speakRes.status}`, detail: errBody }, 200);
  }

  let speakData;
  try {
    speakData = await speakRes.json();
  } catch {
    return json({ error: 'Typecast speak response parse error' }, 200);
  }

  const speakV2Url = speakData?.result?.speak_v2_url;
  if (!speakV2Url) {
    return json({ error: 'No speak_v2_url', detail: JSON.stringify(speakData) }, 200);
  }

  const pollUrl = speakV2Url.startsWith('http')
    ? speakV2Url
    : `${TYPECAST_BASE}${speakV2Url}`;

  // 2단계: 폴링 (최대 30초)
  for (let i = 0; i < 30; i++) {
    await sleep(1000);

    let pollRes;
    try {
      pollRes = await fetch(pollUrl, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
    } catch (e) {
      return json({ error: `Poll network error: ${e.message}` }, 200);
    }

    if (!pollRes.ok) {
      return json({ error: `Poll failed: ${pollRes.status}` }, 200);
    }

    let pollData;
    try {
      pollData = await pollRes.json();
    } catch {
      return json({ error: 'Poll parse error' }, 200);
    }

    const status = pollData?.result?.status;

    if (status === 'done') {
      const audioUrl = pollData?.result?.audio_download_url;
      if (!audioUrl) {
        return json({ error: 'No audio_download_url', detail: JSON.stringify(pollData) }, 200);
      }
      return json({ audioUrl });
    }

    if (status === 'error') {
      return json({ error: 'Typecast synthesis error', detail: JSON.stringify(pollData) }, 200);
    }
  }

  return json({ error: 'Typecast polling timeout' }, 200);
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

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
