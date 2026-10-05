# ADR 0005 — Writing: one skill, a brief for each kind of text

Status: **accepted** (2026-10-05)

## Context

Agents write almost all of this repo's text: docs, beads, commits, comments and the words on
the site. Without a standard, each one drifts toward a generic voice, and the site copy ends
up sounding like the docs.

## Decision

Write every substantive piece with the **`sense-of-style-writing` skill**. The skill asks for
a brief (category, audience, desired outcome) before drafting. These are the briefs, so
nobody has to ask again:

| Text                                    | Category                                       | Audience                               | Desired outcome                                             |
| --------------------------------------- | ---------------------------------------------- | -------------------------------------- | ----------------------------------------------------------- |
| `AGENTS.md`, `ARCHITECTURE.md`, `docs/` | Technical reference                            | Coding agents first, the owner second  | An agent finds the right file and rule without asking       |
| `README.md`                             | Technical documentation; personal brand second | Developers who find the repo on GitHub | They understand what the site is and run it in five minutes |
| Bead descriptions                       | Work specification                             | A future agent with no context         | It can start the work and knows when it's done              |
| Commit messages, PR descriptions        | Change record                                  | Reviewers and readers of `git log`     | They learn why a change was made, not only what changed     |
| Code comments                           | Explanation                                    | Future agents                          | The comment gives a reason the code can't show              |
| Words on the site                       | Short-form public writing                      | Star Wars fans                         | They find what they came for quickly, and enjoy the voice   |

**The site's voice is playful and in-universe**: written as if from inside the galaxy, with
the saga's own words and jokes. **Clarity wins every conflict.** A label, a link or an error
message must say plainly what it does before it's clever. Facts about records come from the
data, not from the copy.

Plain-text rules that apply everywhere:

- Exact names stay exact: commands, file paths, bead IDs, field names.
- No `Co-Authored-By`, `Executed-By` or "Generated with" lines in commits or PRs.
- Don't claim something was tested unless it was.

## Consequences

- Short, routine text (a one-line commit, a small comment) needs a quick check against its
  row, not a full editing pass.
- When the voice and the clarity rule disagree in a real case, record the call in
  [docs/lessons-learned.md](../lessons-learned.md) so the next agent makes the same one.
