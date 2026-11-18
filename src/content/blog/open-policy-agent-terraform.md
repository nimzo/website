---
title: "Open Policy Agent (OPA) for Terraform: a practical guide"
slug: "open-policy-agent-terraform"
description: "Learn how to use Open Policy Agent with Terraform: export plan JSON, write Rego rules, run Conftest in CI, and unit test your policies before apply."
date: 2026-11-18
author: "Nimzo team"
tags: ["Policy as code", "Terraform"]
primary_keyword: "open policy agent"
draft: false
---

Open Policy Agent (OPA) is an open source policy engine that evaluates rules written in a language called Rego against any JSON input. For Terraform, that input is the JSON version of a plan, so OPA can approve or reject a change before `terraform apply` runs.

## What is Open Policy Agent?

OPA is a general-purpose policy engine and a [graduated CNCF project](https://www.openpolicyagent.org/docs). It separates the policy decision from the place where the decision is enforced. Your tool sends OPA structured data, OPA evaluates it against your rules, and it returns a result. That result can be a simple allow or deny, or any structured data such as a list of violations.

Because OPA only sees JSON, the same engine works for Kubernetes, APIs, CI pipelines and Terraform. For Terraform, the [OPA docs](https://www.openpolicyagent.org/docs/terraform) suggest using it for a first-pass review of changes, auto-approving routine ones, and enforcing organizational rules.

## The Rego language in 60 seconds

Rego is declarative. You describe what a violation looks like, and OPA finds every match in the input. A few rules cover most Terraform policies:

- `input` is the document you pass in, here the plan JSON.
- `some x in collection` iterates over arrays and objects.
- Lines inside a rule body are joined with AND. Several rules with the same name act as OR.
- `deny contains msg if { ... }` builds a set of messages, one per violation.

Since OPA 1.0, the `if` and `contains` keywords are [required in rule definitions](https://openpolicyagent.org/docs/v0-upgrade). Older examples written as `deny[msg] { ... }` fail to compile unless you run OPA with `--v0-compatible`, so update them before reuse.

## Step 1: export the Terraform plan as JSON

OPA cannot read the binary plan file, so convert it with [`terraform show -json`](https://developer.hashicorp.com/terraform/internals/json-format):

```shell
terraform init
terraform plan -out=tfplan.binary
terraform show -json tfplan.binary > tfplan.json
```

The field you will use most is `resource_changes`. Each entry has an `address`, a `type`, and a `change` object with `actions` (such as `create`, `update` or `delete`), `before` and `after`. A replacement shows up as both `delete` and `create` in the same `actions` array.

## Step 2: write a policy

Save this as `policy/terraform.rego`. It flags new S3 buckets without an `owner` tag and any change that deletes or replaces a database:

```rego
package main

deny contains msg if {
  some rc in input.resource_changes
  rc.type == "aws_s3_bucket"
  "create" in rc.change.actions
  not rc.change.after.tags.owner
  msg := sprintf("%s must have an owner tag", [rc.address])
}

deny contains msg if {
  some rc in input.resource_changes
  rc.type == "aws_db_instance"
  "delete" in rc.change.actions
  msg := sprintf("%s would be deleted or replaced", [rc.address])
}
```

Check that each value exists in the plan first. The OPA docs warn that computed attributes, dynamic blocks and some function results may be unknown until apply.

## Step 3: evaluate the plan with OPA

Use `opa exec` with the policy directory as a bundle and the rule path as the decision:

```shell
opa exec --decision main/deny --bundle policy/ tfplan.json
```

OPA prints a JSON result for the file. An empty `deny` set means the plan passed.

## Conftest: OPA for config files and CI

[Conftest](https://www.conftest.dev/) is a CLI built on Rego that is designed for testing configuration files. It loads policies from `./policy` by default, looks for `deny`, `violation` and `warn` rules in the `main` namespace, and exits with a failure when a `deny` rule matches. The policy above already follows that convention, so this works as is:

```shell
conftest test tfplan.json
```

Each match is printed as a line such as `FAIL - tfplan.json - aws_s3_bucket.logs must have an owner tag`. Conftest also parses HCL2 directly, so you can run it on `.tf` files when you only need static checks that do not depend on a plan.

| | OPA (`opa exec`, `opa eval`) | Conftest |
| --- | --- | --- |
| Best for | Custom decisions, services, bundles | CI checks on config files |
| Input formats | JSON | JSON, YAML, HCL2, Dockerfile and more |
| Output | Raw decision JSON | Pass, warn and fail lines, or JSON |
| Rule conventions | Any rule path | `deny`, `violation`, `warn` |

Rule of thumb: use Conftest for pull request checks and OPA when another system needs to query decisions.

## Step 4: test your policies

Policies are code, so they need tests. OPA runs any rule prefixed with `test_` through [`opa test`](https://www.openpolicyagent.org/docs/policy-testing). Save this as `policy/terraform_test.rego`:

```rego
package main

test_untagged_bucket_is_denied if {
  count(deny) == 1 with input as {"resource_changes": [{
    "address": "aws_s3_bucket.logs",
    "type": "aws_s3_bucket",
    "change": {"actions": ["create"], "after": {"tags": null}}
  }]}
}
```

Add a matching passing case with an `owner` tag, so each rule has one fail and one pass fixture.

Run `opa test policy/ -v` or `conftest verify --policy ./policy`. Add `--fail-on-empty` to `opa test` in CI so a typo in a test name cannot pass silently.

## OPA in HCP Terraform

HCP Terraform can run [OPA policy sets](https://developer.hashicorp.com/terraform/cloud-docs/policy-enforcement/define-policies/opa) on each run. When you reuse local policies, note that the plan sits under `input.plan` (run details under `input.run`), and that you set a query such as `data.terraform.deny` that must return an array. An empty array means the policy passed.

## Where hand-written Rego gets hard

The first five rules are easy. The trouble starts at fifty. Each rule needs fixtures, edge cases for unknown values, and updates whenever a module or provider changes its schema. And the people who know the conventions are rarely the people writing Rego.

That is why some teams now generate checks instead of writing each one. [Nimzo](/), for example, drafts deterministic checks from plain-English best practices and your existing repos, with pass and fail examples, so engineers review rules rather than hand-write them in Rego. Either way, run checks on the plan and test every rule.

For the bigger picture of where OPA fits, see [what is policy as code](/blog/what-is-policy-as-code). For what to check by hand before apply, read [how to review a Terraform plan](/blog/how-to-review-terraform-plan).

## FAQ

### What is Open Policy Agent used for?

OPA makes policy decisions for other software, such as Kubernetes admission, API authorization, CI/CD checks and Terraform plan reviews.

### Is Conftest the same as OPA?

No. Conftest is a separate CLI that uses OPA's Rego language to test configuration files. It adds file parsers, `deny`/`warn` conventions and CI-friendly output.

### Does Terraform run OPA policies natively?

The Terraform CLI does not. You export the plan as JSON and run OPA or Conftest against it, or you use HCP Terraform, which supports OPA policy sets.
