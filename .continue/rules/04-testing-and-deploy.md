# Testing and Deployment

## Git Workflow
- Do not commit and push to main unless explicitly asked. Always ask for approval before pushing.
- Prepare changes, verify they work locally, then wait for user confirmation before running git commit and push.
- This gives the user time to review and request changes before code goes to the remote repository.

## Commit Message Convention
Each commit to this repository is a record of a human-AI work session. Write commit messages to be legible as a process document when read in sequence through \`git log\`.

Every commit message should follow this structure:

\`\`\`
[short subject line describing what was produced or changed]

Directed by: [what the human asked for, decided, or specified]
Produced by: AI
Human decisions: [any notable choices, overrides, or departures from what AI proposed]
\`\`\`

The subject line should describe the output. The body should describe the collaboration that produced it. If the human made a meaningful decision — accepted a proposal, rejected an alternative, specified a constraint that shaped the result — it belongs in \`Human decisions\`. If the session was straightforward with no notable divergence, a brief note is sufficient.

The goal is that reading the full commit history should give a coherent account of how the archive was built: what was asked for, in what sequence, and where human judgment shaped the outcome.
