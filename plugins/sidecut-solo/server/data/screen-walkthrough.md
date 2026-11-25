# Screen walkthrough

Use this when testing a product in a browser, reviewing rendered design or doing both on the same build.

1. Record the build or head, URL or surface, environment, account and starting data. Use the documented local or preview setup and a fixture account. Reuse authorized test effects. Production checks require explicit authorization and remain read-only unless specific test writes were authorized. Design review uses read-only interactions.
2. Honor the user's browser choice and read that tool's instructions. Otherwise use a documented browser tool already available. If preview access or a needed tool is unavailable, report the affected check as blocked. Ask before attaching to a personal profile or session. Keep credentials out of captures and reports.
3. Set real viewports where supported. Start around 390, 768 and 1440 pixels for responsive pages when those ranges matter. Record the method if using a resized browser or frame. Inspect relevant themes without changing durable preferences unless authorized.
4. Capture the state that supports the claim. Include the action and result for a behavior check, and the width, theme and relevant surrounding layout for a design finding. Compare screen captures at matching dimensions. Use a simulator or actual touch input if the claim depends on a touch interaction.
5. When both jobs apply, share the setup, actions and captures. Put pass, fail, blocked and not-run behavior outcomes first, then design findings. Preserve any cold or independent review required by the design skill.

## Example

A team asks whether someone can reach Save on a phone and whether the page feels clear. At 390 pixels, the action is visible, works and the changed value survives a reload. Record the behavior pass. The destructive action has the same emphasis as Save, which is a design finding. If the button had been clipped and unreachable, record that as a behavior failure and link the corresponding layout finding to the same capture.
