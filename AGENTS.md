# Deployment

Production deployments to workinbox.io go through GitHub Actions. After committing and pushing to `main`, run:

```sh
gh workflow run deploy.yml --ref main -R workinbox-io/inbox
```

Check the triggered run and report its result. Use this workflow instead of local `pnpm run deploy` or `wrangler deploy`; production credentials are configured in GitHub's `production` environment.
