import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile as writeTestFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { PLUGIN } from './package-rules.ts';

const SCRIPT = join(PLUGIN, 'skills', 'solo-write-copy', 'scripts', 'scan-copy.mjs');
const TMP = await mkdtemp(join(tmpdir(), 'solo-write-copy-'));

async function scan(args: string[], stdin?: string) {
  const proc = spawnSync(process.execPath, [SCRIPT, ...args], { input: stdin, encoding: 'utf8' });
  return { code: proc.status, out: proc.stdout };
}

const SLOP = `Let's dive into what makes Acme special. It's not just a tool, it's a movement.

Acme serves as a vibrant hub, showcasing work and fostering community. It empowers teams to unlock their potential — seamlessly.

That's the real win.

Fast. Simple. Yours.

In this guide, we'll explore the features. Studies show that teams love it. It's worth noting that results may potentially vary.
`;

test('flags the common tells in AI-sounding copy', async () => {
  const { code, out } = await scan([], SLOP);
  expect(code).toBe(0);
  for (const id of [
    'run-up',
    'not-x-but-y',
    'ai-word',
    'dash',
    'closer',
    'fragments',
    'doc-talk',
    'vague-source',
    'hedge',
  ])
    expect(out).toContain(`  ${id}  `);
});

test('stays quiet on plain specific copy with varied rhythm', async () => {
  const text = `Builder makes this week's posts, emails and pages in your own colours and fonts.
Every version is kept. When a client asks for Tuesday's carousel again, you open it, change the date and export it in under a minute, because the fonts, colours and layout are already saved with the project.
It costs $20 a month after a 7-day trial.`;
  const { code, out } = await scan([], text);
  expect(code).toBe(0);
  expect(out).toContain('0 flags to look at.');
});

test('skips code, keeps file names whole and reports true line numbers', async () => {
  const md =
    'Intro line here.\n\n```bash\nnot just code but a test\n```\n\nOpen `a.html` and read b.html for details. It is not just fast, but cheap.\n';
  const path = join(TMP, 'sample.md');
  await writeTestFile(path, md);
  const { out } = await scan([path]);
  expect(out).not.toContain(':4  not-x-but-y');
  expect(out).toContain(':7  not-x-but-y');
  expect(out).not.toContain('fragments');
});

test('reads HTML text without scripts, styles or code', async () => {
  const html =
    '<style>.x{}</style><h1>Hello there</h1><p>We serve as a hub.</p><code>let x = 1. y = 2.</code><script>var a = "delve";</script>';
  const path = join(TMP, 'sample.html');
  await writeTestFile(path, html);
  const { out } = await scan([path]);
  expect(out).toContain('serves-as');
  expect(out).not.toContain('ai-word');
  expect(out).not.toContain('fragments');
});

test('flags an even rhythm across many sentences', async () => {
  const line = 'The tool saves your work in a folder every single time you press save.';
  const { out } = await scan([], Array.from({ length: 9 }, () => line).join(' '));
  expect(out).toContain('even-rhythm');
});

test('prints help and fails clearly on a missing file', async () => {
  expect((await scan(['--help'])).code).toBe(0);
  const missing = await scan(['no-such-file.md']);
  expect(missing.code).toBe(1);
  expect(missing.out).toContain("Can't read no-such-file.md");
});

async function scanFile(name: string, text: string) {
  const path = join(TMP, name);
  await writeTestFile(path, text);
  return (await scan([path])).out;
}

test('horizontal rules in Markdown hide nothing; only leading frontmatter is skipped', async () => {
  const out = await scanFile(
    'rules.md',
    '---\ntitle: x\n---\n\nIntro.\n\n---\n\nThis is not just fast, but cheap.\n\n---\n\nOutro.\n',
  );
  expect(out).toContain(':9  not-x-but-y');
  expect(out).toContain('1 flag to look at.');
});

test('closers and chat leftovers match at the end of a sentence, and ordinary words do not', async () => {
  const out = await scanFile(
    'closers.md',
    'Let that sink in.\n\nThis is the end, full stop.\n\nCertainly! Here it is.\n\nPay within the grace period.\n',
  );
  expect(out).toContain(':1  closer');
  expect(out).toContain(':3  closer');
  expect(out).toContain(':5  chat-residue');
  expect(out).not.toContain(':7  ');
});

