/**
 * GET /api/typecast-debug
 * Typecast API 진단용 - 배포 후 삭제 예정
 */
export async function onRequest(context) {
  const { env } = context;
  const apiKey = env.TYPECAST_API_KEY;

  if (!apiKey) {
    return json({ error: 'TYPECAST_API_KEY not set' });
  }

  const results = {};

  const endpoints = [
    'https://typecast.ai/api/actor',
    'https://typecast.ai/api/actor/list',
    'https://typecast.ai/api/v1/actor',
    'https://typecast.ai/api/v2/actor',
    'https://typecast.ai/api/actors',
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      const text = await res.text();
      results[url] = { status: res.status, body: text.slice(0, 800) };
    } catch (e) {
      results[url] = { error: e.message };
    }
  }

  return json(results);
}

function json(data) {
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}
