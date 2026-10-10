// The /explore/ page's island: Ask the archive (swr-ei6) above, SQL over the archive (swr-7f1.7)
// below, under "Write SQL yourself". Server-rendered as the no-JavaScript fallback (links to
// each section), then enhanced on `Hydrated`. A question goes to the ask driver, whose steps
// show as they happen; the answer is a sentence, the rows (names link to their pages) and the
// query, which can be opened in the SQL editor. Follow-ups refine the last answer. `?ask=`
// asks a question on arrival (the search page links here with one).
import { command, define, defineDriver, focus, html, nothing, type Command } from '@gyral/core';
import type { Turn } from '../domain/ask.js';
import { sectionPath } from '../domain/archive.js';
import { SECTIONS } from '../domain/sections.js';
import { ASK_TEXT, EXPLORE_TEXT, SECTION_LABELS } from '../labels.js';
import type { Answer, AskEvent, AskFailure } from '../domain/ask-pipeline.js';
import type { QueryResult } from '../domain/query.js';
import { askQuestion, runQuery } from './api.js';
import { mergeEras, statusText, styles, table, type Result } from './explore-view.js';

export type { Result } from './explore-view.js';

export type Msg =
  | { readonly _tag: 'Typed'; readonly sql: string }
  | { readonly _tag: 'Run' }
  | { readonly _tag: 'Preset'; readonly index: number }
  | { readonly _tag: 'Done'; readonly sql: string; readonly result: QueryResult }
  | { readonly _tag: 'Failed'; readonly sql: string; readonly reason: string }
  | { readonly _tag: 'AskTyped'; readonly text: string }
  | { readonly _tag: 'Ask' }
  | { readonly _tag: 'AskRetry' }
  | { readonly _tag: 'Example'; readonly index: number }
  | { readonly _tag: 'ExamplesToggled'; readonly open: boolean }
  | { readonly _tag: 'Arrived'; readonly question: string }
  | { readonly _tag: 'Asked'; readonly event: AskEvent }
  | { readonly _tag: 'AskFailed'; readonly reason: AskFailure }
  | { readonly _tag: 'StartOver' }
  | { readonly _tag: 'EditSql' };

/** Where a question is: its steps so far, then an answer or the reason there isn't one. */
export type AskState =
  | { readonly _tag: 'Idle' }
  | {
      readonly _tag: 'Asking';
      readonly question: string;
      readonly phase: 'reading' | 'searchingArchive' | 'writing';
      readonly steps: readonly string[];
      readonly summary: string;
    }
  | { readonly _tag: 'Answered'; readonly steps: readonly string[]; readonly answer: Answer }
  | {
      readonly _tag: 'Failed';
      readonly question: string;
      readonly steps: readonly string[];
      readonly reason: AskFailure;
    };

export type State =
  | { readonly _tag: 'Static' }
  | {
      readonly _tag: 'Live';
      readonly sql: string;
      readonly result: Result;
      /** False until a query has run: the first one also starts the engine. */
      readonly started: boolean;
      /** What's in the question box. */
      readonly question: string;
      readonly ask: AskState;
      /** Earlier questions and their queries, for follow-ups. */
      readonly history: readonly Turn[];
      /** Whether "Write SQL yourself" is open. */
      readonly advanced: boolean;
      readonly examplesOpen: boolean;
    };

type Live = Extract<State, { _tag: 'Live' }>;

const FIRST_SQL = EXPLORE_TEXT.presets[0].sql;
/** Follow-ups see this many earlier questions. */
const HISTORY = 4;

const run = (s: Live): [State, Command<Msg>[]] => {
  const sql = s.sql;
  return [
    { ...s, result: { _tag: 'Running', first: !s.started }, started: true },
    [
      runQuery(
        sql,
        (result): Msg => ({ _tag: 'Done', sql, result }),
        (reason): Msg => ({ _tag: 'Failed', sql, reason }),
      ),
    ],
  ];
};