test('HTML keeps prose with a less-than sign and joins inline tags into the word', async () => {
  const out = await scanFile(
    'prose.html',
    '<p>See x < y and a > b. It is not merely fast, but cheap.</p><p>We un<em>delve</em>d it.</p>',
  );
  expect(out).toContain('not-x-but-y');
  expect(out).not.toContain('ai-word');
});

test('piped text is read as Markdown, or HTML when it starts with a tag', async () => {
  expect((await scan([], 'Intro.\n\n```\nnot just code but a test\n```\n')).out).toContain(
    '0 flags to look at.',
  );
  expect((await scan([], '<p>Hi there.</p><script>var a = "delve";</script>')).out).toContain(
    '0 flags to look at.',
  );
});

test('lines wrapped inside a paragraph are read as one sentence', async () => {
  const { out } = await scan([], 'It is not a tool,\nit is a movement for everyone.\n');
  expect(out).toContain('not-x-but-y');
  expect(out).toContain('1 sentences');
});

test('numeric ranges, comments, short list items and plain uses stay quiet', async () => {
  const out = await scanFile(
    'quiet.md',
    "Prices ran 2020–2024 for 5–10 items.\n\n<!-- TODO: fix -> later -->\n\n- Install it.\n- Run it.\n- Ship it.\n\nThis does not mean the build failed.\n\nIn today's meeting we shipped.\n\nThe check acts as a gate.\n",
  );
  expect(out).toContain('0 flags to look at.');
});

test('a contrast split across two sentences is flagged', async () => {
  const { out } = await scan([], 'This does not mean X is wrong. It means Y is right.\n');
  expect(out).toContain('contrast split across two sentences');
});

test('an unreadable file fails the run but the other files are still scanned', async () => {
  const path = join(TMP, 'fine.md');
  await writeTestFile(path, 'Let that sink in.\n');
  const result = await scan([path, join(TMP, 'missing.md')]);
  expect(result.code).toBe(1);
  expect(result.out).toContain('closer');
  expect(result.out).toContain("Can't read");
});

test('numbered list items, quotes and Setext headings are read as their own blocks', async () => {
  expect(await scanFile('numbered.md', '1. Install it.\n2. Run it.\n3. Ship it.\n')).toContain(
    '0 flags to look at.',
  );
  expect(
    await scanFile('quote.md', '> It is not a tool,\n> it is a movement for everyone.\n'),
  ).toContain(':1  not-x-but-y');
  expect(await scanFile('setext.md', 'Title\n=====\nThis is fine and ordinary text.\n')).toContain(
    '0 flags to look at.',
  );
});

test('a leading rule is not frontmatter, and CRLF frontmatter is still skipped', async () => {
  const rule = await scanFile(
    'rule.md',
    '---\n\nHello there. It is not just fast, but cheap.\n\n---\n\nOutro.\n',
  );
  expect(rule).toContain(':3  not-x-but-y');
  expect(
    await scanFile(
      'crlf.md',
      '---\r\ntitle: It is not just x, but y\r\n---\r\n\r\nPlain text.\r\n',
    ),
  ).toContain('0 flags to look at.');
});

test('piped Markdown that opens with a comment or badges is still read as Markdown', async () => {
  const readme = '<!-- lint off -->\n# T\n\nIntro.\n\n```\nnot just code but a test\n```\n';
  expect((await scan([], readme)).out).toContain('0 flags to look at.');
  const badges = '<p align="center"><img src=x></p>\n\nRun `not just a but b` now.\n';
  expect((await scan([], badges)).out).toContain('0 flags to look at.');
});

test('a less-than sign before a letter in HTML prose is kept as text', async () => {
  const out = await scanFile('lt.html', '<p>if x <y and a> b it is not just fast, but cheap.</p>');
  expect(out).toContain('x <y and a> b');
});

test('a wrapped list item does not join the next item into a fragment pair', async () => {
  const out = await scanFile(
    'wrapped.md',
    '- Run the build.\n  Then stop here today.\n- Go. Now.\n',
  );
  expect(out).not.toContain('today. Go.');
  expect(out).toContain(':3  fragments');
});

