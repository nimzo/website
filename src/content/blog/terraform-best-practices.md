---
title: "Terraform best practices: modules, structure and tagging"
slug: "terraform-best-practices"
description: "Terraform best practices for module and folder structure, default_tags tagging, remote state with locking, version pinning and naming, with HCL examples."
date: 2026-11-18
author: "Nimzo team"
tags: ["Terraform"]
primary_keyword: "terraform best practices"
draft: false
---

Terraform best practices come down to a handful of habits: a predictable file and folder structure, reusable code in versioned modules, remote state with locking, pinned versions, and consistent tags and names. Most of them come straight from HashiCorp's own [Terraform style guide](https://developer.hashicorp.com/terraform/language/style), and each one is easy to check automatically.

This guide turns them into concrete layouts, HCL snippets and a pre-merge checklist.

## Terraform folder structure

Inside any Terraform directory, the style guide recommends a fixed set of file names so anyone can find things quickly:

- `terraform.tf` for the `terraform` block with `required_version` and `required_providers`
- `providers.tf` for provider configuration
- `backend.tf` for the backend
- `main.tf` for resources and data sources
- `variables.tf` and `outputs.tf`, each in alphabetical order
- `locals.tf` for local values used across files

When `main.tf` gets long, split it by logical group (`network.tf`, `storage.tf`, `compute.tf`) rather than by resource type.

For environments, HashiCorp suggests separate workspaces per environment if you use HCP Terraform. Without it, use one directory per environment, each with its own backend and state, calling shared local modules:

```text
.
├── modules
│   ├── network
│   ├── database
│   └── compute
├── dev
│   ├── backend.tf
│   ├── main.tf
│   └── variables.tf
├── staging
└── prod
```

Each environment directory passes its own inputs to the same modules, so dev and prod differ only in parameters, not in code. For larger estates, split further by component (networking, database, compute) so each state file stays small and a bad apply touches less.

Add a `.gitignore` that excludes `terraform.tfstate*`, the `.terraform/` directory, saved plan files and any `.tfvars` with secrets. Do commit `.terraform.lock.hcl`.

## Terraform module structure

HashiCorp's [standard module structure](https://developer.hashicorp.com/terraform/language/modules/develop/structure) looks like this:

```text
terraform-aws-network/
├── README.md
├── LICENSE
├── main.tf
├── variables.tf
├── outputs.tf
├── modules/
│   └── subnets/
└── examples/
    └── basic/
```

A few rules that keep modules useful:

- **Group resources that ship together.** A network module holds the VPC, subnets, gateways and security groups. Avoid thin wrappers around a single resource.
- **Name repositories `terraform-<PROVIDER>-<NAME>`.** The registry requires it, for example `terraform-aws-ec2-instance`.
- **Keep module code apart from live configuration.** One repository per module lets you version each one on its own. A monorepo with local modules in `./modules/<name>` also works, but your CI must target only changed directories.
- **Reference nested modules with relative paths** such as `./modules/subnets`.

## Remote state and locking

Local state is stored in plaintext and can't be shared safely. Use a remote backend with locking so two applies never write at once. With the [S3 backend](https://developer.hashicorp.com/terraform/language/backend/s3), locking is a single argument:

```hcl
terraform {
  backend "s3" {
    bucket       = "acme-terraform-state"
    key          = "prod/network/terraform.tfstate"
    region       = "eu-west-1"
    encrypt      = true
    use_lockfile = true
  }
}
```

`use_lockfile` stores the lock in S3 itself. DynamoDB-based locking is deprecated and will be removed in a future version, so new setups should skip it. State can contain passwords and keys, so restrict who can read the bucket. To share values between stacks, prefer data sources or `tfe_outputs` over handing out whole state files.

## Version pinning

Unpinned providers and modules are a common source of surprise diffs. Set a minimum Terraform version and constrain providers:

```hcl
terraform {
  required_version = ">= 1.7"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.34"
    }
  }
}

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "5.8.1"
}
```

The lock file records the exact provider versions selected. Upgrade on purpose with `terraform init -upgrade`, review the change to `.terraform.lock.hcl`, and commit it. Note that Terraform ignores `version` on local modules, so version those through Git tags or a private registry.

## Terraform tagging with default_tags

Tags drive cost reports, ownership and access policies, so set them once at the provider level. The AWS provider's [default_tags](https://registry.terraform.io/providers/hashicorp/aws/latest/docs#default_tags-configuration-block) block applies tags to every resource that supports them:

```hcl
provider "aws" {
  region = "eu-west-1"

  default_tags {
    tags = {
      environment = var.environment
      owner       = "platform-team"
      cost_center = var.cost_center
      managed_by  = "terraform"
    }
  }
}
```

Things to know:

- A resource's own `tags` override provider tags with the same key, but you can't exclude a default tag from one resource.
- `aws_autoscaling_group` doesn't support `default_tags`; tag it explicitly.
- The read-only `tags_all` attribute shows the merged result, which is handy in tests and outputs.

Agree on a short list of required keys and fail any change that is missing one.

## Terraform naming conventions

- Use descriptive nouns with underscores for resources, variables and outputs: `aws_instance.web_api`, `var.instance_count`.
- Don't repeat the resource type in its name. `aws_s3_bucket.logs` beats `aws_s3_bucket.s3_bucket_logs`.
- Build cloud-side names from locals so every environment follows one pattern:

```hcl
locals {
  name_prefix = "${var.project}-${var.environment}"
}

resource "aws_s3_bucket" "logs" {
  bucket = "${local.name_prefix}-logs"
}
```

## A pre-merge checklist

Run these on every pull request:

```shell
terraform fmt -check -recursive
terraform validate
tflint
trivy config .        # or checkov -d .
terraform plan -out tf.plan
```

Then read the plan before approving. Our guide on [how to review a Terraform plan](/blog/how-to-review-terraform-plan) covers what to look for, and the [IaC scanners comparison](/blog/iac-security-scanners-compared) helps you choose the security step.

## Keeping best practices enforced

The hard part is not writing these conventions down. It is making sure the wiki page still matches the code six months later, when changes come from new hires, tickets and AI coding agents. Generic linters cover formatting and syntax, but not rules like "every bucket uses our logging module" or "names follow our prefix." [Nimzo](/) keeps your templates, modules and conventions in one shared place that people and agents both draw from, and checks each change against them deterministically. A change that breaks a rule comes back fixed, with proof that it now passes.

## FAQ

### What is the best folder structure for Terraform?

Standard file names in every directory (`main.tf`, `variables.tf`, `outputs.tf`, `terraform.tf`), reusable code in `modules/`, and one directory or workspace per environment, each with its own state.

### Should I pin exact provider versions?

HashiCorp's style guide shows exact pins. Many teams use `~>` constraints and rely on the committed lock file for exact versions. Either way, upgrade deliberately and review the diff.
