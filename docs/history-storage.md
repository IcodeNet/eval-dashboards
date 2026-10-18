# History storage

`eval-dashboards history` builds a run-history timeline from your reports. By default it writes one `history.json` file. It can also write a SQLite file, which suits long histories.

## Choose a store

The store comes from the output file extension.

| Output path | Store |
|---|---|
| `history.json` (or any other extension) | JSON file. Default. Works on Node 20+. |
| `.sqlite`, `.sqlite3`, `.db` | SQLite file. Needs Node 22.5 or newer. |

```sh
eval-dashboards history --input=.evals_output --out=eval-report/history.sqlite
```

## Convert between stores

`history-convert` copies history from one store to the other. It replaces whatever the output file already held.

```sh
# import history.json into SQLite
eval-dashboards history-convert --input=eval-report/history.json --out=eval-report/history.sqlite

# export SQLite back to history.json
eval-dashboards history-convert --input=eval-report/history.sqlite --out=eval-report/history.json
```

Converting in either direction gives byte-identical `history.json` output.

## Keep history.json for rollups

`org-rollup` and published static reports read `history.json` only. Export SQLite to `history.json` before using them.

## Node versions

SQLite uses the `node:sqlite` module built into Node. It is still marked experimental in Node 22 and prints an experimental warning. On Node 20 the SQLite store stops with a clear message. The JSON store and every other command are unaffected.

## SQLite layout

Each run is one row in `runs` holding the full entry as JSON. Date, branch and suite are separate indexed columns for range queries. The `meta` table records a `schemaVersion` of 1.

## Adding another store

A store is an object with `read()` and `write(entries)` (the `HistoryStore` interface in `src/history/store.ts`). `createHistoryStoreForPath` picks the store from the path.
