#!/usr/bin/env node
// Flags common AI-writing patterns in copy so an editor can look at each one.
// A flag is a place to look, never a verdict: the editor decides what stays.
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';

const HELP = `Usage: node scan-copy.mjs [--docs] [file ...]

Scans Markdown, HTML or plain text for common AI-writing tells, first-screen
machinery words, stacked clauses, vanity counts and "brief" used for an agent
prompt, and prints one line per flag: file:line, pattern, excerpt. Reads standard
input when no file is given, treating it as HTML when it starts with a tag and
as Markdown otherwise. Code blocks, inline code, comments, scripts and styles are
skipped. Lines wrapped inside a paragraph are joined before sentences are
counted.

Alt text, title and aria-label attributes and the page's description and
social titles are scanned too. On a built page whose text sits on a few long
lines, each flag also names the heading it falls under. A phrase repeated
within one section is flagged, alt text included, since saying the same thing
twice is the most common padding; titles, screen-reader labels and the page
description aren't compared, and a link or button label on its own, such as
one per card, isn't counted.

With --docs, the input is agent or reference docs (AGENTS.md, docs/, config
comments), where lists of three, menu paths such as "Settings → People",
technical terms and counts are normal, so those aren't flagged.

Prints sentence-rhythm figures for each input. Exits 0 when every input was
scanned, 1 when a file couldn't be read; the other files are still scanned.`;

// Each pattern: id, a short reason, and a regular expression tested per sentence.
const PATTERNS = [
  [
    'not-x-but-y',
    'contrast with something no one claimed',
    /\bnot (?:just|only|merely|simply)\b[^.?!]{0,90}\bbut\b/i,
  ],
  [
    'not-x-but-y',
    'contrast with something no one claimed',
    /\b(?:it|this|that)(?:'s| is) not\b[^.?!]{0,70}[,;:—–]\s*(?:it|this|that)(?:'s| is)\b/i,
  ],
  [
    'not-x-but-y',
    'contrast with something no one claimed',
    /\b(?:isn't|is not|aren't|are not|wasn't) (?:about|just)\b/i,
  ],
  [
    'run-up',
    'announces the point instead of making it',
    /^(?:let's (?:dive|explore|break|unpack|take a look)|here's (?:the thing|what you need|why|how)|the (?:thing|truth|reality) is|honestly[,?]|look,|real talk|without further ado|in today's (?:fast-paced|digital|ever-changing|world|landscape)|quick note|heads up)/i,
  ],
  [
    'deep-saying',
    'dresses an ordinary point as a hidden truth',
    /\b(?:at its core|the real (?:question|answer|problem) is|what (?:really|truly) matters|the heart of the matter|is the (?:language|currency|architecture|future) of)\b/i,
  ],
  [
    'closer',
    'a line that restates instead of adding',
    /^(?:and )?(?:that's|this is|that is) (?:the (?:real |whole )?(?:win|point|difference|magic|secret)|what (?:matters|counts)|why it matters)\b/i,
  ],
  [
    'closer',
    'a line that restates instead of adding',
    /\b(?:let that sink in|read that again|full stop)[.!]*$/i,
  ],
  [
    'ai-word',
    'a word models overuse',
    /\b(?:delve|delves|delving|tapestry|testament to|pivotal|underscores?|underscoring|showcas(?:e|es|ing)|intricate|meticulous(?:ly)?|vibrant|seamless(?:ly)?|robust|leverag(?:e|es|ing)|elevate[sd]?|empower(?:s|ing)?|unlock(?:s|ing)?|game[- ]changer|ever-evolving|realm|multifaceted|bolster(?:s|ed)?|garner(?:s|ed)?|boasts|holistic|synergy|paradigm)\b/i,
  ],
  [
    'ing-tail',
    'a vague -ing phrase tacked onto a fact',
    /, (?:highlighting|underscoring|emphasizing|showcasing|reflecting|symbolizing|ensuring|fostering|cementing|reinforcing|contributing to|paving the way)\b/i,
  ],
  ['serves-as', '"is" dressed up', /\b(?:serves?|stands?|functions?) as (?:a|an|the)\b/i],
  [
    'sales',
    'hype that a fact would beat',
    /\b(?:revolutionary|revolutioni[sz]e|next-level|unparalleled|world-class|best-in-class|cutting-edge|state-of-the-art|supercharge[sd]?|effortless(?:ly)?|transformative|blazing(?:ly)? fast|take .{1,20} to the next level)\b/i,
  ],
  [
    'hedge',
    'filler or a stacked hedge',
    /\b(?:it's worth noting|it is worth noting|it's important to note|it is important to note|worth mentioning|needless to say|(?:may|might|could) (?:potentially|possibly))\b/i,
  ],
  [
    'vague-source',
    'authority with no name',
    /\b(?:experts (?:say|agree)|studies (?:show|suggest)|many (?:believe|people say)|research shows)\b/i,
  ],
  [
    'chat-residue',
    'leftover from a chat reply',
    /(?:^certainly!|\b(?:i hope this helps|great question|as an ai|let me know if|feel free to|happy to help)\b)/i,
  ],
  [
    'doc-talk',
    'talks about the text instead of its subject',
    /\b(?:this (?:section|document|page|guide|readme|post|article) (?:will |)(?:explain|cover|describe|walk|explore|outline)s?|in this (?:section|guide|post|article),)/i,
  ],
  ['arrow', 'an arrow standing in for a word', /(?:→|->|=>)/],
];

// En dashes between numbers are ranges, not connectors.
// An arrow between two capitalised labels, as in "Settings → People", is a menu path.
const MENU_PATH = /\b[A-Z][\w-]*\s+(?:→|->)\s+(?=[A-Z])/g;

const DASH = /[—]|(?<!\d)–|–(?!\d)|\s--\s/;
const TRIAD =
  /\b[\w'-]+(?: [\w'-]+){0,2}, [\w'-]+(?: [\w'-]+){0,2},? (?:and|or) [\w'-]+(?: [\w'-]+){0,2}\b/i;