test('indented code, table syntax, rules and inline HTML in Markdown are not read as prose', async () => {
  const out = await scanFile(
    'blocks.md',
    'Para.\n\n    indented code delve here.\n\n| Skill | Does |\n| --- | --- |\n| Builds pages for you. | Done well. |\n\nThe longer paragraph here.\n***\nShort one here.\n\n<p>Hello <em>there</em> friend.</p>\n',
  );
  expect(out).toContain('0 flags to look at.');
});

test('indented paragraphs and nested items inside a list are still scanned', async () => {
  const out = await scanFile(
    'list-indent.md',
    '- First item.\n\n    It is not just fast, but reliable.\n\n- Second.\n\nA plain paragraph here.\n\n    code that would delve\n',
  );
  expect(out).toContain(':3  not-x-but-y');
  expect(out).not.toContain('ai-word');
});

test('alt text, titles, labels and the page description are scanned', async () => {
  const out = await scanFile(
    'attributes.html',
    '<html><head><meta name="description" content="A seamless way to work.">\n<meta property="og:title" content="Acme — the future"></head>\n<body><img alt="A vibrant dashboard" src="a.png" data-title="delve">\n<a title="Feel free to click">Go</a><button aria-label="Let us delve in">x</button></body></html>',
  );
  expect(out).toContain(
    ':1  ai-word  a word models overuse: "A seamless way to work."  (in description)',
  );
  expect(out).toContain(':2  dash');
  expect(out).toContain('(in og:title)');
  expect(out).toContain(':3  ai-word  a word models overuse: "A vibrant dashboard"  (in alt)');
  expect(out).toContain('(in title)');
  expect(out).toContain('(in aria-label)');
  expect(out).toContain('5 flags to look at.');
});

test('labels in elements side by side are read apart, not run together', async () => {
  const out = await scanFile(
    'labels.html',
    '<div><span>Under</span><span>score this</span></div><p>We un<em>delve</em>d it.</p>',
  );
  expect(out).toContain('0 flags to look at.');
});

test('a flag on a long built line names the heading it falls under', async () => {
  const filler = 'Plain words about the work go here and say what it does. '.repeat(6);
  const page = `<main><h2>Pricing</h2><p>${filler}</p><p>It is not just fast, but cheap.</p></main>`;
  const long = await scanFile('built.html', page);
  expect(long).toContain('not-x-but-y');
  expect(long).toContain('(under "Pricing")');
  const short = await scanFile(
    'short.html',
    '<h2>Pricing</h2>\n<p>It is not just fast, but cheap.</p>',
  );
  expect(short).not.toContain('under "');
});

test('a phrase said twice in one section is flagged, and once per section is not', async () => {
  const md =
    '## Builder\n\nIt was tested on the same briefs as the others. Each draft was tested on the same briefs too.\n\n## Trip Planner\n\nIt was also tested on the same briefs.\n';
  const out = await scanFile('repeat.md', md);
  expect(out).toContain(':3  repeat  says "tested on the same briefs" again in one section');
  expect(out).not.toContain(':7  repeat');
});

test('a greater-than sign inside an attribute neither ends the tag nor leaks into the text', async () => {
  const out = await scanFile(
    'quoted.html',
    '<p title="It delves &amp; more > here">Hello there friend.</p>',
  );
  expect(out).toContain('(in title)');
  expect(out).toContain('1 flag to look at.');
  expect(out).toContain('1 sentences, mean 3.0 words');
});

test("numeric entities such as React's &#x27; are decoded in text and attributes", async () => {
  const out = await scanFile(
    'react.html',
    '<p>It&#x27;s not just a tool, it&#x27;s a movement.</p><p>This isn&#x27;t about speed.</p><img alt="Here&#x27;s the thing about dashboards" src="a.png">',
  );
  expect(out).toContain('"This isn\'t about speed."');
  expect(out).toContain('run-up');
  expect(out).toContain('(in alt)');
  expect(out).toContain('3 flags to look at.');
  const repeat = await scanFile(
    'apostrophe.html',
    '<h2>Setup</h2><p>The app&#x27;s not the slow part here.</p><p>The sync&#x27;s not the problem either.</p>',
  );
  expect(repeat).toContain('0 flags to look at.');
});

