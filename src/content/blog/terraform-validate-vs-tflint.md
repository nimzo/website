---
title: "Terraform validate vs TFLint vs policy checks"
slug: "terraform-validate-vs-tflint"
description: "TFLint, terraform validate and policy checks catch different problems. See what each one finds and where to run it: locally, in pre-commit, or in CI."
date: 2026-11-18
author: "Nimzo team"
tags: ["Terraform", "Policy as code"]
primary_keyword: "tflint"
draft: false
---

`terraform validate` checks that your configuration is valid Terraform, TFLint catches likely mistakes and convention problems that validate cannot see, and policy checks decide whether a change is allowed at all. They are not alternatives: run fmt and validate locally, add TFLint before commit, and run policy checks against the plan in CI.

## What each tool checks

|  | terraform fmt | terraform validate | TFLint | Policy checks |
| --- | --- | --- | --- | --- |
| Question it answers | Is it formatted? | Is it valid Terraform? | Is it likely correct and consistent? | Is this change allowed? |
| Typical input | `.tf` files | `.tf` files plus installed providers and modules | `.tf` files plus plugins | The JSON plan |
| Example catch | Misaligned arguments | Unknown attribute, wrong value type | Invalid instance type, unused variable | A bucket deleted in production |

## terraform fmt: layout only

`terraform fmt` rewrites files to Terraform's canonical style. It is opinionated on purpose and has no customization options, according to the [fmt docs](https://developer.hashicorp.com/terraform/cli/commands/fmt). In CI, use check mode so it fails instead of rewriting:

```shell
terraform fmt -check -recursive
```

The exit status is non-zero if any file needs formatting. People sometimes search for "terraform lint" and mean fmt, but fmt only changes layout. It never tells you a value is wrong.

## terraform validate: is it valid Terraform?

The [validate docs](https://developer.hashicorp.com/terraform/cli/commands/validate) describe it as a check that a configuration is syntactically valid and internally consistent, including attribute names and value types. It needs an initialized directory, but not a backend:

```shell
terraform init -backend=false
terraform validate
```

It does not call provider APIs or touch remote state. That makes it safe to run anywhere, and it also defines its limit. This passes validation:

```hcl
resource "aws_instance" "web" {
  ami           = var.ami_id
  instance_type = "t2.superlarge"
}
```

`instance_type` is a string, so validate is satisfied. The instance type does not exist, and you would only find out at apply time. Add `-json` when an editor or script needs to parse the results.

## TFLint: what validate cannot see

[TFLint](https://github.com/terraform-linters/tflint) is a pluggable linter. Its README lists three jobs: find possible errors such as invalid instance types for AWS, Azure and Google Cloud, warn about deprecated syntax and unused declarations, and enforce best practices and naming conventions. This is usually what people mean by "terraform lint".

The Terraform language ruleset is bundled and turns on its recommended preset by default. You can declare it explicitly in `.tflint.hcl`:

```hcl
plugin "terraform" {
  enabled = true
  preset  = "recommended"
}
```

For provider checks like the instance type above, add the AWS, Azure or Google Cloud ruleset plugin to the same file, then install plugins and run:

```shell
tflint --init
tflint --recursive
```

Flags that help in pipelines:

- `--format` supports `json`, `checkstyle`, `junit`, `compact` and `sarif`, so results can show up as annotations in your CI tool.
- `--minimum-failure-severity` sets which level (error, warning or notice) fails the build.
- `--fix` repairs issues that have an automatic fix.
- `# tflint-ignore` comments skip a rule on a specific line when you have a reason.

You can also write custom rules as a plugin or in Rego through TFLint's OPA ruleset. Either way, TFLint reads your code, not the plan.

## Policy checks: is this change allowed?

Validate and TFLint judge the code. Policy checks judge the result: what this change will create, modify or delete in a given environment. That is why they usually run on the JSON plan. If you are new to plan JSON, see [how to review a Terraform plan](/blog/how-to-review-terraform-plan).

[Conftest](https://www.conftest.dev/) runs Rego policies from a `policy` directory and looks for `deny`, `violation` and `warn` rules. A rule that blocks deleting S3 buckets:

```rego
package main

deny contains msg if {
  rc := input.resource_changes[_]
  rc.type == "aws_s3_bucket"
  "delete" in rc.change.actions
  msg := sprintf("%s would be deleted", [rc.address])
}
```

```shell
terraform plan -out=tfplan
terraform show -json tfplan > plan.json
conftest test plan.json
```

Test the policies themselves with `conftest verify`. A useful habit is to introduce new rules as `warn`, watch what they flag on real pull requests, then promote them to `deny`.

If you run on HCP Terraform, policy sets run inside the platform after the plan phase. HashiCorp's [policy framework comparison](https://developer.hashicorp.com/terraform/policy/compare) lists Sentinel enforcement levels as advisory, soft-mandatory and hard-mandatory, while OPA policies in HCP Terraform are pass or fail only.

The runtime is rarely the hard part. Writing Rego for every convention, and keeping it current as modules change, is where teams stall. [Nimzo](/) approaches this by drafting policies from plain English and your existing repos, with pass and fail examples, and running them as deterministic checks on every change, including changes written by AI coding agents.

## Where each check runs

| Stage | What to run | Why there |
| --- | --- | --- |
| Editor, on save | `terraform fmt`, `terraform validate` | Instant feedback, no credentials needed |
| Pre-commit | `terraform_fmt`, `terraform_validate`, `terraform_tflint` hooks | Stops noise before anyone reviews |
| CI, on pull request | All of the above, then plan and `conftest test` | Same checks for everyone, with real plan data |
| HCP Terraform run | Sentinel or OPA policy sets | Enforced between plan and apply |

The hook names come from [pre-commit-terraform](https://github.com/antonbabenko/pre-commit-terraform), which wraps these tools for the pre-commit framework. A minimal CI job looks like this:

```shell
terraform fmt -check -recursive
terraform init -input=false
terraform validate
tflint --init && tflint --recursive
terraform plan -input=false -out=tfplan
terraform show -json tfplan > plan.json
conftest test plan.json
```

Order matters. The cheap checks run first, so a formatting error fails in seconds instead of after a slow plan. For more on structuring the policy layer, see [what is policy as code](/blog/what-is-policy-as-code).

## FAQ

### Does TFLint replace terraform validate?

No. Run both. Validate checks your code against the Terraform language and provider schemas. TFLint adds rules on top, such as provider-specific value checks and naming conventions.

### Can TFLint enforce company policies?

Partly. Custom plugins or Rego rules can enforce code conventions. Rules that depend on what a change will do, such as "never delete a production database", need the plan, which is where Conftest or Sentinel fit.
