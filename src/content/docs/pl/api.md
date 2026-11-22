---
title: API
description: Automatyzuj za pomocą REST API i kluczy API organizacji.
section: Guides
order: 1
updated: 2026-11-17
---

Utwórz klucz w **Konsola administratora → Klucze API** i wysyłaj go jako token typu bearer:

```sh
curl https://workinbox.io/api/v1/notes \
  -H "Authorization: Bearer sk_…"
```

Pełny opis jest pod adresem [`/api/v1/openapi.json`](/api/v1/openapi.json) (OpenAPI 3.1). Każdy klucz ma
limit 300 żądań na minutę.