test('a heading built from elements side by side stays one heading', async () => {
  const out = await scanFile(
    'numbered.html',
    '<h2><span class="n">01</span><span>Builder</span></h2><p>It was tested on the same briefs as the others.</p><h2><span class="n">02</span><span>Trip Planner</span></h2><p>It was also tested on the same briefs.</p>',
  );
  expect(out).toContain('0 flags to look at.');
  const filler = 'Plain words about the work go here and say what it does. '.repeat(6);
  const icon = await scanFile(
    'icon.html',
    `<main><h2><svg viewBox="0 0 1 1"><path d="M0"/></svg><span>Pricing</span></h2><p>${filler}</p><p>It is not just fast, but cheap.</p></main>`,
  );
  expect(icon).toContain('"It is not just fast, but cheap."  (under "Pricing")');
});

test('a Setext heading starts a new section', async () => {
  const out = await scanFile(
    'setext.md',
    'Builder\n=======\n\nIt was tested on the same briefs as the others.\n\nTrip Planner\n---------\n\nIt was also tested on the same briefs.\n',
  );
  expect(out).toContain('0 flags to look at.');
});

test('inline elements side by side stay in one sentence', async () => {
  const out = await scanFile(
    'inline.html',
    '<p>We <em>leverage</em><strong>robust</strong> tools.</p><p>It&#39;s not only <a href="#">fast</a><span class="sr-only">(new tab)</span> but cheap.</p><p>Shipped in May<a href="#n1"><sup>1</sup></a> after tests.</p>',
  );
  expect(out).toContain('"We leverage robust tools."');
  expect(out).toContain('"It\'s not only fast (new tab) but cheap."');
  expect(out).toContain('3 sentences');
});

test('alt text and titles on a long built line name their heading', async () => {
  const filler = 'Each card says what the product does and who it is for. '.repeat(6);
  const out = await scanFile(
    'alt-long.html',
    `<main><h2>Pricing</h2><p>${filler}</p><img alt="A vibrant chart"><h2>Team</h2><img alt="A vibrant photo"><a title="Feel free to ask" href="#">Ask</a></main>`,
  );
  expect(out).toContain('"A vibrant chart"  (in alt, under "Pricing")');
  expect(out).toContain('"A vibrant photo"  (in alt, under "Team")');
  expect(out).toContain('"Feel free to ask"  (in title, under "Team")');
});

test('the same button label on every card is not a repeat', async () => {
  const out = await scanFile(
    'cards.html',
    '<h2>Work</h2><div class="card"><p>Builder makes pages in your own colours.</p><a href="#">Read the full case study</a></div><div class="card"><p>Trip Planner finds remote jobs for you.</p><a href="#">Read the full case study</a></div>',
  );
  expect(out).toContain('0 flags to look at.');
});

test('alt text is compared with the rest of its section for repeats', async () => {
  const out = await scanFile(
    'alt-repeat.html',
    '<h2>Builder</h2><p>Each release is tested on the same briefs.</p><img alt="Output tested on the same briefs as last release">',
  );
  expect(out).toContain('repeat  says "tested on the same briefs" again in one section');
  expect(out).toContain('(in alt)');
});

test('a heading that starts with a picture stays a heading', async () => {
  const out = await scanFile(
    'icon-heading.html',
    '<h2><img src="i.svg" alt="Chart icon">Builder</h2><p>It was tested on the same briefs as the others.</p><h2><img src="i.svg" alt="Chart icon">Trip Planner</h2><p>It was also tested on the same briefs.</p>',
  );
  expect(out).toContain('0 flags to look at.');
});

test('alt text with several sentences stays out of rhythm, triads and fragments', async () => {
  const out = await scanFile(
    'alt-sentences.html',
    '<p>We plan the work with care.</p><p>The team ships often.</p><img alt="Logo. Fast, cheap and good. Red, green and blue. Big, small and tall." src="a.png">',
  );
  for (const id of ['triad', 'fragments', 'even-rhythm']) expect(out).not.toContain(`  ${id}  `);
  expect(out).toContain('2 sentences');
});

test('a picture in the middle of a sentence does not split it', async () => {
  const out = await scanFile(
    'inline-picture.html',
    '<p>Made with <img src="h.svg" alt="love"> in Cape Town. Ships weekly.</p>',
  );
  expect(out).toContain('0 flags to look at.');
});

