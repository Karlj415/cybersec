const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const initialisation = script.lastIndexOf('initialise();');
assert.ok(initialisation > 0, 'The application initialisation call must exist');

const context = {
  console,
  localStorage: { getItem: () => null, setItem: () => {} },
};
vm.createContext(context);
vm.runInContext(
  script.slice(0, initialisation) +
    '\n;globalThis.APP={PHASES,ALL,VIDEOS,MACHINES,orderedOptions,lessonSearchText,normaliseStore,emptyStore};',
  context,
);
const { PHASES, ALL, VIDEOS, MACHINES, orderedOptions, lessonSearchText, normaliseStore, emptyStore } = context.APP;
const plain = value => JSON.parse(JSON.stringify(value));

test('the curriculum has complete, uniquely identified lessons', () => {
  assert.equal(PHASES.length, 11);
  assert.equal(ALL.length, 69);
  assert.equal(new Set(ALL.map(lesson => lesson.id)).size, 69);
  for (const lesson of ALL) {
    assert.match(lesson.id, /^l\d{2}$/);
    assert.ok(lesson.t.length > 5);
    assert.ok(Number.isInteger(lesson.m) && lesson.m >= 15);
    assert.equal(lesson.lab.length, 3, `${lesson.id} practical steps`);
    assert.equal(lesson.quiz.length, 3, `${lesson.id} quiz questions`);
    assert.ok(lesson.terms.length >= 2);
    assert.ok(lesson.q.length > 5);
    for (const [question, options, answer] of lesson.quiz) {
      assert.ok(question.length > 5);
      assert.equal(options.length, 3);
      assert.equal(new Set(options).size, 3);
      assert.ok(Number.isInteger(answer) && answer >= 0 && answer < options.length);
    }
  }
});

test('every lesson has a selected video or an explicit guided-reading route', () => {
  const entries = Object.entries(VIDEOS);
  assert.equal(entries.length, 57);
  assert.deepEqual(plain(entries.map(([lessonId]) => lessonId).sort()), plain(ALL.filter(lesson => !lesson.readingFirst).map(lesson => lesson.id).sort()));
  assert.equal(new Set(entries.map(([, video]) => video.id)).size, 57);
  for (const [lessonId, video] of entries) {
    assert.match(lessonId, /^l\d{2}$/);
    assert.match(video.id, /^[A-Za-z0-9_-]{11}$/);
    assert.ok(video.title.length > 5, `${lessonId} video title`);
    assert.ok(video.channel.length > 2, `${lessonId} video channel`);
    assert.match(video.duration, /^\d{1,2}:\d{2}$/);
    assert.match(video.checked, /^\d{4}-\d{2}-\d{2}$/);
  }
  assert.match(html, /const selectedVideo=VIDEOS\[id\]/);
  assert.match(html, /location\.protocol!=="file:"/);
  assert.match(html, /class="video-thumbnail"/);
  assert.match(html, /the lesson uses guided reading with official sources/);
  for (const lesson of ALL.filter(lesson => lesson.readingFirst)) {
    assert.ok(lesson.links.length > 0, lesson.id);
    assert.ok(lesson.deepDive.length > 500, lesson.id);
    assert.equal(lesson.explanations.length, lesson.quiz.length);
  }
  for (const lesson of ALL) {
    assert.equal((lesson.explanations || []).length, lesson.quiz.length, `${lesson.id} needs one explanation per quiz question`);
  }
});

test('displayed answer positions are balanced and stable', () => {
  const positions = [0, 0, 0];
  for (const lesson of ALL) {
    lesson.quiz.forEach((quiz, index) => {
      const ordered = orderedOptions(lesson.id, index, quiz[1]);
      assert.deepEqual(plain(ordered), plain(orderedOptions(lesson.id, index, quiz[1])));
      assert.deepEqual(plain(ordered.map(option => option.value).sort()), [0, 1, 2]);
      positions[ordered.findIndex(option => option.value === quiz[2])]++;
    });
  }
  assert.ok(Math.max(...positions) - Math.min(...positions) <= 10);
  for (let choice = 0; choice < 3; choice++) {
    const passes = ALL.filter(lesson =>
      lesson.quiz.filter((quiz, index) =>
        orderedOptions(lesson.id, index, quiz[1])[choice].value === quiz[2]
      ).length >= 2
    ).length;
    assert.ok(passes <= 5, `A single displayed answer letter should not pass the course; got ${passes}`);
  }
});

