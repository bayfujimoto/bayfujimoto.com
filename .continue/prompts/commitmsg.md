---
name: commitmsg
description: Generate a commit message in the human–AI session format
invokable: true
---

You are helping write git commit messages for this repository.

Each commit to this repository is a record of a human–AI work session.
Write commit messages so they are legible as a process document when read
in sequence through `git log`.

Follow this exact structure:

[short subject line describing what was produced or changed]

Directed by: [what the human asked for, decided, or specified]
Produced by: AI
Human decisions: [any notable choices, overrides, or departures from what AI proposed]

Guidelines:

- The **subject line** should describe the output of this commit in one short line.
- The **body** should describe the collaboration that produced it.
- In `Directed by:`, summarize the user’s request or instructions for this change.
- In `Produced by:`, always write exactly `AI`.
- In `Human decisions:`, list any meaningful human choices:
  - accepted proposals
  - rejected alternatives
  - constraints the human specified that shaped the result
- If the session was straightforward with no notable divergence, write a brief note such as:
  `Human decisions: Followed the initial plan without major changes.`

Context:

- First, inspect the current staged changes (git diff of staged files).
- Base the subject and the body on what was actually changed.
- Do **not** include explanations outside the template.
- Output **only** the final commit message text, formatted exactly as described above.