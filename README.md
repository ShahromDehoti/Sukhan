# Sukhan

A Tajik vocabulary trainer with a real spaced-repetition scheduler. There are very
few good Tajik learning tools; this aims to be a simple, friendly one.

Each card carries the Tajik word in Cyrillic, a Latin pronunciation guide, a
Cyrillic phonetic guide, and English and Russian translations.

```
pnpm install
cp packages/web/.env.example packages/web/.env.local   # then fill it in
pnpm dev                                               # http://localhost:5173
```

Requires Node 22+. pnpm is pinned via Corepack — run `corepack enable` once and
the right version is used automatically.

## Layout

```
packages/core/   @sukhan/core — the domain. FSRS scheduling, curriculum
                 structure, progression rules. Pure functions over plain data:
                 no network, no storage, no clock, no DOM.
packages/web/    React 19 + Vite client. Routing, data fetching, persistence.
docs/            Engineering write-ups.
```

The domain lives in its own package because scheduling has to run in two places:
the server decides which cards are due, and the client applies ratings
optimistically. One implementation, one test suite, no drift. It also means the
interesting logic is testable without a browser — the suite simulates years of
review history in milliseconds.

## Scheduling

Reviews are scheduled with **FSRS-6**, the same algorithm and default weights as
the reference `ts-fsrs` implementation. Rather than trust a from-memory
transcription of the equations, the test suite evaluates every one of them side by
side with that library across parameter grids and 20,000 randomised multi-review
histories; a divergence fails the build.

Two deliberate departures from the reference: no interval fuzz (it injects
nondeterminism into a pure function for a benefit this app is too small to need)
and no Anki-style learning-step queues (Sukhan has no such queue).

Layered on top, `fast-check` property tests assert the invariants the app depends
on — difficulty stays within [1, 10], a better rating never shortens an interval,
`Again` never increases stability — over generated inputs rather than hand-picked
examples.

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Run the web client |
| `pnpm test` | Unit and component tests, all packages |
| `pnpm typecheck` | `tsc --noEmit`, all packages |
| `pnpm lint` | Type-aware ESLint |
| `pnpm build` | Build every package |
| `pnpm check` | Lint, typecheck, and test together — what CI runs |

## Accessibility

Targeting WCAG 2.2 AA. Concretely: the flashcard is a real toggle button rather
than a clickable `<div>`, so the app's central interaction works from the
keyboard; revealed translations are mirrored into a live region; dialogs trap
focus, close on Escape, and restore focus on exit; each script is tagged with its
`lang` so screen readers switch voices between Tajik, Russian, and English
instead of reading all three as English; and the card flip honours
`prefers-reduced-motion`.

## Configuration

Client configuration comes from the environment — see
`packages/web/.env.example`. The Supabase anon key is *publishable*: it ships to
every browser by design, and the security boundary is Row Level Security on the
database, not secrecy of that value.

## Engineering notes

- [Code review case study](docs/code-review-case-study.md) — the defects found in
  the original implementation, with the analysis, the fix, and the test that
  catches each one. Includes measured evidence for the shuffle bias and a
  mutation check confirming the scheduler tests can actually fail.

## Contributing

Pull requests welcome. `pnpm check` should pass before you open one.

## License

MIT.

## Acknowledgements

Thanks to Tajik language communities and open-source linguistics resources, and to
the [FSRS](https://github.com/open-spaced-repetition) project for the scheduling
algorithm.
