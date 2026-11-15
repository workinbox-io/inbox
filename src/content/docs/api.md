---
title: API
description: Automate with the REST API and organization API keys.
section: Guides
order: 1
updated: 2026-11-09
---

Create a key in **Settings → Organization → API keys** and send it as a bearer token:

```sh
curl https://workinbox.io/api/v1/notes \
  -H "Authorization: Bearer sk_…"
```

The full description is at [`/api/v1/openapi.json`](/api/v1/openapi.json) (OpenAPI 3.1). Each key is
limited to 300 requests a minute.
