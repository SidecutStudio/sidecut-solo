# Exercise the real surface

Read this when choosing verification tools or inspecting a rendered page.

| Surface | Check |
| --- | --- |
| Web | Follow the shared setup in `server/data/screen-walkthrough.md`. Check reachability, interaction, console errors and relevant request results. |
| Native app | Build and exercise the simulator or device flow. Capture meaningful states. |
| CLI | Run the documented built command and inspect its actual exit status. |
| API | Call the local or preview endpoint, including authorization failures and malformed bodies. |
| Background job | Trigger the real queue or scheduler interface and inspect effects rather than a log message alone. |
| Plugin | Use a fresh host session and ordinary request. Record whether selection was automatic or explicit. |

## Define what proves the result

Start with the project's documented test entry points. Note the launch command, initial data, routes or CLI arguments and what a successful run leaves behind.

On a page, test affected controls at relevant widths and with the input methods the flow supports. Check that users can reach, activate and complete the flow without clipping, sideways scroll or broken focus. Use a simulator or actual touch input when emulation cannot prove an interaction.

Observe the action and the resulting state. A successful response or toast proves only part of a save. Reload, reopen or read the outcome through the product's supported interface to confirm persistence.

For exploratory dogfood, pick a role and goal. Try the obvious path, then a plausible variation. Report the steps each time the product blocks progress or makes the next action unclear.

For a web app, start the built app on loopback with disposable data, and replace paid or external services at their boundary with sample responses. Keep checks that depend on a provider or the hosting environment apart from that offline browser suite, and run them against an isolated deployment.

Label mocked responses, fixture data and simulated dependencies, and name any live check still needed.

[Browser testing with DevTools](https://github.com/addyosmani/agent-skills/blob/main/skills/browser-testing-with-devtools/SKILL.md) · [pstack project verification](https://github.com/backnotprop/pstack/blob/main/skills/create-verification-skill/SKILL.md) · [Compound Engineering dogfood](https://github.com/EveryInc/compound-engineering-plugin/blob/main/docs/guides/ce-dogfood.md)
