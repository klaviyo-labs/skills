> [!WARNING]
> **Preview skills.** Klaviyo doesn't commit to supporting what's in this directory. These skills get
> less review and testing than those in [`../skills/`](../skills/), and they can change or disappear
> without notice.

# Klaviyo Agent Skills (experimental)

Skills we are still trying out. Before relying on one, read what it does and what it will write to
your Klaviyo account.

## Installation

Klaviyo's developer site doesn't offer these skills, so installing from the site won't include them.
Name the one you want:

```sh
npx skills add klaviyo-labs/skills --skill <name>
```

The [root README](../README.md) covers the supported skills.

## Available Skills

- **klaviyo-product-data-model** — Model a B2B product (accounts, seats and usage events) as Klaviyo custom objects, segments and draft flows, then create it through the Klaviyo MCP.
- **klaviyo-product-friction-analytics** — Send product friction events to Klaviyo and chart them in Grafana.

## Feedback

To report a problem or suggest a change, open an issue on this repository and name the skill.