const SPLIT_CONTRAST = /\b(?:does not|doesn't) mean\b/i;
const IT_MEANS = /^(?:it|this|that) means\b/i;
const FIRST_SCREEN_WORDS = 150;
const FIRST_SCREEN_META =
  /^(?:description|og:title|og:description|twitter:title|twitter:description)$/;
const MACHINERY =
  /\b(?:worktrees?|mcp|manifests?|ci|traces?|harness(?:es)?|orchestrat(?:e|es|ed|ing|ion)|pipelines?|workflows?|lifecycles?)\b/i;
const VANITY_COUNT =
  /\b(?:(?:over|more than|nearly|almost|around|about)\s+)?(?:(?:[2-9]\d*|1\d+)(?:,\d{3})*\+?|dozens of|hundreds of|thousands of|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty)\s+(?:[a-z-]+\s+){0,2}(?:tests?|prs?|pull requests?|skills?|tools?)\b/i;
const CLAUSE_JOIN =
  /;|:(?=\s+\S+(?:\s+\S+){2,})|,\s+(?:and|or|but|so|yet|which|who|where|when|while|because|since|although|though|unless|until|before|after|once)\b/gi;
const AGENT_SUBJECT = /\b(?:agents?|writers?|subagents?|workers?|models?)\b/i;
const BRIEF_VERB =
  /\bbrief(?:s|ed|ing)?\s+(?:the\s+|an?\s+|each\s+|every\s+|another\s+|any\s+|other\s+)?(?:agents?|writers?|subagents?|workers?|models?)\b/i;
const BRIEF_NOUN = /\b(?:agents?|writers?|subagents?|workers?|models?|task)(?:'s|s')?\s+briefs?\b/i;
const BRIEF_ADJ_NOUN =
  /\bbrief\s+(?:summary|overview|note|notes|look|check|guide|description|intro|introduction|example|pause|wait|delay|reply|answer|message|history|list|line|tour|visit|stop|chat)\b/gi;
// A line that starts a new block: a list item, heading, table row or quote.
const BLOCK_START = /^[ \t]*(?:[-*+] |\d+[.)] |#|\||>)/;
// The underline of a Setext heading, or a horizontal rule.
const UNDERLINE = /^[ \t]*(?:=+|-+|\*{3,}|_{3,})[ \t]*$/;
// Inline HTML elements, plus custom elements, which always have a hyphen. A bare "<y and a>" in
// prose isn't one of these, so it stays text.
const HTML_INLINE =
  /<\/?(?:a|abbr|(?:area|map)(?=\s[^<>]*=|\s*\/?>)|b|bdi|bdo|big|button|cite|data|del|dfn|em|font|form|g|head|body|html|i|img|input|ins|kbd|label|link|mark|meta|option|path|picture|q|s|samp|select|small|source|span|strong|sub|sup|svg|textarea|time|title|u|var|wbr|[a-z]+-[a-z-]+)\b(?:"[^"]*"|'[^']*'|[^'">])*>/gi;
