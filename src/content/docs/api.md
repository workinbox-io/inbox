---
title: API
description: Automate with the REST API and organization API keys.
section: Guides
order: 1
updated: 2026-10-25
---

Create a key in **Settings → Organization → API keys** and send it as a bearer token:

```sh
curl https://example.com/api/v1/projects \
  -H "Authorization: Bearer sk_…"
```

The full description is at [`/api/v1/openapi.json`](/api/v1/openapi.json) (OpenAPI 3.1). Each key is
limited to 300 requests a minute.
