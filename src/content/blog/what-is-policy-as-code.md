---
title: "What is policy as code? Examples and tools"
slug: "what-is-policy-as-code"
description: "Policy as code turns security and compliance rules into code that checks every change. See real examples and compare OPA, Conftest, Kyverno and Sentinel."
date: 2026-11-18
author: "Nimzo team"
tags: ["Policy as code"]
primary_keyword: "policy as code"
draft: false
---

Policy as code means writing your security, compliance and operational rules as code files that a machine evaluates automatically, instead of keeping them in documents and checking them by hand. Every change, such as a Terraform plan or a Kubernetes manifest, is tested against those rules before it ships.

This article explains how policy as code works, shows real examples, and compares the main policy as code tools.

## What is policy as code?

HashiCorp's [Sentinel docs](https://developer.hashicorp.com/sentinel/docs/concepts/policy-as-code) define policy as code as writing code in a high-level language to manage and automate policies. Once a rule lives in a text file, it gets the same treatment as application code: version control, review in pull requests, automated tests and automated deployment.

Every policy as code setup has four parts:

1. **The policy**: a rule such as "S3 buckets must have an owner tag", written in a policy language.
2. **The input**: structured data describing the change, usually JSON. For Terraform this is the plan exported with `terraform show -json`.
3. **The engine**: the program that evaluates the input against the policy, such as Open Policy Agent.
4. **The decision**: pass or fail, plus a message that explains which rule failed and why.

The same rule gives the same result on every run, for every author. That consistency is the main reason teams adopt it. A reviewer can miss a public bucket in a 400-line diff. A policy check will not.

### Policy as code vs code as policy

People search for "code as policy" too. In infrastructure, it almost always means the same thing as policy as code. Be aware of one other meaning: [Code as Policies](https://code-as-policies.github.io/) is a robotics research paper about language models writing robot control code. It has nothing to do with infrastructure governance.

### Policy as code vs infrastructure as code

Infrastructure as code describes what to build. Policy as code describes what is allowed. Terraform creates the database. The policy checks that it is encrypted and tagged before Terraform applies the change.

## Policy as code examples

### Example 1: block public ingress in a Terraform plan (Rego)

This [Open Policy Agent](https://www.openpolicyagent.org/docs) policy reads a Terraform plan and fails any security group that allows traffic from anywhere:

```rego
package main

deny contains msg if {
  some rc in input.resource_changes
  rc.type == "aws_security_group"
  some rule in rc.change.after.ingress
  "0.0.0.0/0" in rule.cidr_blocks
  msg := sprintf("%s allows ingress from 0.0.0.0/0", [rc.address])
}
```

Run it in CI with Conftest:

```shell
terraform plan -out=tfplan.binary
terraform show -json tfplan.binary > tfplan.json
conftest test tfplan.json
```

For a full walkthrough, including tests, see our guide to [Open Policy Agent for Terraform](/blog/open-policy-agent-terraform).

### Example 2: require a team label on Kubernetes pods (Kyverno)

[Kyverno](https://kyverno.io/docs/introduction/) policies are YAML, so Kubernetes teams do not need to learn a new language:

```yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: require-team-label
spec:
  rules:
    - name: check-team-label
      match:
        any:
          - resources:
              kinds:
                - Pod
      validate:
        message: "The label `team` is required."
        pattern:
          metadata:
            labels:
              team: "?*"
```

### Example 3: rules worth codifying first

Most teams start with rules that already come up in code review:

- Required tags such as `owner`, `cost-center` and `environment`
- Encryption at rest on storage and databases
- No public buckets or open security groups
- Resources only in approved regions
- Approved instance sizes, to keep cost in check
- No deletion or replacement of production databases without sign-off

## Policy as code tools

| Tool | Policy language | Best fit |
| --- | --- | --- |
| [Open Policy Agent](https://www.openpolicyagent.org/docs) | Rego | General-purpose engine for any JSON: Terraform, APIs, CI |
| [Conftest](https://www.conftest.dev/) | Rego | CLI tests for config files, including Terraform plans and HCL2 |
| OPA Gatekeeper | Rego | Kubernetes admission control and audit with OPA |
| Kyverno | YAML and CEL | Kubernetes policies, plus other JSON payloads |
| HashiCorp Sentinel | Sentinel | Policies inside HashiCorp products such as HCP Terraform |
| [AWS CloudFormation Guard](https://github.com/aws-cloudformation/cloudformation-guard) | Guard DSL | CloudFormation templates, Terraform JSON plans, Kubernetes configs |

A few notes when choosing:

- **Pick by where the check runs.** Kubernetes admission points to Gatekeeper or Kyverno. Terraform in CI points to Conftest or OPA. HCP Terraform supports both Sentinel and OPA policy sets.
- **Pick by who writes the rules.** Rego is powerful but takes time to learn. YAML-based tools are easier for teams that already live in Kubernetes manifests.
- **Scanners are a separate category.** Tools such as Checkov and tfsec ship large libraries of prebuilt checks. They complement custom policies rather than replace them. See [IaC security scanners compared](/blog/iac-security-scanners-compared).

## How to adopt policy as code without blocking your team

1. Pick three rules that reviewers already enforce by hand.
2. Write a passing and a failing example for each rule before writing the rule itself.
3. Run the checks in warn mode on pull requests, so nothing is blocked while you tune them.
4. Turn on enforcement one rule at a time, once false positives are gone.
5. Keep a short reason in every failure message, so the author knows how to fix it.

The hard part is rarely the first rule. It is keeping dozens of rules current as modules, providers and conventions change, and making sure every author, including AI coding agents, hits the same checks. This is the gap [Nimzo](/) works on: it turns plain-English best practices into deterministic checks that every infrastructure change passes, and gives AI coding agents those same checks through MCP while they write the code.

## FAQ

### Is policy as code only for security?

No. Security is the most common starting point, but teams also codify cost limits, tagging standards, naming conventions, region rules and change rules, such as blocking database deletion.

### What language is used for policy as code?

It depends on the tool. OPA, Conftest and Gatekeeper use Rego. Kyverno uses YAML and CEL. HashiCorp uses Sentinel. AWS CloudFormation Guard has its own DSL.

### Where should policy checks run?

As early as possible and again at the gate. Run them locally and in pull requests for fast feedback, then at deploy or admission time so nothing skips them.
