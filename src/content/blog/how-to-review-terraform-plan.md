---
title: "How to review a Terraform plan before you apply"
slug: "how-to-review-terraform-plan"
description: "How to review a Terraform plan: save it with -out, read the +, -, ~ and -/+ symbols, catch replacements and destroys, and check terraform show -json."
date: 2026-11-18
author: "Nimzo team"
tags: ["Terraform"]
primary_keyword: "terraform plan"
draft: false
---

To review a Terraform plan, save it with `terraform plan -out=tfplan`, read every resource marked for destroy or replacement, then apply that exact file so nothing changes between review and apply. The rest is knowing where problems hide in the plan output and which checks to automate with `terraform show -json`.

## Save the plan you review

A plan run without `-out` is speculative. HashiCorp's [terraform plan docs](https://developer.hashicorp.com/terraform/cli/commands/plan) point out that other changes to the target system can make the final result differ from what an earlier speculative plan showed. A saved plan file removes that gap:

```shell
terraform plan -out=tfplan
terraform show tfplan     # human-readable view of the saved plan
terraform apply tfplan    # applies exactly what you reviewed
```

When you pass a saved plan to `terraform apply`, Terraform runs it without asking for confirmation, because passing the file counts as approval ([apply docs](https://developer.hashicorp.com/terraform/cli/commands/apply)). That includes destroys. The review has to happen before that command, not during it.

In CI, add `-detailed-exitcode`. It returns 0 when there are no changes, 1 on error and 2 when changes are present, so a pipeline can skip review for empty plans.

## Read the terraform plan output

Every plan starts with a legend of action symbols. These are the ones to know:

| Symbol | Meaning | How closely to look |
| --- | --- | --- |
| `+` | Create | Check names, sizes and tags |
| `~` | Update in place | Read each changed attribute |
| `-` | Destroy | Confirm it is intended |
| `-/+` | Destroy, then create a replacement | The old object goes away, with anything stored in it |

Start at the bottom. The summary line, such as `Plan: 2 to add, 1 to change, 1 to destroy.`, tells you if the change is the size you expected. A replacement counts in both "add" and "destroy", so a one-line tag change that reports `1 to destroy` deserves attention before anything else.

### Spot replacements

A replacement prints with `-/+`, a comment saying the resource must be replaced, and a `# forces replacement` marker on the attribute that caused it:

```text
  # aws_instance.web must be replaced
-/+ resource "aws_instance" "web" {
      ~ ami = "ami-02c98622c4c3f017d" -> "ami-0d7d6fe23ca71032d" # forces replacement
```

Ask one question: did you mean to change that attribute? If not, revert it. If you did, and the resource holds data (a database, a disk, a bucket), plan for the data first. For resources that must stay available, `lifecycle { create_before_destroy = true }` makes Terraform create the new object before it deletes the old one.

### Spot destroys

Plain `-` destroys often come from edits that look harmless in the code diff:

- A resource block deleted, or renamed without a `moved` block.
- A changed `count` value or `for_each` key, which removes the old instance address.
- A module call removed or renamed.

If the plan destroys something nobody mentioned in the pull request, stop and find out why.

### Read in-place updates closely

`~` lines show `old -> new` for each attribute. Most are safe, but IAM policies, security group rules and network settings can widen access with a one-line diff. Values shown as `(known after apply)` cannot be checked at plan time, so note which ones matter.

## Review the plan as JSON with terraform show -json

For anything beyond a few resources, read the plan as data:

```shell
terraform show -json tfplan > plan.json
```

Each entry in `resource_changes` has a `change.actions` array. Valid values are `["no-op"]`, `["create"]`, `["read"]`, `["update"]`, `["delete", "create"]`, `["create", "delete"]` and `["delete"]`. The [JSON output format docs](https://developer.hashicorp.com/terraform/internals/json-format) explain that replacements are encoded this way so you can scan for `"delete"` and catch every case where an object will be removed. `["create", "delete"]` is a replacement that uses `create_before_destroy`.

This lists every delete and replacement, with Terraform's reason when it gives one:

```shell
jq -r '.resource_changes[]
  | select(.change.actions | index("delete"))
  | "\(.change.actions | join(",")) \(.address) \(.action_reason // "")"' plan.json
```

```text
delete,create aws_instance.web replace_because_cannot_update
delete aws_s3_bucket.logs delete_because_no_resource_config
```

Two more fields are worth knowing. `change.replace_paths` names the attributes that forced a replacement. `resource_drift` lists changes made outside Terraform since the last run, which your apply would overwrite.

One warning: [terraform show](https://developer.hashicorp.com/terraform/cli/commands/show) with `-json` prints sensitive values in plain text. Treat `plan.json` and the binary plan file as secrets and keep them out of public CI logs.

## A short review checklist

1. The summary line matches the size of the change you intended.
2. Every `-` and `-/+` is explained in the pull request.
3. No `# forces replacement` on a stateful resource unless it was planned.
4. IAM, security group and network changes do not widen access.
5. Any drift in `resource_drift` is understood before you overwrite it.
6. The file you apply is the saved plan that was reviewed.

## Turn the checklist into checks

A checklist depends on the reviewer reading every line, and long plans get skimmed. Plans also arrive faster when AI coding agents write the Terraform. The JSON plan is the natural input for automated review: Conftest can run Rego policies against `plan.json`, and HCP Terraform can evaluate Sentinel or OPA policies after the plan stage. Our guide to [Open Policy Agent with Terraform](/blog/open-policy-agent-terraform) shows how to write those rules. Code-level checks like `terraform validate` and TFLint belong earlier in the pipeline, covered in [terraform validate vs TFLint vs policy checks](/blog/terraform-validate-vs-tflint).

[Nimzo](/) is built around this step: rules you write in plain English, or ones it finds in your repos, become deterministic checks that every change passes, and each verdict traces back to a readable rule a reviewer can replay. The checklist above is a good first set of rules to encode, whatever tool runs them.

## FAQ

### Does terraform plan change any infrastructure?

No. The plan command reads the current state of remote objects and proposes changes, but it does not carry them out. Only `terraform apply` makes changes.

### What does "known after apply" mean in a plan?

It marks a value Terraform cannot know until the resource is created or updated, such as a generated ID. You cannot review or policy-check that value at plan time, only after apply.
