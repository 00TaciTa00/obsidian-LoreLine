# LoreLine for Obsidian

*English · [한국어](README.ko.md)*

Read the markdown notes in your vault as a narrative timeline — **by time, by place,
by character**. The pure timeline logic is ported from the
[LoreLine](https://github.com/00TaciTa00/LoreLine) web app; only the storage layer
changed, from a database to your vault.

**It is read-only.** The views never create, edit, or reorder your events. You write
in markdown; this plugin only shows it back to you differently. The one thing it
writes is the definition file when you create a new world.

One vault can hold **many worlds**. Any folder containing `loreline.config.json` is a
world of its own, and each opens in its own tab.

## Why read-only

Your worldbuilding already lives in the vault. Character notes hold relationships and
background; event notes hold scenes; Obsidian's links, backlinks, and search already work
well on top of them. What was missing wasn't another editor — it was a **horizontal
axis**: seeing what happened elsewhere at the same moment.

So the plugin keeps no data of its own. Edit a note and the view follows. Remove the
plugin and what remains is still just markdown.

## The three views

One view, one toolbar toggle; only the contents change.

| View | Vertical axis | Horizontal axis | Good for |
|------|---------------|-----------------|----------|
| **Time** | era → in-story time | none | Skimming the whole flow. Events with no place or character still appear |
| **Place** | in-story time | places | Seeing what happened in several places at once |
| **Character** | in-story time | characters | Seeing when each character is on stage |

In the grids (Place and Character), **events sharing the same in-story time are merged
into one row** — showing simultaneity across columns is the whole point of a grid.

### Click a name to open its note

Every name in a view links to its note.

| Click | Opens |
|-------|-------|
| An event card | that event note |
| A grid column header (character / place) | that character or place note |
| The era in a grid's time cell | that era note |
| The era heading in the Time view | that era note |

**Ctrl/Cmd-click** or **middle-click** opens in a new tab. `Tab` to it and press
`Enter` to open with the keyboard.

Names without a note — defined only in the config file, or referenced only by an event
— are not links. There is nothing to click through to, so nothing invites the click.

## Install

Not in the community plugin list yet. Install it by hand.

Download `main.js`, `manifest.json`, and `styles.css` from a
[release](../../releases) and drop them into
`<vault>/.obsidian/plugins/loreline/`. Then enable **LoreLine** under
Settings → Community plugins.

To build from source instead:

```bash
npm install
npm run deploy          # check → build → copy into the vault
```

Tell `npm run deploy` which vault to copy into, either with a `deploy.local.json`
at the repo root (git-ignored):

```json
{ "vault": "D:/MyVault" }
```

or with `OBSIDIAN_VAULT`, which takes precedence:

```powershell
$env:OBSIDIAN_VAULT = "D:/MyVault"; npm run deploy   # PowerShell
```

```bash
OBSIDIAN_VAULT="D:/MyVault" npm run deploy           # bash
```

The deploy refuses to copy when the path is unset, missing, or has no `.obsidian`
folder (open it as a vault in Obsidian once first).

## Worlds

**A folder containing `loreline.config.json` is a world.** There is no list to
maintain in settings — instead of opening settings every time you add a folder, you
drop one file next to it.

```
vault/
├ Lost Legacy/
│  ├ loreline.config.json   ← world "Lost Legacy"
│  └ Cast/ Scenario/ ...
├ Pintadine/
│  ├ loreline.config.json   ← world "Pintadine"
│  └ Events/ Characters/ Places/ Eras/
└ Evernote/                 ← no definition file, not a world
```

### Creating a world

Any of these:

- **Right-click a folder → "Create a LoreLine world here"** — shortest path
- Command palette → `LoreLine: Create a new world`
- With no worlds yet, clicking the ribbon icon opens the create dialog directly

It asks for a folder (created if missing) and a name (folder name if left blank), then
lays down the skeleton:

```
New Work/
├ loreline.config.json
├ 사건/예시 사건.md      ← references the three below by name
├ 인물/예시 인물.md
├ 장소/예시 장소.md
└ 기간/예시 기간.md
```

Because the sample event references the other three, **a timeline with one real event
is standing the moment you create the world.** Look at the format once, then delete
them.

The folder names map one-to-one to the `loreline` frontmatter values (사건=event,
인물=character, 장소=place, 기간=era). Rearrange them however you like — the plugin
never looks at folder names, only at frontmatter.

What it will not do:

- **Touch a folder that already has a definition file** — overwriting would destroy
  that world's colors and ordering
- **Overwrite any existing file** — if a sample's filename is taken, it skips it
- **Add samples to a folder that already has `loreline:` notes** — you wrote notes
  first and declared the world later, so you know the format already; scattering
  examples into your own folder helps nobody

You can also create one by hand. `{}` on a single line is enough:

```bash
echo "{}" > "New Work/loreline.config.json"
```

The name defaults to the folder name. To call it something else, say so in the
definition file:

```json
{ "name": "The Story of Pintadine D'Erang", "characters": [] }
```

Put the file at the vault root and the whole vault becomes one world, named after the
vault.

## Opening a timeline

- The branch icon in the left ribbon
- Right-click a folder → "Open LoreLine timeline" (when that folder is a world)
- Command palette → `LoreLine: Open timeline`
- Command palette → `LoreLine: Pick a world and open it in a new tab`
- Command palette → `LoreLine: Create a new world`
- Command palette → `LoreLine: Reload timeline`

With one world it opens straight away; with several you get a picker. If a tab is
already showing that world, it goes there instead of opening another.

One tab shows one world. To see several side by side, open several tabs. **A tab
remembers its world, view mode, and hidden columns across restarts.** Click the world
name in the toolbar to switch that tab to another world.

## Writing the notes

Three places, joined by **name strings**. A character note's filename and an event's
`characters` entry refer to the same character when the text matches.

### 1. Event notes — one note per event

````markdown
---
loreline: event
displayTime: "789 AR"     # printed as written. Free-form text
sortKey: 3000             # sorting only. Ascending
era: "Third Sacred Age"   # era name. Omit if none
characters: ["Anais", "Zibelin"]
places: ["The Capital"]
color: "#3b82f6"          # optional. Falls back to the era color
---
# The Fall of the Capital

The gates opened.
````

- **Title** is the leading H1, or the filename if there is none.
- **Description** is the body minus the frontmatter and that leading H1. Cards fold it
  at 120 characters.
- `displayTime` is never parsed. `"Winter of year 3"`, `"just before the curtain"` —
  anything goes.
- But **only exactly equal strings merge into one row.** `"Winter of year 3"` and
  `"Winter of year 3 (night)"` are different rows.

### 2. Character / place / era notes — declaring that a name exists

````markdown
---
loreline: character     # place | era work the same way
---
Everything you want to say about Anais. Links and backlinks as usual.
````

The filename is the name. The body is never read by the plugin, so write freely. These
notes are what make **a character or place with no events at all still appear as a
column.**

### 3. `loreline.config.json` — colors and ordering

```json
{
  "characters": [
    { "name": "Anais",   "color": "#3b82f6", "order": 10 },
    { "name": "Zibelin", "color": "#ef4444", "order": 20 }
  ],
  "places": [
    { "name": "The Capital", "color": "#22c55e", "order": 10 }
  ],
  "eras": [
    { "name": "Third Sacred Age", "color": "#a855f7", "order": 10 }
  ]
}
```

`order` sets grid column order and Time-view section order. Ascending; ties and
missing values fall back to name order. `name` is the world's display name (see
"Worlds" above).

