// Import the Config type from continue's types
import type { Config } from "@continuedev/config-types";

export function modifyConfig(config: Config): Config {
  config.slashCommands = config.slashCommands || [];

  config.slashCommands.push({
    name: "commitmsg",
    description: "Generate a commit message in the human-AI session format",
    run: async function* (sdk) {
      const diff = await sdk.ide.getDiff(true);

      if (!diff || diff.trim().length === 0) {
        yield "No staged changes to commit.";
        return;
      }

      const prompt = `
You are helping write git commit messages for this repository.

Each commit to this repository is a record of a human-AI work session.
Write commit messages so they are legible as a process document when read in sequence through git log.

Use ONLY this structure:

[short subject line describing what was produced or changed]

Directed by: [what the human asked for, decided, or specified]
Produced by: AI
Human decisions: [any notable choices, overrides, or departures from what AI proposed]

Rules:
- The subject line must describe the output of this commit in one short line.
- The body must describe the collaboration that produced it.
- In "Directed by:", summarize the user's request or instructions that led to the diff below.
- In "Produced by:", always write exactly: AI
- In "Human decisions:", list any meaningful human choices. If there were none, write exactly:
  Human decisions: Followed the initial plan without major changes.
- Output only the final commit message.
- Do not output explanations.
- Do not use conventional commits unless the diff clearly requires that style.

Here is the git diff for the staged changes:

${diff}
      `;

      const controller = new AbortController();

      for await (const token of sdk.llm.streamComplete(
        prompt,
        controller.signal,
        { maxTokens: 220, temperature: 0.1 }
      )) {
        yield token;
      }
    },
  });

  return config;
}