// Paragraph-level HTML elements; inline ones such as em or a are part of the sentence.
const HTML_BLOCK =
  /<\/?(?:p|h[1-6]|li|ul|ol|dl|div|section|article|header|footer|nav|main|aside|br|hr|figure|figcaption|table|caption|tr|td|th|blockquote|dt|dd|details|summary|fieldset|legend|address)\b(?:"[^"]*"|'[^']*'|[^'">])*>/gi;
// An element closed right before another opens never runs its text into the next one. When the
// next text starts with a capital or a digit, as in <span>How I work</span><span>Discovery</span>,
// they're separate labels on a built page; otherwise, as in <em>fast</em><strong>cheap</strong> or
// a link followed by a screen-reader note, they're one sentence. Footnote marks and a heading's own
// pieces (an icon or number beside its title) always stay in the sentence.
const ADJACENT = /<\/([a-z][\w-]*)\s*>(?=<([a-z][\w-]*))/gi;
const NOTE_TAGS = /^(?:sup|sub)$/i;
const LABEL_TAGS = /^(?:a|button)$/i;
// Attributes people read: alt text, tooltips, screen-reader labels and the page's own summary.
const ATTRIBUTE = /(?<![\w-])(alt|title|aria-label)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
const META_NAME =
  /\b(?:name|property)\s*=\s*["']?(description|og:description|og:title|twitter:description|twitter:title)["'\s>/]/i;
const META_CONTENT = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i;
const STOPWORDS = new Set(
  'a an and are as at be but by can do does for from has have he her his i if in into is it its my no not of on one or our out she so than that the their them then there they this to up was we were what when who will with you your'.split(
    ' ',
  ),
);

// Replace characters we skip with spaces, so line numbers stay true.
function blank(text) {
  return text.replace(/[^\n]/g, ' ');
}

// Keep only the newlines, so a removed inline tag doesn't split a word.
function vanish(text) {
  return text.replace(/[^\n]/g, '');
}

const ENTITIES = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&rsquo;': "'",
  '&lsquo;': "'",
  '&ldquo;': '"',
  '&rdquo;': '"',
  '&mdash;': '—',
  '&ndash;': '–',
};

// Named entities above, and every numeric one, such as React's &#x27; for an apostrophe.
const ENTITY = /&(?:#x([0-9a-f]{1,6})|#(\d{1,7})|[a-z]+);/gi;

function decode(text) {
  return text.replace(ENTITY, (m, hex, dec) => {
    if (hex === undefined && dec === undefined) return ENTITIES[m.toLowerCase()] ?? m;
    const code = hex === undefined ? Number(dec) : Number.parseInt(hex, 16);
    // A numeric newline would shift every line number after it, so it reads as a space.
    if (code === 10 || code === 13) return ' ';
    // A private-use character, such as an icon font's &#xE100;, can't pose as one of the scan's
    // own marks, so it reads as unknown, as it does when written out in the input.
    if (code >= 0xe000 && code <= 0xf8ff) return '\uFFFD';
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
  });
}

// A block element ends the sentence before it; \u2029 marks the break. \uE000 marks a heading
// with its closing tag and \uE001 one without, so each flag can name the heading it falls under.
// Closed headings are marked by stripTags, so a heading opening here has no closing tag.
function blockBreak(m) {
  return /^<h[1-6]\b/i.test(m) ? `\u2029\uE001${blank(m).slice(2)}` : `\u2029${blank(m).slice(1)}`;
}

// The first character of text after any tags and field marks, read in place so a long page
// stays fast.
const NEXT_TEXT = /(?:<[^>]*>|[\uE100-\uF7FF])*([^<]?)/y;

// Where each tag with text people read sits, marked by one private-use character per tag (from
// \uE100) so stripping can't lose its place. \uE000 and \uE001 mark headings. Input never holds
// any of them: scan() replaces every private-use character first, and decode() any entity for one.
const MARK = 0xe100;
const MARKS = 0x1700;
const MARKED = /[\uE100-\uF7FF]/g;

// A whole HTML heading with its closing tag, so a line break or block inside it, such as a logo
// above the name or a number above the title, stays inside that heading. It never runs past the
// next heading's opening tag, so a heading without a closing tag doesn't swallow the next one.
const HEADING = /<h([1-6])\b(?:"[^"]*"|'[^']*'|[^'">])*>(?:(?!<h[1-6]\b)[\s\S])*?<\/h\1\s*>/gi;

