import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const context = { localStorage: { getItem: () => null, setItem: () => {} }, console };
vm.createContext(context);
vm.runInContext(
  script.slice(0, script.lastIndexOf('initialise();')) +
    '\n;globalThis.APP={ALL,VIDEOS};',
  context,
);
const { ALL, VIDEOS } = context.APP;
const blockedStatuses = new Set([401, 403, 429]);

async function fetchStatus(url) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(20000),
        headers: { 'user-agent': 'Mozilla/5.0 CyberPath-link-check' },
      });
      await response.body?.cancel();
      if (response.status >= 500 && attempt === 0) continue;
      return { ok: response.status < 400, blocked: blockedStatuses.has(response.status), status: response.status, url };
    } catch (error) {
      lastError = error;
      if (attempt === 0) await new Promise(resolve => setTimeout(resolve, 750));
    }
  }
  return { ok: false, blocked: false, status: 0, url, error: lastError?.message };
}

async function verifyVideo(lessonId, video) {
  const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${video.id}`)}&format=json`;
  try {
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) return { lessonId, ok: false, status: response.status, video };
    const metadata = await response.json();
    return {
      lessonId,
      ok: true,
      status: response.status,
      video,
      remoteTitle: metadata.title,
      titleMatches: metadata.title === video.title,
    };
  } catch (error) {
    return { lessonId, ok: false, status: 0, video, error: error.message };
  }
}

async function mapLimit(items, limit, worker) {
  const results = [];
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

const urls = [...new Set(ALL.flatMap(lesson => (lesson.links || []).map(([, url]) => url)))];
const urlResults = await mapLimit(urls, 6, fetchStatus);
const videoResults = await mapLimit(
  Object.entries(VIDEOS),
  6,
  ([lessonId, video]) => verifyVideo(lessonId, video),
);

let hardFailures = 0;
console.log(`Resource URLs: ${urlResults.length}`);
for (const result of urlResults) {
  if (result.ok) {
    console.log(`  OK ${result.status} ${result.url}`);
  } else if (result.blocked) {
    console.log(`  WARN ${result.status} (blocked automated requests; verify manually) ${result.url}`);
  } else {
    hardFailures++;
    console.log(`  FAIL ${result.status || result.error} ${result.url}`);
  }
}

console.log(`\nSelected videos: ${videoResults.length}`);
for (const result of videoResults) {
  if (!result.ok) {
    hardFailures++;
    console.log(`  FAIL ${result.lessonId} ${result.video.id} ${result.status || result.error}`);
  } else if (!result.titleMatches) {
    console.log(`  WARN ${result.lessonId} title differs: catalog “${result.video.title}” / YouTube “${result.remoteTitle}”`);
  }
}

console.log(`\n${hardFailures ? `${hardFailures} hard failure(s)` : 'No hard failures'}.`);
if (hardFailures) process.exitCode = 1;