test('alt text is decoded once', async () => {
  const out = await scanFile(
    'alt-entity.html',
    '<p>Plain text here.</p><img alt="Write &amp;mdash; rarely" src="a.png">',
  );
  expect(out).not.toContain('  dash  ');
  expect(out).toContain('0 flags to look at.');
});

test('alt text on image inputs and image map areas is scanned', async () => {
  const out = await scanFile(
    'alt-input.html',
    '<p>Plain text.</p><input type="image" src="go.png" alt="Unlock a vibrant future"><map><area shape="rect" coords="0,0,1,1" href="#" alt="A seamless map"></map>',
  );
  expect(out).toContain('"Unlock a vibrant future"  (in alt)');
  expect(out).toContain('"A seamless map"  (in alt)');
});

test('a label with a screen-reader note and lowercase labels side by side are not repeats', async () => {
  const note = await scanFile(
    'label-note.html',
    '<h2>Work</h2><div><p>One.</p><a href="#">Read the full case study</a><span class="sr-only">, opens in a new tab</span></div><div><p>Two.</p><a href="#">Read the full case study</a><span class="sr-only">, opens in a new tab</span></div>',
  );
  expect(note).toContain('0 flags to look at.');
  const lower = await scanFile(
    'label-lower.html',
    '<h2>Work</h2><div><a>read the full case study</a><a>see the code</a></div><div><a>read the full case study</a><a>see the code</a></div>',
  );
  expect(lower).toContain('0 flags to look at.');
});

test('titles, screen-reader labels and the page description are not compared for repeats', async () => {
  const meta = await scanFile(
    'meta-repeat.html',
    '<!doctype html><html><head><title>Alex Rivera builds tools for public sector teams</title><meta name="description" content="Tools that help public sector teams answer records requests faster."><meta property="og:title" content="Alex Rivera builds tools for public sector teams"><meta property="og:description" content="Tools that help public sector teams answer records requests faster."><meta name="twitter:description" content="Tools that help public sector teams answer records requests faster."></head><body><h1>Alex Rivera</h1><p>Short intro.</p></body></html>',
  );
  expect(meta).toContain('0 flags to look at.');
  const title = await scanFile(
    'img-title.html',
    '<p>Plain text.</p><img alt="Records Desk drafting a public records reply" title="Records Desk drafting a public records reply">',
  );
  expect(title).toContain('0 flags to look at.');
  const aria = await scanFile(
    'aria-labels.html',
    '<h2>Work</h2><div><p>One.</p><a href="#" aria-label="Read the full case study for Records Desk">Read the full case study</a></div><div><p>Two.</p><a href="#" aria-label="Read the full case study for Trip Planner">Read the full case study</a></div>',
  );
  expect(aria).toContain('0 flags to look at.');
});

test('a social title that matches the page title is not a repeat', async () => {
  const out = await scanFile(
    'og-title.html',
    '<!doctype html><html><head><title>Alex Rivera · Sidecut Studio</title><meta property="og:title" content="Alex Rivera · Sidecut Studio" /></head><body><h1>Alex Rivera</h1><p>Tools for public sector teams.</p></body></html>',
  );
  expect(out).not.toContain('  repeat  ');
});

test('a numbered heading still starts a section for alt text', async () => {
  const page = (results: string, contact: string) =>
    `<h2>How I work</h2><p>Intro.</p><h3>1. Discovery</h3><p>Plain.</p><h2>Results</h2><p>${results}</p><img alt="Every draft gets a human review step"><h2>Contact</h2><p>${contact}</p>`;
  const apart = await scanFile(
    'numbered-apart.html',
    page('Other words here.', 'Every draft gets a human review before it goes out.'),
  );
  expect(apart).toContain('0 flags to look at.');
  const together = await scanFile(
    'numbered-together.html',
    page('Every draft gets a human review before it goes out.', 'Other words here.'),
  );
  expect(together).toContain('repeat  says "every draft gets a human review" again in one section');
  expect(together).toContain('(in alt)');
});

test('HTML headings on one Markdown line each start a section', async () => {
  const out = await scanFile(
    'inline-headings.md',
    '<h3>Install</h3><p><img alt="Install the app in one click"></p><h3>Use</h3><p>Install the app in one click and go.</p>\n',
  );
  expect(out).toContain('0 flags to look at.');
});

