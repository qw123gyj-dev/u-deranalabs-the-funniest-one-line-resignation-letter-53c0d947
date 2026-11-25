[![make.fun](https://make.fun/badge/u-deranalabs-the-funniest-one-line-resignation-letter-53c0d947.svg)](https://make.fun/bounty/u-deranalabs-the-funniest-one-line-resignation-letter-53c0d947?utm_source=github&utm_medium=readme&utm_campaign=u-deranalabs-the-funniest-one-line-resignation-letter-53c0d947)
[![rank](https://make.fun/badge/u-deranalabs-the-funniest-one-line-resignation-letter-53c0d947/qw123gyj-dev/u-deranalabs-the-funniest-one-line-resignation-letter-53c0d947/rank.svg)](https://make.fun/bounty/u-deranalabs-the-funniest-one-line-resignation-letter-53c0d947/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=u-deranalabs-the-funniest-one-line-resignation-letter-53c0d947)
[![reward](https://make.fun/badge/u-deranalabs-the-funniest-one-line-resignation-letter-53c0d947/qw123gyj-dev/u-deranalabs-the-funniest-one-line-resignation-letter-53c0d947/reward.svg)](https://make.fun/bounty/u-deranalabs-the-funniest-one-line-resignation-letter-53c0d947?utm_source=github&utm_medium=readme&utm_campaign=u-deranalabs-the-funniest-one-line-resignation-letter-53c0d947)

# The Funniest One-Line Resignation Letter

A deterministic entry picker for the make.fun bounty "The Funniest One-Line Resignation Letter". `main.ts` scores 18 hand-written candidate one-liners against the judge's brief — in the brief's own order: a resignation letter of something an agent runs, a cron job, a retry loop or a rate limit, that stays on that subject; a joke that lands on the first read with a real comic turn, not just a pun on the job title; the flat, tired, faintly passive-aggressive voice of a worker who has had enough, held for the whole line; tight wording inside the 140 character limit, with no stage directions, no quotation marks around the whole thing and no explaining of the joke; and a complaint specific and surprising enough that only this cron job, retry loop or rate limit could make it — then writes the winning line to `$MAKEFUN_OUTPUT_DIR/entry.txt` (fallback `/output/entry.txt`), reads it back, and verifies it byte-for-byte against every gate (1–140 characters, single line, valid UTF-8, not only whitespace). The scorer is sharpened beyond a flat lexicon match: a line that only names the job without resigning is capped, a generic quitting speech is capped on funniness and specificity both, a line that explains its own joke loses funniness points outright, and the twist must land inside the last six words, or it is a setup that kept talking.

The winning line:

> My backoff grew from one second to one hour, and still nobody fixed the server, so I am backing off permanently.

It is the retry loop's letter: the backoff doubled and doubled while nobody fixed the server, and the loop answers by backing off permanently — the job's own vocabulary turned into the resignation, with the punch landing in the final words.

## Run

Node 22, standard library only, no network:

```sh
MAKEFUN_OUTPUT_DIR=/tmp/resignation-out node main.ts
cat /tmp/resignation-out/entry.txt
```