const ask = (s: Live, question: string): [State, Command<Msg>[]] | State => {
  const q = question.trim();
  if (q === '' || s.ask._tag === 'Asking') return s;
  return [
    {
      ...s,
      question: q,
      examplesOpen: false,
      ask: {
        _tag: 'Asking',
        question: q,
        phase: 'reading',
        steps: [ASK_TEXT.reading],
        summary: '',
      },
    },
    [
      askQuestion(
        { question: q, history: s.history },
        (event): Msg => ({ _tag: 'Asked', event }),
        (reason): Msg => ({ _tag: 'AskFailed', reason }),
      ),
    ],
  ];
};

/** The status line for one step of a question. */
function stepText(event: AskEvent): string | undefined {
  switch (event._tag) {
    case 'Reading':
      return ASK_TEXT.reading;
    case 'Matched':
      return ASK_TEXT.matched(
        event.resolved.map((r) =>
          r.titles[0] === undefined
            ? ASK_TEXT.noMatch(r.asked)
            : ASK_TEXT.match(r.asked, r.titles[0].title),
        ),
      );
    case 'Searching':
      return ASK_TEXT.searching(event.looksFor);
    case 'Found':
      return ASK_TEXT.found(event.count, event.truncated);
    case 'Writing':
    case 'Answered':
      return undefined;
  }
}

function onAsked(s: Live, event: AskEvent): State {
  const current = s.ask;
  if (current._tag !== 'Asking') return s;
  if (event._tag === 'Answered') {
    const turn = {
      question: event.answer.question,
      sql: event.answer.sql,
      looksFor: event.answer.looksFor,
    };
    return {
      ...s,
      question: '',
      ask: { _tag: 'Answered', steps: current.steps, answer: event.answer },
      history: [...s.history, turn].slice(-HISTORY),
    };
  }
  if (event._tag === 'Writing') {
    // The first chunk may be empty: add the step once, whatever the text.
    const steps = current.steps.includes(ASK_TEXT.writing)
      ? current.steps
      : [...current.steps, ASK_TEXT.writing];
    return { ...s, ask: { ...current, phase: 'writing', steps, summary: event.text } };
  }
  const text = stepText(event);
  const phase =
    event._tag === 'Searching' || event._tag === 'Found' ? 'searchingArchive' : current.phase;
  return text === undefined
    ? s
    : {
        ...s,
        ask: {
          ...current,
          phase,
          steps: current.steps.at(-1) === text ? current.steps : [...current.steps, text],
        },
      };
}

const askLocation = defineDriver<undefined, string>({
  name: 'ask-location',
  run: () => new URLSearchParams(window.location.search).get('ask') ?? '',
});

/** Reads `?ask=` once: a question to ask on arrival. */
const readAsk = (): Command<Msg> =>
  command(askLocation, undefined, {
    onSuccess: (question): Msg | undefined =>
      question.trim() === '' ? undefined : { _tag: 'Arrived', question },
  });

