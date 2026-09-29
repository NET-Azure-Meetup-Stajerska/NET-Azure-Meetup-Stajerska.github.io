# .NET & Azure Meetup Štajerska

Website of the [.NET & Azure Meetup Štajerska](https://net-azure-meetup-stajerska.github.io/) community.
Plain static HTML/CSS/JS on GitHub Pages — no framework, no CI.

## Publish a new event
Edit `data/events.json`, add photos to `images/<YYYYMMDD>/`, then:

```bash
node tools/build.mjs        # regenerate pages (needs Node 18+)
git add -A && git commit -m "Add <event>" && git push
```

Preview locally: `node tools/build.mjs --serve` → http://localhost:8080

See `CLAUDE.md` for the full workflow (Claude Code can do all of this for you).