function adjacent(m, closed, opened, offset, all) {
  if (NOTE_TAGS.test(closed) || NOTE_TAGS.test(opened)) return `${m} `;
  // Two links or buttons side by side are two labels, whatever case they start with.
  if (LABEL_TAGS.test(closed) && LABEL_TAGS.test(opened)) return `${m}\u2029`;
  NEXT_TEXT.lastIndex = offset + m.length;
  const next = NEXT_TEXT.exec(all)?.[1] ?? '';
  return /[\p{Lu}\d]/u.test(next) ? `${m}\u2029` : `${m} `;
}

function stripTags(text) {
  return (
    text
      .replace(HEADING, (h) =>
        h.replace(HTML_BLOCK, (m, at) =>
          at === 0 ? `\u2029\uE000${blank(m).slice(2)}` : at + m.length === h.length ? m : blank(m),
        ),
      )
      .replace(HTML_BLOCK, blockBreak)
      // A heading's own pieces, such as a number or icon beside its title, stay one heading.
      .replace(/[\uE000\uE001][^\u2029]*/g, (heading) => heading.replace(ADJACENT, '$& '))
      .replace(ADJACENT, adjacent)
      .replace(HTML_INLINE, vanish)
  );
}

function codeFreeHtml(source) {
  return source
    .replace(/<(script|style|code|pre)\b[\s\S]*?<\/\1>/gi, blank)
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/<!doctype[^>]*>/gi, blank);
}

function stripHtml(source) {
  return decode(stripTags(source));
}

// Text people read that lives in attributes, with the line each one starts on.
function attributes(source) {
  const out = [];
  for (const tag of source.matchAll(/<[a-z][\w-]*\b(?:"[^"]*"|'[^']*'|[^'">])*>/gi)) {
    const end = tag.index + tag[0].length;
    const add = (field, offset, value) => {
      const text = decode(value).trim();
      if (text) out.push({ field, end, line: source.slice(0, offset).split('\n').length, text });
    };
    if (/^<meta\b/i.test(tag[0])) {
      const name = META_NAME.exec(tag[0]);
      const content = META_CONTENT.exec(tag[0]);
      if (name && content)
        add(name[1].toLowerCase(), tag.index + content.index, content[1] ?? content[2]);
      continue;
    }
    // Alt text on img, input type=image and area, plus tooltips and screen-reader labels, each
    // decoded once and read apart from the page's text, so a picture never splits a sentence.
    for (const a of tag[0].matchAll(ATTRIBUTE))
      add(a[1].toLowerCase(), tag.index + a.index, a[2] ?? a[3]);
  }
  return out;
}

// Indented code is four spaces or a tab after a blank line, unless it continues a list item,
// whose paragraphs and nested items are indented the same way.
function stripIndentedCode(text) {
  let inList = false;
  let afterBlank = true;
  let inCode = false;
  return text
    .split('\n')
    .map((line) => {
      if (!line.trim()) {
        afterBlank = true;
        return line;
      }
      const indented = /^(?: {4}|\t)/.test(line);
      if (inCode && indented) return blank(line);
      inCode = false;
      if (indented && afterBlank && !inList) {
        inCode = true;
        return blank(line);
      }
      if (/^[ \t]*(?:[-*+]|\d+[.)])[ \t]/.test(line)) inList = true;
      else if (!/^[ \t]/.test(line)) inList = false;
      afterBlank = false;
      return line;
    })
    .join('\n');
}

