process.env.LIVE = '1';
process.env.POLL_SECONDS = process.env.POLL_SECONDS || '120';
await import('./agent.js');
