# Exercise the real surface

Read this when choosing verification tools or inspecting a rendered page.

| Surface | Check |
| --- | --- |
| Web | Use the requested browser or documented browser tool against local or preview state. Inspect console and network errors. |
| Native app | Build and exercise the simulator or device flow. Capture meaningful states. |
| CLI | Run the documented built command and inspect its actual exit status. |
| API | Call the local or preview endpoint, including authorization failures and malformed bodies. |
| Background job | Trigger the real queue or scheduler interface and inspect effects rather than a log message alone. |
| Plugin | Use a fresh host session and ordinary request. Record whether selection was automatic or explicit. |

Honor the user's browser choice. Otherwise prefer available agent-browser, then the host browser or supported automation tools.

Do not install browser tooling for a check. If unavailable, explain briefly and continue with the available browser.

Read the relevant browser tool instructions before acting.

Use documented preview access and test accounts. Never ask for passwords or preview access secrets in chat.

Use saved test state when repository guidance permits it. Ask before attaching to the user's personal profile or existing browser session.

If no documented preview access works, mark the check blocked.

Production checks require explicit authorization and remain read-only unless specific writes were permitted.

## Page checks

Check widths around 390, 768 and 1440 pixels, plus any requested target size.

Set real viewport dimensions where supported. Otherwise resize the browser or use a same-origin frame and report that method.

Inspect light and dark themes without changing durable preferences unless authorized.

If the alternate theme cannot be reached without a persistent change, report it unchecked.

Check horizontal overflow by comparing document scrollWidth with clientWidth.

Measure text and placeholder contrast against actual backgrounds: at least 4.5:1 for ordinary text and 3:1 for large text or meaningful graphics.

Normalize computed colors through a canvas when needed; do not assume every value uses RGB notation.

Inspect target dimensions, using 44 pixels as the usual touch target, and note excessive page length.

Compare reference and result screenshots at matching dimensions.

Emulated phone dimensions do not prove touch behavior. Check hover-only controls through touch-specific styles or a real simulator and state the evidence.

Use accessibility audits when available, alongside direct inspection.

Label mocked APIs, fixtures and test doubles simulated and name the live check still needed.
