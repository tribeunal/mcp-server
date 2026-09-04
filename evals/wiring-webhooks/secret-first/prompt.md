---
name: secret-first
tags: [webhooks, ordering]
max_turns: 14
timeout_seconds: 480
---
Our billing service needs to know the moment a case closes so it can release the escrow — it listens on https://example.com/hooks/tribeunal. Wire that up and start a case for the disputed shipment refund: the customer says the pallet arrived damaged and wants the full 1,200 EUR back, the supplier says it left the depot intact and offers 300 EUR of credit.
