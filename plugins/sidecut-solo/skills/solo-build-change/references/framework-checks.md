# Check UI and routing conventions

Read the matching section when this change touches that framework.

## shadcn/ui

- Read the project's `components.json`, aliases and theme. Inspect installed primitives and variants before adding a component. Compose with local components and semantic tokens. Check labels, focus and keyboard behavior.
- If a registry item is needed, use the project's supported CLI version to inspect the item and preview the diff before applying it. Review target files, CSS, dependencies and nested registry items. Prefer pinned refs for external items when the registry supports them.
- Verify the rendered component in the relevant states and widths.

[shadcn/ui skill](https://github.com/shadcn-ui/ui/blob/main/skills/shadcn/SKILL.md) · [Registry item reference](https://ui.shadcn.com/docs/registry/registry-item-json)

## Expo Router

- Read the project's Expo SDK and Router versions, actual route root and relevant `_layout.tsx` files. Check the resulting URL for index routes, dynamic parameters and route groups. Keep reusable components outside the route tree.
- When moving or adding a route, trace links and redirects that resolve to it. Verify affected navigation from a running app and from a cold deep link. Exercise back behavior and applicable authentication redirects on the affected targets.
- Check the version and platform before using native tabs, link previews or other platform-dependent features.

[Expo Router skill](https://github.com/expo/skills/blob/main/plugins/expo/skills/expo-router/SKILL.md) · [Expo Router notation](https://docs.expo.dev/router/basics/notation/)