function codeFreeMarkdown(source) {
  const fenced = source
    // Frontmatter only at the very start, and only when it opens with a key: line.
    .replace(/^---\n(?=[\w-]+:)[\s\S]*?\n---(?=\n|$)/, blank)
    .replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, blank);
  return stripIndentedCode(fenced)
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/<(script|style|code|pre)\b[\s\S]*?<\/\1>/gi, blank)
    .replace(/`[^`\n]+`/g, blank);
}

function stripMarkdown(source) {
  return stripTags(
    source
      // Table separator rows go (they always have a pipe; a bare --- is a rule or a Setext
      // underline); each cell of a row is read as its own block.
      .replace(
        /^(?=[^\n]*\|)[ \t]*\|?[ \t]*:?-{3,}:?[ \t]*(?:\|[ \t]*:?-{3,}:?[ \t]*)*\|?[ \t]*$/gm,
        blank,
      )
      .replace(/^[ \t]*\|.*$/gm, (row) => row.replace(/\|/g, '\u2029')),
  )
    .replace(/\]\([^)\n]*\)/g, (m) => `]${blank(m.slice(1))}`)
    .replace(/https?:\/\/[^\s\uE100-\uF7FF]+/g, blank);
}

// Split into sentences, each with the line it starts on, whether it opens a paragraph or list
// item, and the section it falls in. Wrapped lines inside a paragraph are joined first; the join
// keeps every offset, so line numbers still point at the source.
//
// This is the one place that decides what is a heading. An HTML heading runs to its closing tag;
// one without a closing tag (\uE001) ends at the next block-level tag, a new heading included,
// or at a blank line, whichever comes first, in HTML and Markdown alike. A Markdown or
// plain-text heading (# or a Setext underline) runs to the end of its line, and only those kinds have them, so a "# " paragraph on
// a built page stays a paragraph. Each heading starts a section, even when its first piece is a
// number such as "1." that is too short to keep as a sentence. sections[0] is the text before any
// heading; each entry has where it starts in the text and its heading's words.
function outline(text, kind) {
  const out = [];
  const sections = [{ start: -1, name: '' }];
  const lineHeadings = kind === 'markdown' || kind === 'text';
  const source = text.split('\n');
  const quoted = source.map((line) => /^[ \t]*>/.test(line));
  // Blank quote markers so wrapped quote lines join like any paragraph.
  const lines = source.map((line) =>
    line.replace(/^(?:[ \t]*>[ \t]?)+/, (m) => ' '.repeat(m.length)),
  );
  const joined = lines
    .map((line, i) => {
      const next = lines[i + 1];
      if (next === undefined) return line;
      const keep =
        !line.trim() ||
        !next.trim() ||
        quoted[i] !== quoted[i + 1] ||
        BLOCK_START.test(next) ||
        UNDERLINE.test(next) ||
        UNDERLINE.test(line) ||
        /^[ \t]*(?:#|\|)/.test(line);
      return keep ? `${line}\n` : `${line} `;
    })
    .join('');
  // A full stop ends a sentence only before a space or the end, so names like a.html stay whole.
  // \u2029 marks where an HTML block element ended.
  const re = /(?:[^.!?\n\u2029]|[.!?]+(?!["'”’)]*(?:\s|$)))*(?:[.!?]+["'”’)]*|\n|\u2029|$)/g;
  let opens = true;
  // What ends the heading being read: a block break, a line's end, or for an HTML heading
  // without a closing tag a block break or blank line.
  let heading = null;
  for (let match = re.exec(joined); match && match[0] !== ''; match = re.exec(joined)) {
    const raw = match[0];
    const lead = raw.length - raw.trimStart().length;
    const start = match.index + lead;
    const lineStart = joined.lastIndexOf('\n', start - 1) + 1;
    // A sentence that starts a list item or heading opens its own block, numbered items included.
    const item =
      /^[ \t]*(?:[-*+]|\d+[.)]|#+)?[ \t]*$/.test(joined.slice(lineStart, start)) &&
      // joined has the same offsets as text but fewer newlines, so count lines in text.
      BLOCK_START.test(source[text.slice(0, lineStart).split('\n').length - 1] ?? '');
    const line = text.slice(0, start).split('\n').length;
    const closed = raw.includes('\uE000');
    const unclosed = raw.includes('\uE001');
    // A # heading starts its line; a Setext heading is a text line underlined with = or -.
    const atx =
      lineHeadings &&
      /^[ \t]*$/.test(joined.slice(lineStart, start)) &&
      /^#{1,6}(?:[ \t]|$)/.test(raw.trimStart());
    const setext =
      lineHeadings &&
      /^[ \t]*(?:=+|-+)[ \t]*$/.test(source[line] ?? '') &&
      !!source[line - 1]?.trim() &&
      !BLOCK_START.test(source[line - 1]);
    if (closed || unclosed || ((atx || setext) && heading === null)) {
      heading = { end: closed || unclosed ? '\u2029' : '\n', blank: unclosed };
      sections.push({ start: match.index, name: '' });
    }
    const inHeading = heading !== null;
    if (inHeading) {
      const words = raw
        .replace(/[\u2029\uE000\uE001]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^#+\s*/, '')
        .replace(/\s+#+$/, '');
      const open = sections.at(-1);
      open.name = `${open.name} ${words}`.trim();
    }
    const body = raw
      .replace(/^[\s#>*\-+=_\d.)\u2029\uE000\uE001]+/, '')
      .replace(/[\u2029\uE000\uE001]/g, '')
      .trim();
    if (body.length > 1) {
      out.push({
        text: body,
        line,
        opens: opens || item,
        heading: inHeading,
        section: sections.length - 1,
        words: body.split(/\s+/).filter(Boolean).length,
      });
      opens = false;
    }
    const rest = joined.slice(match.index + raw.length);
    const blankAfter = /\n[ \t]*$/.test(raw) && /^[ \t]*\n/.test(rest);
    if (inHeading && (raw.endsWith(heading.end) || (heading.blank && blankAfter))) heading = null;
    // A blank line, a rule, a heading underline or a block boundary starts a new paragraph.
    if (UNDERLINE.test(raw.trim())) opens = true;
    if (/\n[ \t]*$/.test(raw) && /^[ \t]*\n/.test(joined.slice(match.index + raw.length)))
      opens = true;
    if (raw.endsWith('\u2029') || /^\s*\u2029/.test(joined.slice(match.index + raw.length)))
      opens = true;
  }
  return { pieces: out, sections };
}

// The section a place in the text falls in: the last one starting at or before it.
function sectionAt(sections, at) {
  let found = 0;
  for (let i = 1; i < sections.length && sections[i].start <= at; i++) found = i;
  return found;
}

function kindOf(name, source) {
  const ext = extname(name).toLowerCase();
  if (ext === '.html' || ext === '.htm') return 'html';
  if (ext === '.md' || ext === '.markdown') return 'markdown';
  if (name === 'stdin') {
    // A README often opens with a comment or a badge block, so a leading tag alone isn't enough.
    const page = /^\s*<(?:!doctype|html|head|body)\b/i.test(source);
    const markdown = /^(?:```|~~~|#{1,6} |[-*+] )|`[^`\n]+`|\]\(/m.test(source);
    return page || (/^\s*</.test(source) && !markdown) ? 'html' : 'markdown';
  }
  return 'text';
}