test('a placeholder such as <area code> stays in the text', async () => {
  const out = await scanFile(
    'placeholder.md',
    'Replace <area code> with your own number before you publish this page.\n',
  );
  expect(out).toContain('1 sentences, mean 12.0 words');
});

const REVIEWED = 'Every draft gets a human review before it goes out.';
const REVIEWED_ALT = '<img alt="Every draft gets a human review step">';

test('a README heading with a logo, a line break and the name is one heading', async () => {
  const hero =
    '<h1 align="center">\n  <img alt="Acme logo" src="logo.png">\n  <br>\n  Acme\n</h1>\n\n';
  const shot =
    '<p align="center"><img alt="Acme turns meeting notes into tasks" src="shot.png"></p>';
  const together = await scanFile(
    'hero-together.md',
    `${hero}Acme turns meeting notes into tasks for your team.\n\n${shot}\n\n## Install\n\nRun the installer.\n`,
  );
  expect(together).toContain('hero-together.md:9  repeat');
  expect(together).toContain('(in alt)');
  const apart = await scanFile(
    'hero-apart.md',
    `${hero}${shot}\n\n## Install\n\nAcme turns meeting notes into tasks for your team.\n`,
  );
  expect(apart).toContain('0 flags to look at.');
});

test('a heading split by a line break or blocks inside it starts one section', async () => {
  const page = (heading: string, results: string, contact: string) =>
    `<h2>How I work</h2><p>Intro.</p><h3>${heading}</h3><p>Plain.</p><h2>Results</h2><p>${results}</p>${REVIEWED_ALT}<h2>Contact</h2><p>${contact}</p>`;
  for (const heading of ['01<br>Discovery', '<span>01</span><div>Discovery</div>']) {
    const together = await scanFile(
      'split-together.html',
      page(heading, REVIEWED, 'Other words here.'),
    );
    expect(together).toContain(
      'repeat  says "every draft gets a human review" again in one section',
    );
    const apart = await scanFile('split-apart.html', page(heading, 'Other words here.', REVIEWED));
    expect(apart).toContain('0 flags to look at.');
  }
});

test('a numbered Markdown heading starts a section', async () => {
  const out = await scanFile(
    'numbered.md',
    `## Results\n\n${REVIEWED}\n\n## 1. Discovery\n\n${REVIEWED}\n`,
  );
  expect(out).toContain('0 flags to look at.');
});

test('an HTML heading that is only a link address still starts a section', async () => {
  const before = await scanFile(
    'url-heading.md',
    '## Setup\n\nInstall the app in one click and go.\n\n<h3>https://example.com</h3>\n\n<img alt="Install the app in one click">\n\n## Next\n\nMore.\n',
  );
  expect(before).toContain('0 flags to look at.');
  const within = await scanFile(
    'url-heading-within.md',
    '## Setup\n\nMore.\n\n<h3>https://example.com</h3>\n\nInstall the app in one click and go.\n\n<img alt="Install the app in one click">\n',
  );
  expect(within).toContain('(in alt)');
});

test('a paragraph starting with # on a built page is not a heading', async () => {
  const out = await scanFile(
    'hash-paragraph.html',
    `<h2>Work</h2><p>${REVIEWED}</p>${REVIEWED_ALT}<p># of drafts reviewed each week is shown here.</p>`,
  );
  expect(out).toContain('repeat  says "every draft gets a human review" again in one section');
});

test('a private-use character in the input never becomes a heading', async () => {
  const out = await scanFile('private-use.txt', `\n\n${REVIEWED}\n\n${REVIEWED}\n`);
  expect(out).toContain('private-use.txt:5  repeat');
});

test('alt text on a long Markdown line names its heading', async () => {
  const filler = 'Lorem ipsum dolor sit amet consectetur. '.repeat(12);
  const out = await scanFile(
    'long-alt.md',
    `## Results\n\n${filler}<img alt="A seamless dashboard">\n`,
  );
  expect(out).toContain('"A seamless dashboard"  (in alt, under "Results")');
});

const WEEKLY = 'We plan the work with care every single week.';

test('a Markdown HTML heading without a closing tag ends at a blank line', async () => {
  const out = await scanFile(
    'unclosed.md',
    `<h2>Overview\n\n${WEEKLY}\n\n${WEEKLY}\n\n## Install\n\nRun the installer.\n`,
  );
  expect(out).toContain(
    'unclosed.md:5  repeat  says "we plan the work with care every single week"',
  );
});

