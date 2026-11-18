---
title: "IaC scanning compared: Checkov, tfsec, KICS, Terrascan"
slug: "iac-security-scanners-compared"
description: "IaC scanning compared: Checkov, tfsec, KICS, Terrascan and Trivy. Rule formats, coverage, maintainers and current status, plus which scanner to choose."
date: 2026-11-18
author: "Nimzo team"
tags: ["Security", "Terraform"]
primary_keyword: "iac scanning"
draft: false
---

IaC scanning is static analysis of infrastructure code, such as Terraform, CloudFormation, Kubernetes manifests and Helm charts, that flags security misconfigurations before anything is deployed. Today the realistic open source choice is between Checkov, KICS and Trivy, because tfsec now lives on inside Trivy and Terrascan's repository has been archived.

Below is what each scanner covers, how to run it, and how to keep its findings useful in pull requests.

## What IaC scanning catches

A scanner parses your files and compares each resource against a library of rules. Typical findings are storage buckets open to the public, security groups that allow `0.0.0.0/0` on SSH, unencrypted disks and databases, missing access logs, and containers that run as root.

The better tools evaluate HCL expressions, variables and module calls instead of reading literal values only. Some can also scan a Terraform plan exported as JSON, which sees the final values after variables and modules resolve. That catches issues a file-level scan misses.

Scanners sit after formatting and syntax checks, not in place of them. If you are still setting those up, see [terraform validate vs tflint](/blog/terraform-validate-vs-tflint).

## The tools at a glance

| Tool | Rule format | IaC coverage | Maintainer | Current status |
|---|---|---|---|---|
| Checkov | Built-in checks; custom policies in Python or YAML | Terraform, Terraform plan, OpenTofu, CloudFormation, AWS SAM, Kubernetes, Helm, Kustomize, Dockerfile, Serverless, Ansible, Bicep, ARM | Bridgecrew (Prisma Cloud, Palo Alto Networks) | Active, frequent releases |
| KICS | Queries in Rego (OPA) | Terraform, CloudFormation, Kubernetes, Docker, Ansible, Helm, ARM, CDK, SAM, OpenAPI, gRPC, Google Deployment Manager and more | Checkmarx | Active (2.x releases) |
| Trivy | Built-in checks; custom checks in Rego | Terraform, CloudFormation, ARM, Helm, Kubernetes, Dockerfile, plus images, file systems and repos | Aqua Security | Active; now home of tfsec's Terraform engine |
| tfsec | Built-in rules (Go) | Terraform | Aqua Security | Still available, but engineering focus has moved to Trivy |
| Terrascan | Rego with a JSON rule file per policy | Terraform, CloudFormation, Kubernetes, Helm, Kustomize, Dockerfile | Tenable | Archived and no longer maintained (last release v1.19.9, September 2024) |

## Checkov

[Checkov](https://www.checkov.io/) is a Python tool with graph-based scanning, so it can check relationships between resources, not only single attributes. It has the widest framework list of the group.

```shell
pip install checkov
checkov -d .
checkov -d . --skip-check CKV_AWS_20
```

To scan a plan instead of raw files:

```shell
terraform plan -out tf.plan
terraform show -json tf.plan > tf.json
checkov -f tf.json
```

Accepted risks are suppressed inline, with a reason that stays in the code review history:

```hcl
resource "aws_s3_bucket" "site" {
  #checkov:skip=CKV_AWS_20:Public static website bucket
  bucket = "acme-public-site"
}
```

## Trivy, and what happened to tfsec

tfsec was the fast, Terraform-only favorite for years. Aqua Security has since consolidated its scanners into [Trivy](https://trivy.dev/latest/docs/scanner/misconfiguration/). The [tfsec repository](https://github.com/aquasecurity/tfsec) now describes itself as part of Trivy and says tfsec "will continue to remain available for the time being," while engineering attention goes to Trivy. It is not archived, but new work lands in Trivy.

Migration is mostly a command swap:

```shell
# before
tfsec .

# after
trivy config .
trivy config --severity HIGH,CRITICAL ./infra
```

Trivy pulls its misconfiguration checks from a registry, so rule updates arrive without a new binary. If you already use Trivy for container images, adding `trivy config` gives you one tool and one report format. `trivy fs --scanners vuln,misconfig,secret` covers dependencies, IaC and secrets in a single pass.

## KICS

[KICS](https://github.com/Checkmarx/kics) from Checkmarx writes every query in Rego, which is useful if your team already knows Open Policy Agent. It also covers OpenAPI and gRPC definitions.

```shell
docker run -t -v "$PWD":/path checkmarx/kics scan -p /path --fail-on critical,high
```

`--fail-on` controls which severities produce a non-zero exit code, which is how you decide what blocks a pipeline. Comments that start with `kics-scan`, such as `# kics-scan ignore`, control what gets skipped.

## Terrascan

[Terrascan](https://github.com/tenable/terrascan) by Tenable shipped 500+ Rego policies and scanned Terraform, CloudFormation and Kubernetes formats. The repository is now archived with a notice that the project is no longer maintained and accepts no further updates. If it is still in your pipeline, plan a move. Its policies are Rego, so KICS or Trivy custom checks are the closest landing spots.

## Which IaC scanner to pick

- **Terraform-heavy team that wants plan-aware checks and Python custom policies:** Checkov.
- **Already running Trivy for images:** add `trivy config`; this is also the path off tfsec.
- **Team fluent in Rego that needs many formats:** KICS.
- **Still on Terrascan:** migrate to one of the above.

Running two scanners rarely pays off. Their rule sets overlap heavily, so you get duplicate findings and two suppression syntaxes to maintain.

## Making scanner output usable in pull requests

The most common complaint about IaC scanning is noise. A few habits keep it in check:

1. Start by failing only on high and critical findings, and report the rest as comments.
2. Require a written reason for every inline suppression.
3. Scan the plan JSON as well as the files, so module inputs are evaluated.
4. Turn on stricter severities one rule group at a time, once the backlog is cleared.

The bigger gap is that scanners ship generic rules. The checks that matter most are often your own: approved modules only, allowed regions, required tags, naming conventions. Writing those by hand in Rego or Python for each tool is where many teams stall (more on that in [what is policy as code](/blog/what-is-policy-as-code)). This is the problem [Nimzo](/) is built around: it drafts policies from plain-English rules and your repos, with pass and fail examples, then runs them as deterministic checks on every change, so the same input always gets the same verdict. Its gate starts by commenting on pull requests rather than blocking them, and enforcement turns on rule by rule, which mirrors the gradual rollout above.

## FAQ

### Is tfsec deprecated?

Not formally archived, but Aqua directs users to Trivy and focuses development there. `trivy config` uses the same Terraform scanning engine, so moving is low effort.

### Is Terrascan still maintained?

No. Tenable archived the repository and states that the project is no longer maintained.

### Is Trivy a replacement for Checkov?

For Terraform misconfiguration checks they overlap a lot. Checkov offers plan scanning and Python or YAML custom policies; Trivy adds vulnerability and secret scanning in the same binary. Pick the one whose custom rule format your team will actually write.