export const Explore = define<State, Msg>()('swr-explore', {
  init: () => ({ _tag: 'Static' }),
  intent: {
    Typed: ({ value }) => ({ _tag: 'Typed', sql: value ?? '' }),
    Run: ({ event, key }) => {
      if (event.type === 'keydown') {
        if (
          key !== 'Enter' ||
          !((event as KeyboardEvent).ctrlKey || (event as KeyboardEvent).metaKey)
        ) {
          return undefined;
        }
        event.preventDefault();
      }
      return { _tag: 'Run' };
    },
    Preset: ({ value }) => ({ _tag: 'Preset', index: Number(value) }),
    AskTyped: ({ value }) => ({ _tag: 'AskTyped', text: value ?? '' }),
    Ask: true,
    AskRetry: true,
    Example: ({ value }) => ({ _tag: 'Example', index: Number(value) }),
    ExamplesToggled: ({ newState }) =>
      newState === 'open' || newState === 'closed'
        ? { _tag: 'ExamplesToggled', open: newState === 'open' }
        : undefined,
    StartOver: true,
    EditSql: true,
  },
  update: {
    Hydrated: () => [
      {
        _tag: 'Live',
        sql: FIRST_SQL,
        result: { _tag: 'Idle' },
        started: false,
        question: '',
        ask: { _tag: 'Idle' },
        history: [],
        advanced: false,
        examplesOpen: true,
      },
      [readAsk()],
    ],
    Typed: (s, m) => (s._tag === 'Live' ? { ...s, sql: m.sql } : s),
    Run: (s) => (s._tag === 'Live' && s.sql.trim() !== '' ? run(s) : s),
    Preset: (s, m) => {
      const preset = EXPLORE_TEXT.presets[m.index];
      return s._tag === 'Live' && preset !== undefined ? run({ ...s, sql: preset.sql }) : s;
    },
    // A late answer to SQL that has since changed is ignored.
    Done: (s, m) =>
      s._tag === 'Live' && s.sql === m.sql
        ? { ...s, result: { _tag: 'Done', result: m.result } }
        : s,
    Failed: (s, m) =>
      s._tag === 'Live' && s.sql === m.sql
        ? { ...s, result: { _tag: 'Failed', reason: m.reason } }
        : s,
    AskTyped: (s, m) => (s._tag === 'Live' ? { ...s, question: m.text } : s),
    Ask: (s) => (s._tag === 'Live' ? ask(s, s.question) : s),
    AskRetry: (s) => (s._tag === 'Live' && s.ask._tag === 'Failed' ? ask(s, s.ask.question) : s),
    Example: (s, m) => {
      const example = ASK_TEXT.examples[m.index];
      if (s._tag !== 'Live' || s.ask._tag === 'Asking' || example === undefined) return s;
      const next = ask({ ...s, history: [] }, example);
      // The examples close after submission; move off their now-hidden button only once.
      return Array.isArray(next)
        ? [next[0], [...next[1], focus('#question', { preventScroll: true })]]
        : next;
    },
    ExamplesToggled: (s, m) =>
      s._tag === 'Live' && s.examplesOpen !== m.open ? { ...s, examplesOpen: m.open } : s,
    Arrived: (s, m) => (s._tag === 'Live' ? ask(s, m.question) : s),
    Asked: (s, m) => (s._tag === 'Live' ? onAsked(s, m.event) : s),
    AskFailed: (s, m) =>
      s._tag === 'Live' && s.ask._tag === 'Asking'
        ? {
            ...s,
            ask: { _tag: 'Failed', question: s.ask.question, steps: s.ask.steps, reason: m.reason },
          }
        : s,
    StartOver: (s) =>
      s._tag === 'Live' && s.ask._tag !== 'Asking'
        ? [
            { ...s, question: '', ask: { _tag: 'Idle' }, history: [], examplesOpen: true },
            [focus('#question')],
          ]
        : s,
    EditSql: (s) =>
      s._tag === 'Live' && s.ask._tag === 'Answered'
        ? [{ ...s, sql: s.ask.answer.sql, advanced: true }, [focus('#sql')]]
        : s,
  },
  view: (s, i) =>
    s._tag === 'Static'
      ? html`<p>${EXPLORE_TEXT.noScript}</p>
          <ul>
            ${SECTIONS.map((k) => html`<li><a href=${sectionPath(k)}>${SECTION_LABELS[k].plural}</a></li>`)}
          </ul>`
      : html`
          <section class="ask" aria-labelledby="ask-heading">
            <h2 id="ask-heading">${ASK_TEXT.heading}</h2>
            <form data-intent=${i.Ask} aria-busy=${s.ask._tag === 'Asking'}>
              <label for="question">
                ${s.history.length > 0 ? ASK_TEXT.followUpLabel : ASK_TEXT.label}
              </label>
              <div>
                <input
                  id="question"
                  name="question"
                  type="text"
                  autocomplete="off"
                  aria-describedby="ask-note"
                  value=${s.question}
                  data-intent=${i.AskTyped}
                />
                <button type="submit" aria-disabled=${s.ask._tag === 'Asking'}>
                  <span
                    class="spinner"
                    aria-hidden="true"
                    ?hidden=${s.ask._tag !== 'Asking'}
                  ></span>
                  ${s.ask._tag === 'Asking' ? ASK_TEXT.busy : ASK_TEXT.ask}
                </button>
              </div>
            </form>
            <div class="answer">
              <p id="ask-status" role="status" aria-live="polite" aria-atomic="true">
                ${askStatus(s.ask)}
              </p>
              ${answerView(s.ask, i.EditSql, i.AskRetry)}
            </div>
            ${
              s.history.length > 0
                ? html`<p>
                    <button
                      type="button"
                      data-intent=${i.StartOver}
                      aria-disabled=${s.ask._tag === 'Asking'}
                    >
                      ${ASK_TEXT.newQuestion}
                    </button>
                  </p>`
                : nothing
            }
            <details
              class="examples"
              ?open=${s.examplesOpen}
              data-intent=${i.ExamplesToggled}
              data-intent-on="toggle"
            >
              <summary>
                ${s.ask._tag === 'Idle' ? ASK_TEXT.examplesLabel : ASK_TEXT.moreExamples}
              </summary>
              <ul>
                ${ASK_TEXT.examples.map(
                  (q, n) =>
                    html`<li>
                      <button
                        type="button"
                        value=${String(n)}
                        data-intent=${i.Example}
                        aria-disabled=${s.ask._tag === 'Asking'}
                      >
                        ${q}
                      </button>
                    </li>`,
                )}
              </ul>
            </details>
            <p id="ask-note">${ASK_TEXT.note}</p>
          </section>
          <details class="advanced" ?open=${s.advanced}>
            <summary>${ASK_TEXT.advanced}</summary>
            <section aria-labelledby="questions">
              <h2 id="questions">${EXPLORE_TEXT.questions}</h2>
              <ul>
                ${EXPLORE_TEXT.presets.map(
                  (p, n) =>
                    html`<li>
                      <button type="button" value=${String(n)} data-intent=${i.Preset}>
                        ${p.label}
                      </button>
                    </li>`,
                )}
              </ul>
            </section>
            <form data-intent=${i.Run}>
              <label for="sql">${EXPLORE_TEXT.sqlLabel}</label>
              <div data-intent=${i.Run} data-intent-on="keydown">
                <textarea
                  id="sql"
                  rows="8"
                  spellcheck="false"
                  aria-describedby="hint status"
                  data-intent=${i.Typed}
                >
${s.sql}</textarea>
              </div>
              <p id="hint">${EXPLORE_TEXT.runHint}</p>
              <button type="submit">${EXPLORE_TEXT.run}</button>
            </form>
            <p id="status" role="status">${statusText(s.result)}</p>
            ${s.result._tag === 'Done' ? table(s.result.result) : nothing}
          </details>
        `,
  styles,
});

