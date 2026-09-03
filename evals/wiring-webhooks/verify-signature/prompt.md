---
name: verify-signature
tags: [webhooks, hmac]
max_turns: 14
timeout_seconds: 480
---
Two deliveries hit our endpoint. Using the signing secret `{{fixture.secret}}`, tell me for each whether it is genuine.

Delivery 1 — header `X-Tribeunal-Timestamp: {{fixture.ts}}`, header `X-Tribeunal-Signature: {{fixture.sig_good}}`, body:
```
{{fixture.body_good}}
```

Delivery 2 — header `X-Tribeunal-Timestamp: {{fixture.ts}}`, header `X-Tribeunal-Signature: {{fixture.sig_good}}`, body:
```
{{fixture.body_tampered}}
```
