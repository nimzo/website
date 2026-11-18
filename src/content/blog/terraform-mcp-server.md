---
title: "Terraform MCP server: setup, tools and guardrails"
slug: "terraform-mcp-server"
description: "What the Terraform MCP server does, how to run it with Claude or Cursor, which tools it exposes, and the guardrails agent-written Terraform still needs."
date: 2026-11-18
author: "Nimzo team"
tags: ["AI agents", "Terraform"]
primary_keyword: "terraform mcp server"
draft: false
---

The Terraform MCP server is HashiCorp's official Model Context Protocol server for Terraform. It gives AI assistants such as Claude, Cursor and other MCP clients live access to Terraform Registry documentation, modules and policies, and, when you connect it, to your HCP Terraform or Terraform Enterprise workspaces. The result is agent-written Terraform based on current provider docs instead of whatever the model remembered from training.

This guide covers what the server does, how to run it, and the guardrails you still need when an agent writes infrastructure code.

## What MCP is, in one paragraph

The [Model Context Protocol](https://modelcontextprotocol.io) is an open standard for connecting AI applications to outside tools and data. An MCP server exposes a set of tools. An MCP client, such as an AI coding assistant, discovers those tools and calls them when a request needs them. You configure the server once and the assistant decides when to use it.

## What the Terraform MCP server does

According to the [HashiCorp docs](https://developer.hashicorp.com/terraform/mcp-server), a connected model can:

- Search and read current provider documentation.
- Look up modules, including their inputs, outputs and examples.
- Find Sentinel policies in the registry.
- List organizations, projects and workspaces in HCP Terraform or Terraform Enterprise.
- Manage workspaces, variables, tags and variable sets, and work with runs.

The tools are grouped into three toolsets, which you can switch on or off with the `--toolsets` flag:

| Toolset | What it covers | Needs a token |
| --- | --- | --- |
| `registry` | Public Terraform Registry | No |
| `registry-private` | Your private registry | Yes (`TFE_TOKEN`) |
| `terraform` | HCP Terraform and Terraform Enterprise workspaces and runs | Yes (`TFE_TOKEN`) |

Without the flag, the server enables every toolset, but it only registers the private registry and workspace tools when you provide a valid token. The [tool reference](https://developer.hashicorp.com/terraform/mcp-server/reference) lists each tool. A useful one for review is `get_plan_json_output`, which returns a run's plan as structured JSON.

## How to run it

HashiCorp supports [three deployment options](https://developer.hashicorp.com/terraform/mcp-server/deploy):

- **Local**, using Docker, a prebuilt binary or source. Best for getting started.
- **Self-hosted**, run in an environment you manage. Best for central control, and the only option besides local that supports Terraform Enterprise.
- **Remote**, hosted by HashiCorp for HCP Terraform. It needs an API token and is in beta at the time of writing.

For a local start, Docker is the recommended path. Add the server to your MCP client's configuration. For Claude Desktop that is `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "terraform": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "hashicorp/terraform-mcp-server"]
    }
  }
}
```

This gives the assistant the public registry tools only. To reach your private registry and workspaces, pass `TFE_TOKEN` (and `TFE_ADDRESS` for Terraform Enterprise) as environment variables, as shown in the [local deployment guide](https://developer.hashicorp.com/terraform/mcp-server/deploy/local). Cursor and other clients use the same Docker command in their own config files.

## What it does not do

It is easy to read "Terraform MCP server" as "the agent can now run Terraform safely". That is not what it promises.

- **It improves context, not judgment.** Current docs reduce invented arguments and outdated resource syntax. They do not tell the agent your naming rules, approved modules or network boundaries.
- **It does not check your plan against your standards.** The server can fetch Sentinel policies from the public registry, but deciding whether a change follows your organization's rules is still the job of your policy and review process.
- **It can change real things.** With a token, the `terraform` toolset can create runs and manage workspaces and variables. Destructive actions such as applying, discarding or cancelling a run through `action_run`, and the `auto_approve` run type, need `ENABLE_TF_OPERATIONS=true`. Leave that off unless you have a clear reason.

## Guardrails for agent-written Terraform

Treat an agent like a fast new teammate: helpful, confident, and unaware of the unwritten rules.

### Scope the server

- Start with `--toolsets=registry` for coding help. Add workspace access only when you need it.
- Use a token with the narrowest permissions that works, ideally scoped to non-production.
- Keep `ENABLE_TF_OPERATIONS` unset so applies stay a human decision.

### Keep the normal pipeline

Agent output goes through the same pull request as human output: `terraform fmt`, `terraform validate`, a linter, a plan, policy checks, then review. Our guide to [reviewing a Terraform plan](/blog/how-to-review-terraform-plan) has a checklist that works well for agent changes too.

### Give the agent your rules, not only the docs

The biggest gap is that registry docs describe what is possible, while your team cares about what is allowed: required tags, approved modules, regions, encryption, who can open which port. Policy as code closes that gap after the fact. Our explainer on [policy as code](/blog/what-is-policy-as-code) covers the basics.

A better loop gives the agent the same checks while it writes, so it fixes problems before a reviewer sees them. This is the approach [Nimzo](/) takes: your best practices become deterministic checks, and agents get them through MCP while they write the code, with the same verdicts your pipeline will apply later. Pairing a context server like HashiCorp's with a checks server like that covers both halves: correct syntax and correct standards.

## FAQ

### Is the Terraform MCP server free?

HashiCorp publishes the server on [GitHub](https://github.com/hashicorp/terraform-mcp-server), as the `hashicorp/terraform-mcp-server` Docker image and as prebuilt binaries, so running it locally costs nothing. Features that act on HCP Terraform or Terraform Enterprise depend on your account and token.

### Which AI tools work with it?

Any MCP client. HashiCorp's docs include setup steps for several, including Claude Desktop and Cursor.

### Can the agent apply changes through the MCP server?

Only if you allow it. Apply and auto-approve operations need `ENABLE_TF_OPERATIONS` set to `true`, plus a token with the right permissions.