test('an HTML heading without a closing tag ends at the next block', async () => {
  const out = await scanFile(
    'unclosed.html',
    `<h2>Overview<p>${WEEKLY}</p><p>${WEEKLY}</p><h2>Install</h2><p>Run the installer.</p>`,
  );
  expect(out).toContain('repeat  says "we plan the work with care every single week"');
});

test('a private-use entity can not pose as a mark or a heading', async () => {
  const mark = await scanFile(
    'entity-mark.html',
    `<h2>Results</h2><p>${REVIEWED}</p>${REVIEWED_ALT}<h2>Contact</h2><p>Mail me <i class="icon">&#xE100;</i> any time.</p>`,
  );
  expect(mark).toContain('repeat  says "every draft gets a human review" again in one section');
  const heading = await scanFile(
    'entity-heading.html',
    `<h2>Work</h2><p>Mail me &#xE000; any time. ${REVIEWED}</p>${REVIEWED_ALT}`,
  );
  expect(heading).toContain('repeat  says "every draft gets a human review" again in one section');
});

test('section names collapse spaces and drop closing hashes', async () => {
  const filler = 'Lorem ipsum dolor sit amet consectetur. '.repeat(12);
  const split = await scanFile(
    'split-name.html',
    `<h3>01<br>Discovery</h3><p>${filler}</p><img alt="A seamless dashboard">`,
  );
  expect(split).toContain('(in alt, under "01 Discovery")');
  const hashes = await scanFile(
    'hash-name.md',
    `## Title ##\n\n${filler}<img alt="A seamless dashboard">\n`,
  );
  expect(hashes).toContain('(in alt, under "Title")');
});

const DOCS = `# Setup

Open Settings → People and add the bot account.
The check job runs lint, types and tests on every push.
The release job reads the version, the changelog and the tag.
The deploy job builds the server, the dashboard and the profiles.
Open Settings → People, then remember speed → trust.
`;

test('page copy still flags lists of three and arrows', async () => {
  const { out } = await scan([], DOCS);
  expect(out).toContain('  triad  ');
  expect(out).toContain('Settings → People');
});

test('--docs leaves lists of three and menu paths alone but keeps other arrows', async () => {
  const path = join(TMP, 'AGENTS.md');
  await writeTestFile(path, DOCS);
  for (const args of [['--docs', path], [path, '--docs'], ['--docs']]) {
    const { code, out } = await scan(args, args.length === 1 ? DOCS : undefined);
    expect(code).toBe(0);
    expect(out).not.toContain('  triad  ');
    expect(out).not.toContain(':3  arrow');
    expect(out).toContain(':7  arrow');
  }
});

test('flags rejected draft lines from sidecut.dev previews for jargon and stacked clauses', async () => {
  const rejected = [
    [
      'Each one gets its own worktree and an agent of its own, and Offloadr stays with the pull request until it merges: a failed check or a review comment goes straight back to the agent that wrote the code, and the other agent reviews the work before you ever see it.',
      ['machinery', 'stacked-clauses'],
    ],
    [
      'In one of Agent Issue’s sample runs, the agent tells you publication is pending while its own trace shows it already tried to publish.',
      ['machinery'],
    ],
    [
      'Say that and Solo takes it from there: it finds the cause, makes the fix, hands the diff to a reviewer agent that reads it cold, and merges only the exact commit that was reviewed, once every required check has passed on it.',
      ['stacked-clauses'],
    ],
    ['Ask for a plugin, get a repo that passes CI on its first commit.', ['machinery']],
    [
      'Manifests for Claude Code, Codex and Antigravity, a bundled MCP server, a first skill, tests and automatic releases.',
      ['machinery'],
    ],
    [
      'From then on every repo runs the same checker, which points at each break with its file, line and fix, so the tenth plugin you ship looks like it came from the same hand as the first.',
      ['stacked-clauses'],
    ],
    [
      'In one of them the reply says publication is pending, while the recorded actions show it already published: a reply that reads fine, and Agent Issue fails it.',
      ['stacked-clauses'],
    ],
  ] as const;

  for (const [line, expected] of rejected) {
    const { code, out } = await scan([], `${line}\n`);
    expect(code).toBe(0);
    for (const id of expected) expect(out, line).toContain(`  ${id}  `);
  }
});

