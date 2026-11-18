---
title: "Terraform drift detection: how to find and fix drift"
slug: "terraform-drift-detection"
description: "Learn how Terraform drift detection works: find drift with plan -refresh-only, schedule checks in CI, and decide whether to revert or codify each change."
date: 2026-11-18
author: "Nimzo team"
tags: ["Drift", "Terraform"]
primary_keyword: "terraform drift detection"
draft: false
---

Terraform drift detection is the practice of finding differences between what your Terraform code and state say should exist and what actually runs in your cloud account. The quickest check is `terraform plan -refresh-only -detailed-exitcode`, which reports drift without changing anything and returns exit code 2 when it finds some.

This guide covers what causes drift, how to detect it locally and on a schedule, and how to decide whether to revert a change or keep it.

## What Terraform drift is

Terraform keeps a record of every resource it manages in its state file. Drift happens when the real resource changes outside that workflow, so state, code and reality no longer agree.

Common causes:

- Someone edits a resource in the cloud console during an incident.
- A script or another tool changes tags, security group rules or scaling settings.
- The cloud provider changes a default or adds a field.
- A resource is deleted by hand.

Drift matters because the next `terraform apply` will try to reconcile it. HashiCorp's [drift tutorial](https://developer.hashicorp.com/terraform/tutorials/state/resource-drift) warns that this can unintentionally destroy or recreate resources. A hotfix someone made in the console can quietly disappear on the next deploy.

## How to detect drift with the Terraform CLI

### Run a refresh-only plan

```shell
terraform plan -refresh-only
```

A refresh-only plan reads the real infrastructure and shows how your state would change to match it. It does not propose changes to the infrastructure itself. It is safer than the older `terraform refresh` command, which overwrites state without showing you the updates first. The flag has been available since Terraform 0.15.4.

The output lists each resource that changed outside Terraform, with the old and new values. For example, a security group that was swapped by hand shows up as an updated attribute on the instance.

### Make it machine-readable

For automation, add `-detailed-exitcode`. The [plan command docs](https://developer.hashicorp.com/terraform/cli/commands/plan) define the exit codes:

| Exit code | Meaning |
| --- | --- |
| 0 | Succeeded, no changes (no drift) |
| 1 | Error |
| 2 | Succeeded, changes present (drift found) |

```shell
terraform plan -refresh-only -detailed-exitcode -no-color -input=false > drift.txt
status=$?
if [ "$status" -eq 2 ]; then
  echo "Drift detected"
  cat drift.txt
fi
exit $status
```

### Also run a normal plan

A refresh-only plan answers "did the world change?". A normal `terraform plan` answers "does the world match my code?". Run both: drift can also show up as a planned change when someone merged code that was never applied.

## Schedule drift checks in CI

Drift is easy to find once and easy to forget. Run the check on a schedule for every workspace or root module. A minimal GitHub Actions job:

```yaml
name: drift-check
on:
  schedule:
    - cron: "0 6 * * *"   # daily at 06:00 UTC
  workflow_dispatch: {}

jobs:
  drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: hashicorp/setup-terraform@v3
      - run: terraform init -input=false
      - run: terraform plan -refresh-only -detailed-exitcode -input=false
```

A run that exits with code 2 fails the job, which gives you a notification. Use read-only cloud credentials for this job, since it never needs to apply.

## Drift detection in HCP Terraform

If you use HCP Terraform, its [health assessments](https://developer.hashicorp.com/terraform/cloud-docs/workspaces/health) run drift detection for you on a schedule. You enable them per workspace under Settings, then Health, or enforce them across the organization. The workspace overview then shows how many resources have drifted.

A few limits to know: health assessments are available on the Standard and Premium editions, the workspace needs remote or agent execution, and assessments pause when the latest run errored. A new run also cancels an in-progress assessment, so very busy workspaces may get assessed less often than you expect.

## Fixing drift: revert or codify

Every drifted resource needs a decision.

**Revert** when the change was a mistake or not allowed. Run a normal `terraform apply` and Terraform puts the resource back to what the code says. Check the plan first: some attributes force a replacement, not an in-place update.

**Codify** when the change was right, such as a hotfix that should stay. Update the code to match reality, then run `terraform apply -refresh-only` to accept the new values into state. The next normal plan should show no changes.

**Import** when someone created a new resource by hand that should be managed. Since Terraform 1.5 you can declare an `import` block and let `terraform plan` show what will be adopted:

```hcl
import {
  to = aws_security_group.web
  id = "sg-0123456789abcdef0"
}
```

**Ignore** only for attributes another system is meant to own, such as an autoscaler's desired count:

```hcl
lifecycle {
  ignore_changes = [desired_capacity]
}
```

Use `ignore_changes` sparingly. Every ignored attribute is drift you have decided never to see.

## Keep drift from coming back

Detection tells you drift happened. Prevention comes from making the code path the easy path:

- Limit console write access in production and use break-glass roles for incidents.
- Turn every incident change into a pull request the same day.
- Review drift reports in the same place you review code, so a fix lands as a normal change with a reviewer.

The last point is where most teams struggle: a drift alert lands in a channel, and turning it into a correct code change is manual work. [Nimzo](/) handles this by sending drift back to code through the same engine that checks every other change, so the fix is validated against your rules before anyone merges it. Whether you use a tool or a scheduled job, the goal is the same: every difference between code and cloud ends as a reviewed change in Git.

## FAQ

### What is the difference between terraform refresh and terraform plan -refresh-only?

`terraform refresh` updates state immediately with no review. `terraform plan -refresh-only` shows the same updates first, and `terraform apply -refresh-only` writes them after you approve. HashiCorp recommends the refresh-only flags.

### How often should I check for drift?

Daily is a common starting point for production. Check more often for resources that people change by hand during incidents, and always before a large apply.

### Does drift detection change my infrastructure?

No. A refresh-only plan only reads the real resources. Changes happen only when you run an apply.
