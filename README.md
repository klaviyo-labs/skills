# Klaviyo Agent Skills

Skills that give a coding agent the context it needs to work with Klaviyo's API and MCP server. Each
directory under `skills/` is one skill in the [Agent Skills](https://agentskills.io/specification)
format.

## Installation

Install any skill by name:

```sh
npx skills add klaviyo-labs/skills --skill <name>
```

## Available Skills

Supported skills live in [`skills/`](./skills/):

- **klaviyo-new-oauth** — Set up a new OAuth app and its authorization flow.
- **klaviyo-migrate-oauth** — Move an existing integration from API keys to OAuth.

## Experimental Skills

[`experimental/`](./experimental/) holds skills we are still developing. Treat them as previews:

- We don't commit to supporting them, and they get less review and testing than the skills in
  [`skills/`](./skills/).
- Klaviyo's developer site leaves them out of its skill index, so installing from the site doesn't
  include them. Install one by name, as above.
- [`experimental/README.md`](./experimental/README.md) lists them and explains what to expect.

## About this repository

This repository is a read-only mirror, published automatically from an internal repository. Changes
made here are overwritten. To report a problem or suggest a change, open an issue.