**This file's location is the world's boundary.** Scanning only descends from the
folder that holds it.

> **Why JSON and not `.md` frontmatter**
> Obsidian's YAML parser is not dependable with arrays of objects. Colors and ordering
> get rearranged wholesale in one place, so the parser had to be trustworthy.

## When names don't line up

Joining three places by name means they will drift apart eventually. One rule —
**delete nothing, say something.**

| Situation | What happens |
|-----------|--------------|
| Note exists, not in the config file | Shown with the default color (`#6b7280`), ordered last |
| In the config file, no note | Used anyway, with a warning (catches typos and deletions) |
| Referenced only by an event, no note and no config entry | Added to the list. Dropping it would erase that event from the grid entirely |
| No notes of that kind at all | No orphan check |

That last row matters. If you simply decided not to write character notes, having the
entire config file pour out as warnings would make warnings worthless.

## Warnings

A **`경고 N`** button appears in the toolbar; click to expand. Warnings never block the
view — forgetting a color shouldn't hide everything else.

- The target folder could not be found
- `displayTime` missing, so that event is skipped
- `sortKey` is not a number, so that event goes last
- Several events share one `sortKey`, so their order falls back to path order
- One in-story time is split across several grid rows because the sort keys separate it
- A name in the config file has no note

### About split rows

