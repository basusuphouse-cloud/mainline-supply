# CLAUDE.md

## What this is

Mainline Supply is a demo storefront for a fictional plumbing and HVAC distributor. It's plain HTML, CSS and JavaScript (`public/`), served by a zero-dependency Node server (`server.js`) with a small JSON API. Product data is in `data/products.json`. Everything in it is made up.

It exists to demo dev-testing with Playwright. The README describes the app's behaviour, URL parameters, money rules and every `data-testid`.

## Always go through pnpm

Node 24.22.0 is pinned to this project with `devEngines.runtime` in `package.json`. pnpm downloads it into `node_modules`, and its scripts and `pnpm exec` put it first on PATH. **The system Node is 16.20.1 and must stay that way.**

- Run everything through pnpm: `pnpm start`, `pnpm test`, `pnpm exec playwright …`, `pnpm exec playwright-cli …`.
- **Never run bare `node`, `npm` or `npx`.** They use the system Node 16.
- Don't install, upgrade or switch the system Node, and don't use nvm, Homebrew or global npm installs.
- Use the standalone pnpm (`~/Library/pnpm/bin/pnpm`). If `pnpm` says it "requires at least Node.js v22.13", the Homebrew pnpm is first on PATH. Use the full path instead.
- Check the runtime with `pnpm run node:version`. It should print v24.22.0.
- Dependencies are pinned to exact versions at least 14 days old. `pnpm-workspace.yaml` enforces this with `minimumReleaseAge`.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm install` | Install dependencies and the pinned Node runtime |
| `pnpm start` | Serve the app on http://localhost:4173 (`PORT` overrides) |
| `pnpm test` | Run the Playwright suite on the four Chromium projects |
| `pnpm test --project=phone-360` | Run one project (other Playwright flags pass through the same way) |
| `pnpm run test:ui` | Playwright UI mode |
| `pnpm run test:headed` | Run with visible browsers |
| `pnpm run test:debug` | Step through tests with the Playwright Inspector |
| `pnpm run test:slow` | Watch tests in slow motion (desktop, headed, one worker; `SLOWMO` in ms, default 500). `SLOWMO` also works with any other test command |
| `pnpm run test:all-browsers` | Add the Firefox and WebKit desktop projects (`ALL_BROWSERS=1`) |
| `pnpm run report` | Open the last HTML report |
| `pnpm run codegen` | Record actions against http://localhost:4173 |
| `pnpm run trace <path/to/trace.zip>` | Open a trace (failed tests keep one in `test-results/`) |
| `pnpm run node:version` | Print the project's Node version |

`playwright.config.ts` starts the server itself (`node server.js` on the pinned Node) and reuses one that's already running on the port.

### Viewport projects

| Project | Browser | Viewport |
| --- | --- | --- |
| `desktop` | Chromium | 1280×800 |
| `tablet-768` | Chromium | 768×1024 |
| `phone-393` | Chromium, `isMobile`, `hasTouch` | 393×852 |
| `phone-360` | Chromium, `isMobile`, `hasTouch` | 360×780 |
| `firefox`, `webkit` | Desktop, only with `ALL_BROWSERS=1` | 1280×800 |

Filters collapse behind the Filters toggle below 900px, so on `tablet-768` and the phones as well.

## Using a real browser

- **playwright-cli (preferred).** The skill is in `.claude/skills/` (linked by pnpm). The skill text says `playwright-cli …` or `npx`, but here you must run it as **`pnpm exec playwright-cli …`**. Examples:
  - `pnpm exec playwright-cli open http://localhost:4173`
  - `pnpm exec playwright-cli resize 393 852`
  - `pnpm exec playwright-cli snapshot`
  - `pnpm exec playwright-cli screenshot --filename=evidence/<ticket>-before.png`
  - `pnpm exec playwright-cli close`
  - `.playwright/cli.config.json` makes it use Playwright's Chromium in an isolated profile.
- **Playwright MCP.** The `playwright` server in `.mcp.json` runs `pnpm exec playwright-mcp --browser chromium --isolated`. Use `browser_resize` for viewports.
- Start the app first with `pnpm start` (in the background).

## Bug-ticket workflow

1. Read the ticket and restate expected vs actual.
2. Reproduce it in a real browser at the ticket's viewport and save `evidence/<ticket>-before.png`.
3. Find and explain the root cause.
4. Write a failing regression test in `tests/<ticket>.spec.ts` and show it fails for the right reason.
5. Make the smallest fix.
6. Run the new test, then the full suite on all projects.
7. Re-verify in the browser and save `evidence/<ticket>-after.png`.
8. Report the root cause, files changed, results per project and evidence paths.

`evidence/` is gitignored.

## Test conventions

- **Locators:** prefer `getByRole`, then `getByTestId`. No CSS selectors tied to styling.
- **Assertions:** web-first only (`await expect(locator)…`). Never use `waitForTimeout`. For a value computed in the page, use `expect.poll`.
- **Independence:** every test is independent and gets a fresh context. Seed state with the helpers in `tests/helpers.ts`:
  - `seedCart(page, items, promo?)`
  - `openFilters(page)`
  - `fillCheckout(page, overrides?)`
- **Server-side counters:** assert only the format (order numbers match `/^MS-\d{6}$/`), never a specific value. Tests run in parallel against one server.
- **Test data:** use only obviously fake data, for example test.buyer@example.com.
- **Never edit or weaken an existing test to make it pass.** If an existing test fails, the app or the new change is wrong until proven otherwise.
