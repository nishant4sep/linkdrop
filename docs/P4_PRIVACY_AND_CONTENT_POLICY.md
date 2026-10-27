# LinkDrop Privacy and Resource Policy

## Purpose

LinkDrop is intended to help people discover resources associated with Instagram posts. It must not claim to retrieve private creator-to-user messages unless that capability has actually been integrated and authorized. A submitted Instagram URL alone may not reveal the destination sent through a private DM automation.

## Data minimization

Collect only data needed to operate submissions, moderation, account security, and rewards if rewards are enabled. Before launch, document the exact fields collected by the deployed application and the reason for each field.

- Do not request Instagram passwords or session cookies.
- Do not collect private messages or scrape private accounts.
- Do not store survivor or other highly sensitive personal information as resource metadata.
- Avoid collecting personal details in free-text fields; explain what must not be submitted.
- Do not log authorization headers, passwords, service-role keys, or full secret-bearing URLs.
- Set retention periods for rejected submissions, evidence, audit events, and inactive accounts.

## Resource eligibility

A resource may be published only after the applicable verification and moderation process has been completed. Verification means the checks documented by LinkDrop passed; it is not a guarantee that a resource is safe, legal, permanent, or endorsed by its creator.

Reviewers should check:

- whether the resource matches the stated post and description;
- whether the URL is syntactically valid and uses an allowed scheme;
- whether the destination appears deceptive, malicious, or unrelated;
- whether publication would violate a known right, restriction, or takedown request;
- whether the resource exposes private information or appears to be shared without authorization.

Do not republish restricted, stolen, leaked, or clearly unauthorized files. When rights are uncertain, hold the submission rather than assuming it is permitted.

## URL and destination safety

- Accept only explicitly allowed public URL schemes, normally HTTPS.
- Reject credentials embedded in URLs and dangerous schemes such as `javascript:`, `data:`, and `file:`.
- Do not fetch arbitrary user-provided destinations from the application server without a dedicated SSRF-safe design.
- If automated fetching is introduced, block loopback, private, link-local, reserved, and cloud metadata destinations; validate DNS results and redirects; defend against DNS rebinding; restrict ports, response size, content type, and timeouts.
- Treat third-party link content as untrusted. Never execute downloaded files or render unsanitized HTML.
- A URL syntax check is not proof that a destination is harmless.

## Takedown and correction requests

Provide a monitored contact channel before public launch. A request should identify the resource and explain the issue without requiring unnecessary sensitive information.

1. Acknowledge the request where contact details are available.
2. Temporarily unpublish a resource when credible risk or potential harm warrants it.
3. Review the request and available provenance evidence.
4. Record the decision and rationale without exposing private information publicly.
5. Remove or correct the listing when appropriate.
6. Provide an appeal path for submitters where feasible.

Do not promise a response time until a real team and process can meet it.

## Transparency

Explain publicly:

- what LinkDrop verifies and what it does not;
- whether review is automated, human, or hybrid;
- that external destinations can change or disappear;
- how users can report unsafe or incorrect resources;
- how personal data is used, retained, and deleted;
- whether contributors receive points or other rewards and how decisions can be appealed.

Rewards or sponsorship must not influence whether a resource is described as verified. Paid placement, if added, must be clearly distinguished from moderation status.

## Before launch

This document is an operational policy draft, not legal advice or a complete privacy notice. Adapt it to the actual data flows, hosting providers, retention settings, support contact, and applicable law. Do not publish promises the implementation cannot honor.