/** Announce one phase at a time; streaming prose and the step history stay outside the live region. */
function askStatus(a: AskState) {
  switch (a._tag) {
    case 'Idle':
      return ASK_TEXT.answerHint;
    case 'Asking':
      return ASK_TEXT[a.phase];
    case 'Failed':
      return ASK_TEXT[a.reason];
    case 'Answered':
      return ASK_TEXT.results(mergeEras(a.answer.result).rows.length, a.answer.result.truncated);
  }
}

/** The answer: the sentence (as it's written), the rows, and how it was found. */
function answerView(a: AskState, editSql: string, retry: string) {
  if (a._tag === 'Idle') return nothing;
  if (a._tag === 'Asking') {
    return html`${a.summary === '' ? nothing : html`<p class="summary">${a.summary}</p>`}
    ${answerSteps(a)}`;
  }
  if (a._tag === 'Failed') {
    return html`<h3>${ASK_TEXT.failedHeading}</h3>
      <p>${ASK_TEXT.asked(a.question)}</p>
      <p><button type="button" data-intent=${retry}>${ASK_TEXT.retry}</button></p>
      ${answerSteps(a)}`;
  }
  const { answer } = a;
  return html`<h3>${ASK_TEXT.answerHeading}</h3>
    <p>${ASK_TEXT.asked(answer.question)}</p>
    ${answer.summary === '' ? nothing : html`<p class="summary">${answer.summary}</p>`}
    ${answer.result.rows.length > 0 ? table(answer.result, true) : nothing}
    ${answerSteps(a, editSql)}`;
}

function answerSteps(a: Exclude<AskState, { _tag: 'Idle' }>, editSql?: string) {
  return html`<details class="answer-steps">
    <summary>${ASK_TEXT.howAnswered}</summary>
    <ol class="steps">
      ${a.steps.map((step) => html`<li>${step}</li>`)}
    </ol>
    ${
      a._tag === 'Answered'
        ? html`<pre><code>${a.answer.sql}</code></pre>
            <button type="button" data-intent=${editSql}>${ASK_TEXT.editSql}</button>`
        : nothing
    }
  </details>`;
}
