# animus-subject-crossref-works

Crossref works subject backend plugin for Animus.

## Install

```sh
animus plugin install launchapp-dev/animus-subject-crossref-works --signature-policy strict
```

## Configuration

No configuration is required for the default Crossref works feed.

Optional:

```sh
export CROSSREF_QUERY="machine learning"
export CROSSREF_FILTER="from-pub-date:2026-01-01,type:journal-article"
export CROSSREF_SORT=published
export CROSSREF_ORDER=desc
export CROSSREF_SELECT=DOI,title,type,publisher,author,issued
export CROSSREF_API_URL=https://api.crossref.org
export CROSSREF_MAILTO=opensource@launchapp.dev
export CROSSREF_LOCAL_QUERY=sklearn
export CROSSREF_LIMIT=50
```

`CROSSREF_QUERY`, `CROSSREF_FILTER`, `CROSSREF_SORT`, `CROSSREF_ORDER`, and
`CROSSREF_SELECT` are passed to the Crossref `/works` endpoint.
`CROSSREF_LOCAL_QUERY` is a local text filter applied after works are fetched.

## Subject Kind

`crossref.work`

Subjects map Crossref works into Animus with DOI, title, type, publisher,
container title, subjects, authors, publication dates, reference counts,
licenses, links, score, and raw work metadata.