// A phrase of four words, two of them meaningful, said again later in the same section. The
// flag quotes the longest run of words the two sentences share from there. A link or button
// label on its own, such as one "Read the case study" per card, is interface text, not a claim.
function repeats(sections, labels) {
  const found = [];
  for (const section of sections) found.push(...repeatsIn(section, labels));
  return found;
}

function repeatsIn(section, labels) {
  const found = [];
  const seen = new Set();
  for (const s of section) {
    if (isLabel(s.text, labels)) continue;
    const words = s.text.toLowerCase().match(/[a-z0-9][a-z0-9'’-]*/g) ?? [];
    const grams = [];
    for (let i = 0; i + 4 <= words.length; i++) grams.push(words.slice(i, i + 4).join(' '));
    const meaningful = (g) =>
      g.split(' ').filter((w) => !STOPWORDS.has(w) && !/^\d+$/.test(w)).length >= 2;
    const first = grams.findIndex((g) => meaningful(g) && seen.has(g));
    if (first !== -1) {
      let last = first;
      while (last + 1 < grams.length && seen.has(grams[last + 1])) last++;
      found.push({ s, gram: words.slice(first, last + 4).join(' ') });
    }
    for (const g of grams) seen.add(g);
  }
  return found;
}

// A label, or a label followed by a short note for screen readers, such as ", opens in a new tab".
function isLabel(text, labels) {
  const key = labelKey(text);
  if (labels.has(key)) return true;
  for (const label of labels)
    if (
      key.startsWith(label) &&
      key.length - label.length <= 40 &&
      /^\s*[,(–—-]/.test(key.slice(label.length))
    )
      return true;
  return false;
}

function labelKey(text) {
  return text
    .toLowerCase()
    .replace(/[\s.!?:→>]+$/u, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// The words of every link and button, so repeats() can tell a label from a sentence.
function labelsOf(clean) {
  const labels = new Set();
  for (const m of clean.matchAll(/<(a|button)\b(?:"[^"]*"|'[^']*'|[^'">])*>([\s\S]*?)<\/\1\s*>/gi))
    labels.add(labelKey(decode(m[2].replace(/<[^>]*>/g, ''))));
  for (const m of clean.matchAll(/\[([^\]\n]+)\]\(/g)) labels.add(labelKey(m[1]));
  labels.delete('');
  return labels;
}

function hasAgentBrief(text) {
  if (BRIEF_VERB.test(text) || BRIEF_NOUN.test(text)) return true;
  if (!AGENT_SUBJECT.test(text)) return false;
  const cleaned = text.replace(/\bin brief\b/gi, '').replace(BRIEF_ADJ_NOUN, '');
  return /\bbriefs?\b/i.test(cleaned);
}

// Counts mid-sentence clause joins, ignoring the final ", and/or item" of an Oxford-comma list.
function hasStackedClauses(text) {
  let joins = 0;
  for (const match of text.matchAll(CLAUSE_JOIN)) {
    const token = match[0];
    if (/^,\s+(?:and|or)$/i.test(token)) {
      const before = text.slice(0, match.index);
      const lastComma = before.lastIndexOf(',');
      const barePrecedingComma =
        lastComma !== -1 &&
        !/^,\s+(?:and|or|but|so|yet|which|who|where|when|while|because|since|although|though|unless|until|before|after|once)\b/i.test(
          before.slice(lastComma),
        );
      const after = text.slice(match.index + token.length).split(/[,;:!?]/, 1)[0];
      const tailWords = after.trim().split(/\s+/).filter(Boolean).length;
      if (barePrecedingComma && tailWords <= 4) continue;
    }
    joins++;
    if (joins >= 2) return true;
  }
  return false;
}

function scan(name, input, { docs = false } = {}) {
  // Private-use characters are the scan's own marks, so any in the input are read as unknown.
  const source = input.replace(/\r\n?/g, '\n').replace(/[\uE000-\uF8FF]/g, '\uFFFD');
  const kind = kindOf(name, source);
  const clean =
    kind === 'html'
      ? codeFreeHtml(source)
      : kind === 'markdown'
        ? codeFreeMarkdown(source)
        : source;
  // Mark the end of every tag with text people read, strip the page, then note where each mark
  // landed and take the marks out again.
  const attrs = kind === 'text' ? [] : attributes(clean);
  const ends = [...new Set(attrs.map((a) => a.end))];
  const order = new Map(ends.map((end, i) => [end, i]));
  const parts = [];
  let from = 0;
  ends.forEach((end, i) => {
    if (i >= MARKS) return;
    parts.push(clean.slice(from, end), String.fromCharCode(MARK + i));
    from = end;
  });
  parts.push(clean.slice(from));
  const marked = parts.join('');
  const stripped =
    kind === 'html' ? stripHtml(marked) : kind === 'markdown' ? stripMarkdown(marked) : marked;
  const landed = [];
  let removed = 0;
  const text = stripped.replace(MARKED, (m, at) => {
    landed[m.charCodeAt(0) - MARK] = at - removed++;
    return '';
  });
  const { pieces: list, sections: outlined } = outline(text, kind);
  // On a built page most text shares a few long lines, so a line number alone can't find a flag.
  const lines = source.split('\n');
  const long = (line) => kind !== 'text' && (lines[line - 1] ?? '').length > 300;
  const place = (field, heading, line) =>
    [field && `in ${field}`, heading && long(line) && `under "${heading.slice(0, 40)}"`]
      .filter(Boolean)
      .join(', ') || undefined;
  const sections = outlined.map(() => []);
  for (const s of list) {
    if (s.heading) continue;
    s.where = place(undefined, outlined[s.section].name, s.line);
    sections[s.section].push(s);
  }
  // A tag's section is where its mark landed; a mark that didn't survive takes the one before.
  const tagSection = [];
  ends.forEach((_, i) => {
    tagSection[i] =
      landed[i] === undefined ? (tagSection[i - 1] ?? 0) : sectionAt(outlined, landed[i]);
  });
  const fields = attrs.flatMap((a) => {
    const section = tagSection[order.get(a.end)];
    return outline(a.text, 'field').pieces.map((s) => ({
      ...s,
      line: a.line + s.line - 1,
      where: place(a.field, outlined[section].name, a.line),
      field: a.field,
      section,
    }));
  });
  // Alt text joins its section for repeats, after that section's prose. Titles, screen-reader
  // labels and the page description often restate the text beside them on purpose, so they don't.
  for (const f of fields) if (f.field === 'alt') sections[f.section].push(f);
  // Attribute text is checked for patterns, and alt text for repeats, but none of it is prose,
  // so rhythm, triads and fragments read only the page's own sentences.
  const prose = list;
  const flags = [];
  const flag = (s, id, why, excerpt) =>
    flags.push({
      line: s.line,
      where: s.where,
      id,
      why,
      excerpt: excerpt.replace(/\s+/g, ' ').slice(0, 90),
    });
  for (const s of [...list, ...fields]) {
    for (const [id, why, re] of PATTERNS) {
      const text = docs && id === 'arrow' ? s.text.replace(MENU_PATH, '') : s.text;
      if (re.test(text)) {
        flag(s, id, why, s.text);
        break;
      }
    }
  }
  for (const group of [list, fields])
    for (let i = 1; i < group.length; i++) {
      if (SPLIT_CONTRAST.test(group[i - 1].text) && IT_MEANS.test(group[i].text))
        flag(
          group[i - 1],
          'not-x-but-y',
          'contrast split across two sentences',
          `${group[i - 1].text} ${group[i].text}`,
        );
    }
  for (const s of [...list, ...fields].filter((s) => DASH.test(s.text)))
    flag(s, 'dash', "a dash doing a comma or colon's job", s.text);
  if (!docs) {
    let wordsBefore = 0;
    const firstScreenSections = new Set([0]);
    for (const s of list) {
      if (wordsBefore < FIRST_SCREEN_WORDS) {
        firstScreenSections.add(s.section);
        if (MACHINERY.test(s.text))
          flag(s, 'machinery', 'machinery word in the first screen', s.text);
      }
      wordsBefore += s.words;
    }
    for (const f of fields) {
      const inOpening =
        FIRST_SCREEN_META.test(f.field) ||
        (f.field === 'alt' && firstScreenSections.has(f.section));
      if (inOpening && MACHINERY.test(f.text))
        flag(f, 'machinery', 'machinery word in the first screen', f.text);
    }
    for (const s of [...list, ...fields].filter((s) => VANITY_COUNT.test(s.text)))
      flag(s, 'vanity-count', 'count of tests, PRs, skills or tools', s.text);
  }
  for (const s of list.filter((s) => hasStackedClauses(s.text)))
    flag(s, 'stacked-clauses', 'three or more clauses stacked in one sentence', s.text);
  for (const s of [...list, ...fields].filter((s) => hasAgentBrief(s.text)))
    flag(s, 'agent-brief', 'say "prompt" instead of "brief" for agent instructions', s.text);
  const triads = prose.filter((s) => TRIAD.test(s.text));
  if (!docs && prose.length && triads.length >= 3 && triads.length / prose.length > 0.15)
    for (const s of triads) flag(s, 'triad', 'lists of three on repeat', s.text);
  // Two short sentences in a row inside one paragraph read as staged fragments.
  for (let i = 1; i < prose.length; i++) {
    const a = prose[i - 1];
    const b = prose[i];
    if (a.words <= 4 && b.words <= 4 && !b.opens && /[.!?]$/.test(a.text) && /[.!?]$/.test(b.text))
      flag(a, 'fragments', 'staged fragments in a row', `${a.text} ${b.text}`);
  }
  for (const { s, gram } of repeats(sections, kind === 'text' ? new Set() : labelsOf(clean)))
    flag(s, 'repeat', `says "${gram}" again in one section`, s.text);
  const counted = prose.filter((s) => s.words >= 3 && /[.!?]["'”’)]*$/.test(s.text));
  const lengths = counted.map((s) => s.words);
  const mean = lengths.reduce((a, b) => a + b, 0) / (lengths.length || 1);
  const spread = Math.sqrt(
    lengths.reduce((a, b) => a + (b - mean) ** 2, 0) / (lengths.length || 1),
  );
  const band = lengths.filter((n) => n >= 8 && n <= 20).length / (lengths.length || 1);
  const rhythm = { sentences: lengths.length, mean, spread, band };
  if (lengths.length >= 8 && (spread < 4.5 || band > 0.8))
    flag(
      { line: counted[0].line },
      'even-rhythm',
      'sentence lengths barely vary',
      `${Math.round(band * 100)}% of sentences are 8 to 20 words; spread ${spread.toFixed(1)}`,
    );
  flags.sort((a, b) => a.line - b.line);
  return { flags, rhythm };
}

function main(args) {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    return 0;
  }
  const docs = args.includes('--docs');
  const files = args.filter((a) => a !== '--docs');
  const inputs = files.length === 0 ? ['stdin'] : files;
  let total = 0;
  let failed = false;
  for (const name of inputs) {
    let source;
    try {
      source = readFileSync(name === 'stdin' && files.length === 0 ? 0 : name, 'utf8');
    } catch (error) {
      console.log(
        `Can't read ${name}: ${error.code ?? error.message}. Check the path and try again.`,
      );
      failed = true;
      continue;
    }
    const { flags, rhythm } = scan(name, source, { docs });
    total += flags.length;
    for (const f of flags)
      console.log(
        `${name}:${f.line}  ${f.id}  ${f.why}: "${f.excerpt}"${f.where ? `  (${f.where})` : ''}`,
      );
    if (rhythm.sentences)
      console.log(
        `${name}: ${rhythm.sentences} sentences, mean ${rhythm.mean.toFixed(1)} words, spread ${rhythm.spread.toFixed(1)}, ${Math.round(rhythm.band * 100)}% between 8 and 20 words`,
      );
  }
  console.log(`${total} ${total === 1 ? 'flag' : 'flags'} to look at.`);
  return failed ? 1 : 0;
}

process.exitCode = main(process.argv.slice(2));
