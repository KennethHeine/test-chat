# System Overview

## Product concept
Build a web-based AI project management and delivery orchestration platform that uses GitHub as the execution backend.

The system should help users:
- define long-term goals
- identify required research before coding starts
- break work into milestones
- create GitHub projects, milestones, and issues
- orchestrate GitHub Copilot coding agent to execute work issue by issue
- manage branch and pull request flow for milestone delivery

## Core idea
The platform is responsible for:
- planning
- research
- decomposition
- orchestration
- progress tracking

GitHub is responsible for:
- repositories
- issues
- milestones
- branches
- workflows
- pull requests
- code review flow

GitHub Copilot coding agent is responsible for:
- implementing scoped tasks
- fixing review comments
- iterating on pull requests
- completing issue-level execution

## Long-term goal
Transform a high-level product or system goal into a structured, research-backed, milestone-driven GitHub execution plan that can be completed with minimal human intervention during delivery.

## Key constraints
- Web-based product
- Azure-first architecture
- Domain: `chat.kscloud.io`
- Users must use their own GitHub identity and GitHub Copilot subscription
- The platform should focus on high-quality planning before implementation starts