The grid merges **only consecutive** events into a row. Time is a flowing axis, so
merging things that are apart would break the order. Get a `sortKey` wrong and one
in-story time splits across rows. Numbering is manual here, so this happens; the
loader warns before you notice it visually.

**Leave gaps of 1000 in `sortKey`.** Then inserting an event between two others needs
no renumbering.

## Settings

| Setting | Default | Meaning |
|---------|---------|---------|
| Auto reload | On | Redraw when a note or definition file changes (debounced 500 ms) |

That's all of it. World lists come from the vault, so there is nothing to configure.
The settings tab lists the worlds it currently finds — check there if one you made
isn't showing up.

Reloading touches **only tabs whose world contains the changed file.** Four worlds open
and one note edited does not rescan all four.

## Development

```bash
npm run dev       # esbuild watch
npm run check     # typecheck + tests (187)
npm run build     # typecheck + production bundle
npm run deploy    # check → build → copy into the vault
npm test          # vitest once
```

### Layout

```
src/
  lib/        Pure computation ported from LoreLine. No framework dependencies
  loader/     Vault → data. World discovery, scanning, config, resolution, diagnostics
  view/       Data → screen. Three renderers and one view (one tab, one world)
  testing/    Obsidian stub and DOM shim. Never enters the bundle
tools/preview/    Render the views to HTML without Obsidian
tools/import-world/  Move a world from the LoreLine web app into a vault
```

The flow runs one way: `findWorlds → scan → config → resolve → render`. One `LoreData`
from the loader goes to all three renderers unchanged.

Scan caches are kept **per world** (`ScanCaches`). Sharing one cache would let each
scan's cleanup step ("drop paths not seen this time") eat the other's entries, driving
the hit rate to zero whenever you alternate between two worlds.

### Previewing without Obsidian

```bash
npx esbuild tools/preview/main.ts --bundle --platform=node --format=esm \
  --alias:obsidian=./src/testing/obsidian-stub.ts --outfile=tools/preview/out.mjs
node tools/preview/out.mjs "C:/Obsidian/Hobby" "Pintadine" preview.html
```

It uses the real renderers and the real `styles.css`, and reads a real vault. You get
`preview.html` (all three views) plus one file per view. Only the Obsidian theme
variables are imitated, so colors differ slightly from your actual theme.

**What this cannot show you:** layout. Heights, scrolling, and sticky positioning need
a browser to measure them, and neither this tool nor the unit tests will catch a
mistake there. Check those in Obsidian.

### Testing

Code that leans on the Obsidian API is tested too, because vitest swaps the `obsidian`
module for `src/testing/obsidian-stub.ts`. Renderers draw into the DOM shim in the same
folder, where structure and attributes can be asserted.

## Releasing

The version has to match in three places (`package.json`, `manifest.json`,
`versions.json`). `npm version` keeps them in step.

```bash
npm version patch      # updates all three, commits, and tags
git push --follow-tags
```

Pushing the tag runs GitHub Actions, which checks, builds, and publishes a release with
`main.js`, `manifest.json`, and `styles.css` attached. **The tag must equal the version
exactly** — prefix it as `v0.1.0` and Obsidian will not find it.

## Not ported

- `resolveSortKeyForInsert`, `rebalanceTimeline` — numbering and rebalancing. Read-only
  needs neither
- vis-timeline, React Query, Drizzle, PostgreSQL — storage and rendering were replaced
  outright

The computation in `lib/timeline` (`formatDisplayTime`, `computeLanes`, `buildGrid`,
`buildEraGroups`) was moved **without changing a single line of its bodies**. Only the
types changed: database columns stripped, `id` turned into the name string.

## License

MIT, following the original [LoreLine](https://github.com/00TaciTa00/LoreLine).
