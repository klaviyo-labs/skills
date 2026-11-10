# Experimental skills

> [!WARNING]
> These skills are best-effort and not officially supported. They are newer, have had less review
> and testing than those in [`skills/`](../skills), and may change or be removed without notice.

Skills here are still being proven out. They are not part of Klaviyo's default skill set, and
installing from the developer site skips them. To try one, install it by name, for example:

```sh
npx skills add klaviyo-labs/skills --skill <name>
```

Review what an experimental skill does and what it writes to your account before relying on it.
To report a problem or suggest a change, open an issue on this repository and name the skill.

| Skill | What it does |
|---|---|
| `klaviyo-product-data-model` | Models a B2B product (accounts, seats and usage events) as Klaviyo custom objects, segments and draft flows, then creates it through the Klaviyo MCP |
| `klaviyo-product-friction-analytics` | Sends product friction events to Klaviyo and charts them in Grafana |
