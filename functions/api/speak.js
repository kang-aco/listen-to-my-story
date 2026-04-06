/**
 * Cloudflare Pages Function
 * POST /api/speak
 *
 * Typecast TTS 프록시 - CORS 우회 및 API 키 보호
 * 환경변수 TYPECAST_API_KEY 필요
 */
export async function onRequestPost(context) {
  const { request, env } = context;
  const apiKey = env.TYPECAST_API_KEY;

  if (!apiKey) {
    return json({ error: 'API key not configured' }, 500);
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
  const speakRes = await fetch('https://typecast.ai/api/speak', {
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

  if (!speakRes.ok) {
    const err = await speakRes.text().catch(() => '');
    console.error('Typecast speak error:', speakRes.status, err);
    return json({ error: `Typecast error: ${speakRes.status}` }, speakRes.status);
  }

  const speakData = await speakRes.json();
  const speakV2Url = speakData?.result?.speak_v2_url;

  if (!speakV2Url) {
    return json({ error: 'No speak_v2_url in response' }, 500);
  }

  // 2단계: 완료될 때까지 폴링 (최대 30초, 1초 간격)
  for (let i = 0; i < 30; i++) {
    await sleep(1000);

    const pollRes = await fetch(speakV2Url, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    if (!pollRes.ok) {
      console.error('Typecast poll error:', pollRes.status);
      break;
    }

    const pollData = await pollRes.json();
    const status = pollData?.result?.status;

    if (status === 'done') {
      const audioUrl = pollData?.result?.audio_download_url;
      if (!audioUrl) return json({ error: 'No audio_download_url' }, 500);
      return json({ audioUrl });
    }

    if (status === 'error') {
      console.error('Typecast synthesis error');
      break;
    }
  }

  return json({ error: 'Timeout or synthesis failed' }, 500);
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

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
