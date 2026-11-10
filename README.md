# Klaviyo agent skills

Skills that help coding agents build on Klaviyo's API and MCP server. Each directory under
`skills/` is one skill in the [Agent Skills](https://agentskills.io/specification) format.

| Skill | What it does |
|---|---|
| `klaviyo-new-oauth` | Sets up a new OAuth app and its authorization flow |
| `klaviyo-migrate-oauth` | Moves an existing integration from API keys to OAuth |

## Experimental skills

[`experimental/`](experimental) holds skills that are still being proven out. They are best-effort and
not officially supported, and are not part of the default set: installing from Klaviyo's developer
site skips them. Install one by name, for example `npx skills add klaviyo-labs/skills --skill <name>`.

## About this repository

This repository is a read-only mirror, published automatically from an internal repository. Changes
made here are overwritten. To report a problem or suggest a change, open an issue.