test('passes accepted lines from copy-lessons without flags', async () => {
  const accepted = [
    'Verify what your agent did, not its reply.',
    'Write the tests once and run them through Claude Code, Codex, Gemini CLI and Antigravity, with your skill and without it.',
    'The verifier’s comparison from the rebuild: the original, the rebuild, and where their pixels differ.',
    'Ask a bot in Slack… and come back to a tested pull request.',
    'AI agents default to the shortest path. These skills close the shortcut.',
  ];

  for (const line of accepted) {
    const { code, out } = await scan([], `${line}\n`);
    expect(code).toBe(0);
    expect(out, line).toContain('0 flags to look at.');
  }
});

test('flags machinery words in the first screen and allows them later on the page', async () => {
  for (const word of [
    'worktree',
    'MCP',
    'manifest',
    'CI',
    'trace',
    'harness',
    'orchestration',
    'pipeline',
    'workflow',
    'lifecycle',
  ]) {
    const firstScreen = await scan([], `This ${word} runs your local build.\n`);
    expect(firstScreen.out, word).toContain('  machinery  ');
  }

  const meta = await scanFile(
    'meta-machinery.html',
    '<!doctype html><html><head><meta name="description" content="Manage every agent workflow and MCP server."></head><body><p>Plain opening words.</p></body></html>',
  );
  expect(meta).toContain('  machinery  ');
  expect(meta).toContain('(in description)');

  const intro = [
    'Notes stay together.',
    'Your team drops weekly notes into one shared folder instead of losing decisions in long chat threads across five channels.',
    'Clients stop asking twice.',
    'Open Tuesday morning and export fresh graphics in seconds, because every colour and font stays locked to the client account you picked last month.',
    'New hires never guess.',
    'Send a draft link straight from your laptop so reviewers leave comments beside each headline instead of replying in separate emails.',
    'Approve with one click.',
    'Keep every past campaign in its own dated directory so next quarter starts with working files instead of empty templates or stale assets.',
    'Search by tag or client name whenever someone needs an earlier launch image back, and export the whole approved folder at once.',
    'Older projects stay ready.',
    'Everything exported last spring remains easy to copy when another campaign opens with the same team and product line.',
    'Start in under a minute.',
    'Share the link with your editor when the batch is ready, and download clean assets for desktop and mobile screens right away.',
  ].join(' ');
  const later = await scan(
    [],
    `# Product\n\n${intro}\n\n## Under the hood\n\nEach task runs in its own worktree and records a trace.\n`,
  );
  expect(later.out).toContain('0 flags to look at.');
});

test('flags counts of tests, PRs, skills or tools, and leaves --docs alone', async () => {
  for (const line of [
    'Backed by 420 tests before every release.',
    'Ships after 18 PRs landed this week.',
    'Over 120 pull requests merged automatically.',
    'Includes 17 skills ready to install.',
    'Connects dozens of tools out of the box.',
  ]) {
    const { out } = await scan([], `${line}\n`);
    expect(out, line).toContain('  vanity-count  ');
  }

  const plain = await scan([], 'Write your tests once and keep 1 tool beside your editor.\n');
  expect(plain.out).toContain('0 flags to look at.');

  const docs = await scan(['--docs'], 'The workflow runs CI with 120 tests across 6 tools.\n');
  expect(docs.out).toContain('0 flags to look at.');
});

test('flags "brief" used for an agent or writer prompt, while leaving ordinary uses alone', async () => {
  for (const line of [
    'Brief the writer with the rejected lines.',
    "Check the subagent's brief before running it.",
    'Give each worker the same brief.',
    'The task brief names the required checks.',
  ]) {
    const { out } = await scan([], `${line}\n`);
    expect(out, line).toContain('  agent-brief  ');
    const docOut = await scan(['--docs'], `${line}\n`);
    expect(docOut.out, `--docs ${line}`).toContain('  agent-brief  ');
  }

  for (const ok of [
    'Give the agent a brief summary first.',
    'In brief, the agent checks the build locally.',
    'It was tested on the same briefs as the others.',
  ]) {
    const { out } = await scan([], `${ok}\n`);
    expect(out, ok).toContain('0 flags to look at.');
  }
});
