export const onRequestGet = async () => {
  return new Response(
    JSON.stringify({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    }),
    { headers: { 'content-type': 'application/json' } }
  );
};