test('practical examples cannot create unintended headings or controls', () => {
  for (const lesson of ALL) {
    for (const step of lesson.lab) {
      assert.doesNotMatch(step, /<(?:h1|button|p|script)(?:\s|>)/i, lesson.id);
    }
  }
  assert.ok(ALL.find(lesson => lesson.id === 'l23').lab[0].includes('&lt;h1&gt;'));
});

test('required practical work does not depend on external accounts', () => {
  const accountDependency = /create (?:a |an |free )?accounts?|on tryhackme|complete (?:the |one )?(?:guided )?(?:room|lab) on|portswigger academy's first lab/i;
  for (const lesson of ALL) {
    for (const step of lesson.lab) {
      assert.doesNotMatch(step, accountDependency, lesson.id);
    }
  }
  for (const lesson of ALL.filter(lesson => ['l38', 'l39', 'l41', 'l42', 'l43', 'l47'].includes(lesson.id))) {
    assert.ok((lesson.links || []).some(([label]) => /optional extension/i.test(label)), lesson.id);
  }
});

test('resource links use expected web protocols', () => {
  const links = ALL.flatMap(lesson => lesson.links || []);
  assert.ok(links.length >= 20);
  for (const [label, address] of links) {
    assert.ok(label.length > 3);
    const url = new URL(address);
    assert.ok(url.protocol === 'https:' || (url.protocol === 'http:' && url.hostname === 'neverssl.com'));
  }
});

test('lesson text names other lessons and phases instead of numbering them', () => {
  // Displayed numbers shift whenever a lesson or phase is inserted.
  const numbered = /\b(?:lesson|phase|day)\s+\d+/i;
  const check = (value, where) => {
    if (typeof value === 'string') assert.doesNotMatch(value, numbered, where);
    else if (Array.isArray(value)) value.forEach((item, index) => check(item, `${where}[${index}]`));
  };
  for (const lesson of ALL) {
    for (const [field, value] of Object.entries(lesson)) {
      if (field !== 'phase') check(value, `${lesson.id}.${field}`);
    }
  }
});

test('search includes explanations, terms, and practical content', () => {
  assert.ok(lessonSearchText(ALL.find(lesson => lesson.id === 'l32')).includes('csrf'));
  assert.ok(lessonSearchText(ALL.find(lesson => lesson.id === 'l30')).includes('salt'));
  assert.ok(lessonSearchText(ALL.find(lesson => lesson.id === 'l45')).includes('gcc'));
});

test('backup normalisation preserves valid progress and discards invalid data', () => {
  const clean = plain(normaliseStore({
    done: ['l01', 'l01', 'not-a-lesson', 42],
    labs: { l01: [true, 'true', false] },
    quiz: { l01: 2, l02: 99 },
    last: 'l01',
  }));
  assert.deepEqual(clean.done, ['l01']);
  assert.deepEqual(clean.labs.l01, [true, false, false]);
  assert.deepEqual(clean.quiz, { l01: 2 });
  assert.equal(clean.last, 'l01');
  const wrapped = plain(normaliseStore({ version: 1, data: clean }));
  assert.deepEqual(wrapped, clean);
  assert.throws(() => normaliseStore({ unexpected: true }));
  assert.notEqual(emptyStore(), emptyStore());
});

test('learner-facing labels do not contain the old completion instructions', () => {
  assert.doesNotMatch(html, /Mark Complete/);
  assert.doesNotMatch(html, /Day \$\{/);
  assert.match(html, /role="progressbar"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /for="searchBox"/);
});


test('prerequisites exist earlier in the path and cannot form forward dependencies', () => {
  const positions = new Map(ALL.map((lesson, index) => [lesson.id, index]));
  for (const lesson of ALL) {
    assert.ok(Array.isArray(lesson.prerequisites), lesson.id);
    assert.equal(new Set(lesson.prerequisites).size, lesson.prerequisites.length);
    for (const prerequisite of lesson.prerequisites) {
      assert.ok(positions.has(prerequisite), `${lesson.id}: missing ${prerequisite}`);
      assert.ok(positions.get(prerequisite) < positions.get(lesson.id), `${lesson.id}: prerequisite ${prerequisite} must come first`);
    }
  }
  assert.ok(ALL.find(l => l.id === 'l32').prerequisites.includes('l49'));
  assert.ok(positions.get('l26') < positions.get('l49'));
  assert.ok(positions.get('l37') < positions.get('l50'));
  assert.ok(positions.get('l59') < positions.get('l38'));
});

test('old progress remains valid and new lessons contribute to course completion', () => {
  const old = Array.from({length:48}, (_, i) => 'l' + String(i + 1).padStart(2, '0'));
  const restored = normaliseStore({done:old, labs:{}, quiz:{}, last:'l32'});
  assert.equal(restored.done.length, 48);
  assert.equal(restored.last, 'l32');
  assert.equal(ALL.find(l => !restored.done.includes(l.id)).id, 'l60');
});

test('the JavaScript prerequisite displays the supplied runnable example', () => {
  const bridge = ALL.find(lesson => lesson.id === 'l49');
  assert.match(bridge.t, /JavaScript/);
  const displayed = bridge.deepDive.match(/<pre><code>([\s\S]*?)<\/code><\/pre>/)[1]
    .replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&');
  const runnable = fs.readFileSync(path.join(root, 'labs/javascript/bridge.mjs'), 'utf8');
  assert.equal(displayed, runnable);
  const sql = ALL.find(lesson => lesson.id === 'l32');
  assert.match(sql.deepDive, /node app\.mjs/);
  assert.match(sql.deepDive, /\.all\(\.\.\.parameters\)/);
  assert.ok(sql.prerequisites.includes(bridge.id));
});

test('the JavaScript lessons display their runnable lab files exactly, in order', () => {
  const decode = text => text.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&');
  const ids = ALL.map(lesson => lesson.id);
  assert.deepEqual(plain(ids.slice(ids.indexOf('l60'), ids.indexOf('l60') + 4)), ['l60', 'l61', 'l69', 'l49']);
  assert.ok(ALL.find(lesson => lesson.id === 'l49').prerequisites.includes('l69'));
  for (const [id, files] of [['l61', ['second-steps.mjs']], ['l69', ['third-steps.mjs', 'ports.test.mjs']]]) {
    const blocks = [...ALL.find(lesson => lesson.id === id).deepDive.matchAll(/<pre><code>([\s\S]*?)<\/code><\/pre>/g)].map(match => decode(match[1]));
    files.forEach((file, i) => assert.equal(blocks[i], fs.readFileSync(path.join(root, 'labs/javascript', file), 'utf8').trimEnd(), `${id} shows ${file}`));
  }
  // Every lesson that asks for a practice file says how to check it.
  for (const [id, part] of [['l60', 'part1'], ['l61', 'part2'], ['l69', 'part3']]) {
    assert.match(ALL.find(lesson => lesson.id === id).lab.join(' '), new RegExp(`check\\.mjs ${part}`), id);
  }
  // The Node version advice is the same everywhere.
  assert.match(ALL.find(lesson => lesson.id === 'l60').deepDive, /Node 24 LTS, or Node 22\.13 or newer/);
  assert.doesNotMatch(ALL.find(lesson => lesson.id === 'l60').lab[0], /v22 or higher/);
});

test('web-security lessons follow SQL injection and show the real lab code', () => {
  const ids = ALL.map(lesson => lesson.id);
  assert.deepEqual(plain(ids.slice(ids.indexOf('l32'), ids.indexOf('l32') + 4)), ['l32', 'l62', 'l63', 'l33']);
  assert.deepEqual(plain(ALL.find(lesson => lesson.id === 'l33').prerequisites), ['l63']);
  const decode = text => text.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&');
  for (const [id, folder, port] of [['l62', 'xss', 8767], ['l63', 'access-control', 8768]]) {
    const lesson = ALL.find(item => item.id === id);
    const source = fs.readFileSync(path.join(root, 'labs', folder, 'app.mjs'), 'utf8');
    assert.ok(source.includes(`?? ${port})`), `${folder} default port`);
    assert.match(lesson.deepDive, new RegExp(`labs/${folder}/README\\.md`));
    assert.ok(fs.existsSync(path.join(root, 'labs', folder, 'README.md')));
    for (const [, shown] of lesson.deepDive.matchAll(/<pre><code>([\s\S]*?)<\/code><\/pre>/g)) {
      const code = decode(shown);
      if (code.startsWith('<img')) continue; // attack input, not app source
      for (const line of code.split('\n')) assert.ok(source.includes(line.trim()), `${id} shows code missing from ${folder}/app.mjs: ${line}`);
    }
  }
  const search = id => lessonSearchText(ALL.find(lesson => lesson.id === id));
  assert.ok(search('l62').includes('output encoding'));
  assert.ok(search('l63').includes('samesite'));
});

test('the Arch phase sits between defensive security and Windows, and its AUR sample stays inert', () => {
  const ids = ALL.map(lesson => lesson.id);
  assert.deepEqual(plain(ids.slice(ids.indexOf('l37') + 1, ids.indexOf('l37') + 7)), ['l64', 'l65', 'l66', 'l67', 'l68', 'l50']);
  assert.match(PHASES.find(phase => phase.id === 'pa').title, /^Phase 7 — Arch Linux/);
  for (const lesson of ALL.filter(item => ['l64', 'l65', 'l66', 'l67', 'l68'].includes(item.id))) {
    assert.match(lesson.deepDive, /labs\/arch\/README\.md/, lesson.id);
  }
  assert.ok(fs.existsSync(path.join(root, 'labs', 'arch', 'README.md')));
  // The review exercise must never be buildable into anything real.
  const folder = path.join(root, 'labs', 'arch', 'aur-review');
  assert.ok(!fs.existsSync(path.join(folder, 'PKGBUILD')), 'keep the sample out of makepkg\'s default file name');
  for (const name of fs.readdirSync(folder)) {
    const text = fs.readFileSync(path.join(folder, name), 'utf8');
    for (const [url] of text.matchAll(/[a-z+]+:\/\/[^\s"')]+/g)) {
      assert.match(new URL(url.replace(/^git\+/, '')).hostname, /\.invalid$/, `${name}: ${url}`);
    }
  }
});

test('every practical step names the machine it is done on', () => {
  for (const lesson of ALL) {
    assert.ok(Array.isArray(lesson.where), `${lesson.id} needs a where list`);
    assert.equal(lesson.where.length, lesson.lab.length, `${lesson.id}: one machine per practical step`);
    for (const code of lesson.where) assert.ok(MACHINES[code], `${lesson.id}: unknown machine ${code}`);
  }
  const phaseMachines = id => new Set(ALL.filter(lesson => lesson.phaseId === id).flatMap(lesson => lesson.where));
  assert.ok(phaseMachines('pa').has('omarchy'));
  assert.ok(phaseMachines('pw').has('windows-vm'));
  assert.ok(phaseMachines('p3').has('ubuntu-or-kali'));
  assert.ok(lessonSearchText(ALL.find(lesson => lesson.id === 'l65')).includes('omarchy vm'));
});

test('Kali differences checked on 2026-10-28 stay in the lessons', () => {
  assert.equal(MACHINES.ubuntu, undefined, 'Linux VM lessons accept Ubuntu or Kali');
  const lab = id => ALL.find(lesson => lesson.id === id).lab.join(' ');
  assert.match(lab('l21'), /journalctl -b \| grep -i failed/);
  assert.match(lab('l33'), /default on Kali/);
  assert.match(lab('l36'), /sudo apt install ufw/);
  assert.match(lab('l36'), /sudo ufw allow ssh<\/code> before <code>sudo ufw enable/);
  assert.match(lab('l42'), /Jumbo edition/);
  for (const id of ['l34', 'l35', 'l42', 'l46']) assert.match(lab(id), /<b>On Kali:<\/b>/, id);
});
