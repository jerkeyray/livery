# Standard library

This page is generated from `getLanguageCatalog()`.

| Component | Category | Status | Description | Ports |
| --- | --- | --- | --- | --- |
| `person` | people | supported | A single person or user. | top, right, bottom, left, center |
| `team` | people | supported | A group of people acting together. | top, right, bottom, left, center |
| `service` | compute | supported | A software service or application boundary. | top, right, bottom, left, center |
| `api` | compute | supported | An application programming interface. | top, right, bottom, left, center |
| `database` | storage | supported | A persistent database. | top, right, bottom, left, center |
| `cache` | storage | supported | A low-latency cache. | top, right, bottom, left, center |
| `objectStore` | storage | supported | An object or blob store. | top, right, bottom, left, center |
| `warehouse` | storage | supported | An analytical data warehouse. | top, right, bottom, left, center |
| `queue` | messaging | supported | A queued message channel. | top, right, bottom, left, center |
| `topic` | messaging | supported | A publish-subscribe topic. | top, right, bottom, left, center |
| `stream` | messaging | supported | An ordered event stream. | top, right, bottom, left, center |
| `event` | messaging | supported | An event or emitted message. | top, right, bottom, left, center |
| `browser` | device | supported | A web browser client. | top, right, bottom, left, center |
| `mobile` | device | supported | A mobile device or application. | top, right, bottom, left, center |
| `terminal` | device | supported | A command-line terminal. | top, right, bottom, left, center |
| `server` | compute | supported | A server or compute host. | top, right, bottom, left, center |
| `agent` | ai | supported | An autonomous or assisted agent. | top, right, bottom, left, center |
| `model` | ai | supported | A machine-learning or language model. | top, right, bottom, left, center |
| `tool` | ai | supported | A tool callable by an agent or model. | top, right, bottom, left, center |
| `worker` | compute | supported | A background worker or process. | top, right, bottom, left, center |
| `file` | content | supported | A file artifact. | top, right, bottom, left, center |
| `document` | content | supported | A structured document. | top, right, bottom, left, center |
| `code` | content | supported | A source-code or protocol block. | top, right, bottom, left, center |
| `table` | content | supported | A compact structured table. | top, right, bottom, left, center |
| `note` | content | supported | A short contextual note. | top, right, bottom, left, center |
| `callout` | content | supported | An annotation connected to visual content. | top, right, bottom, left, center |
| `badge` | content | supported | A compact status or category badge. | top, right, bottom, left, center |
| `legend` | content | supported | A legend explaining visual encodings. | top, right, bottom, left, center |
| `boundary` | content | supported | A labeled grouping boundary. | top, right, bottom, left, center |
| `barChart` | chart | experimental | A basic bar chart. | top, right, bottom, left, center |
| `lineChart` | chart | experimental | A basic line chart. | top, right, bottom, left, center |
| `areaChart` | chart | experimental | A basic area chart. | top, right, bottom, left, center |
| `progress` | chart | experimental | A quantitative progress indicator. | top, right, bottom, left, center |

## Language calls

| Call | Category | Status | Contexts | Parameters |
| --- | --- | --- | --- | --- |
| `text` | primitive | supported | figure, component, canvas | `text: string`<br>`text?: string`<br>`x?: number`<br>`y?: number`<br>`width?: length`<br>`height?: length`<br>`layer?: number`<br>`clip?: identifier`<br>`mask?: identifier`<br>`translateX?: number`<br>`translateY?: number`<br>`scale?: number`<br>`scaleX?: number`<br>`scaleY?: number`<br>`rotate?: number`<br>`fill?: paint`<br>`opacity?: number`<br>`color?: paint`<br>`fontSize?: length`<br>`fontWeight?: number` |
| `box` | primitive | supported | figure, component, canvas | `label?: string`<br>`label?: string`<br>`x?: number`<br>`y?: number`<br>`width?: length`<br>`height?: length`<br>`layer?: number`<br>`clip?: identifier`<br>`mask?: identifier`<br>`translateX?: number`<br>`translateY?: number`<br>`scale?: number`<br>`scaleX?: number`<br>`scaleY?: number`<br>`rotate?: number`<br>`fill?: paint`<br>`stroke?: paint`<br>`strokeWidth?: length`<br>`opacity?: number`<br>`color?: paint`<br>`fontSize?: length`<br>`fontWeight?: number`<br>`radius?: length` |
| `circle` | primitive | supported | figure, component, canvas | `label?: string`<br>`label?: string`<br>`x?: number`<br>`y?: number`<br>`width?: length`<br>`height?: length`<br>`layer?: number`<br>`clip?: identifier`<br>`mask?: identifier`<br>`translateX?: number`<br>`translateY?: number`<br>`scale?: number`<br>`scaleX?: number`<br>`scaleY?: number`<br>`rotate?: number`<br>`fill?: paint`<br>`stroke?: paint`<br>`strokeWidth?: length`<br>`opacity?: number`<br>`color?: paint`<br>`fontSize?: length`<br>`fontWeight?: number` |
| `line` | primitive | supported | figure, component, canvas | `x?: number`<br>`y?: number`<br>`width?: length`<br>`height?: length`<br>`layer?: number`<br>`clip?: identifier`<br>`mask?: identifier`<br>`translateX?: number`<br>`translateY?: number`<br>`scale?: number`<br>`scaleX?: number`<br>`scaleY?: number`<br>`rotate?: number`<br>`stroke?: paint`<br>`strokeWidth?: length`<br>`opacity?: number` |
| `path` | primitive | supported | figure, component, canvas | `x?: number`<br>`y?: number`<br>`width?: length`<br>`height?: length`<br>`layer?: number`<br>`clip?: identifier`<br>`mask?: identifier`<br>`translateX?: number`<br>`translateY?: number`<br>`scale?: number`<br>`scaleX?: number`<br>`scaleY?: number`<br>`rotate?: number`<br>`fill?: paint`<br>`stroke?: paint`<br>`strokeWidth?: length`<br>`opacity?: number`<br>`d: string` |
| `image` | primitive | supported | figure, component, canvas | `x?: number`<br>`y?: number`<br>`width?: length`<br>`height?: length`<br>`layer?: number`<br>`clip?: identifier`<br>`mask?: identifier`<br>`translateX?: number`<br>`translateY?: number`<br>`scale?: number`<br>`scaleX?: number`<br>`scaleY?: number`<br>`rotate?: number`<br>`src: string`<br>`alt?: string`<br>`opacity?: number` |
| `icon` | primitive | supported | figure, component, canvas | `x?: number`<br>`y?: number`<br>`width?: length`<br>`height?: length`<br>`layer?: number`<br>`clip?: identifier`<br>`mask?: identifier`<br>`translateX?: number`<br>`translateY?: number`<br>`scale?: number`<br>`scaleX?: number`<br>`scaleY?: number`<br>`rotate?: number`<br>`stroke?: paint`<br>`strokeWidth?: length`<br>`opacity?: number`<br>`name: string (check / document / star / terminal / warning)` |
| `group` | primitive | supported | figure, component, canvas | `x?: number`<br>`y?: number`<br>`width?: length`<br>`height?: length`<br>`layer?: number`<br>`clip?: identifier`<br>`mask?: identifier`<br>`translateX?: number`<br>`translateY?: number`<br>`scale?: number`<br>`scaleX?: number`<br>`scaleY?: number`<br>`rotate?: number`<br>`opacity?: number` |
| `repeat` | primitive | supported | canvas | `x?: number`<br>`y?: number`<br>`width?: length`<br>`height?: length`<br>`layer?: number`<br>`clip?: identifier`<br>`mask?: identifier`<br>`translateX?: number`<br>`translateY?: number`<br>`scale?: number`<br>`scaleX?: number`<br>`scaleY?: number`<br>`rotate?: number`<br>`fill?: paint`<br>`stroke?: paint`<br>`strokeWidth?: length`<br>`opacity?: number`<br>`color?: paint`<br>`fontSize?: length`<br>`fontWeight?: number`<br>`count: number`<br>`kind: string (box / circle / line / path / text / icon)`<br>`stepX?: number`<br>`stepY?: number`<br>`radius?: length`<br>`d?: string`<br>`name?: string (check / document / star / terminal / warning)`<br>`text?: string` |
| `row` | layout | supported | figure, component | `child: identifier`<br>`gap?: length`<br>`width?: length`<br>`height?: length`<br>`align?: string (start / center / end / stretch)`<br>`distribute?: string (start / center / end / between / around)` |
| `column` | layout | supported | figure, component | `child: identifier`<br>`gap?: length`<br>`width?: length`<br>`height?: length`<br>`align?: string (start / center / end / stretch)`<br>`distribute?: string (start / center / end / between / around)` |
| `grid` | layout | supported | figure, component | `child: identifier`<br>`gap?: length`<br>`width?: length`<br>`height?: length`<br>`columns: number`<br>`align?: string (start / center / end / stretch)`<br>`distribute?: string (start / center / end / between / around)` |
| `stack` | layout | supported | figure, component | `child: identifier`<br>`width?: length`<br>`height?: length`<br>`align?: string (start / center / end / stretch)` |
| `overlay` | layout | supported | figure, component | `child: identifier`<br>`width?: length`<br>`height?: length`<br>`align?: string (start / center / end / stretch)` |
| `canvas` | layout | supported | figure, component | `child?: identifier`<br>`width: length`<br>`height: length`<br>`bleed?: length`<br>`clip?: boolean` |
| `connect` | connector | supported | figure, component | `from: identifier`<br>`to: identifier`<br>`label?: string`<br>`variant?: string (directional / bidirectional / async / data)`<br>`tone?: tone (neutral / info / success / warning / danger)`<br>`stroke?: paint`<br>`strokeWidth?: length`<br>`opacity?: number` |
| `align` | constraint | supported | figure, component | `first: identifier`<br>`second: identifier`<br>`target?: identifier`<br>`axis?: string (x / y)`<br>`edge?: string (start / center / end)` |
| `distribute` | constraint | supported | figure, component | `first: identifier`<br>`second: identifier`<br>`third: identifier`<br>`target?: identifier`<br>`axis?: string (x / y)`<br>`gap?: length` |
| `inside` | constraint | supported | figure, component | `child: identifier`<br>`parent: identifier`<br>`padding?: length` |
| `near` | constraint | supported | figure, component | `source: identifier`<br>`target: identifier`<br>`distance?: length` |
| `show` | timeline | supported | timeline | `target: identifier`<br>`target?: identifier` |
| `hide` | timeline | supported | timeline | `target: identifier`<br>`target?: identifier` |
| `focus` | timeline | supported | timeline | `target: identifier`<br>`target?: identifier` |
| `trace` | timeline | supported | timeline | `target: identifier`<br>`target?: identifier` |
| `set` | timeline | supported | timeline | `target: identifier` |
| `morph` | timeline | unsupported | timeline | `from: identifier`<br>`to: identifier` |
| `transition` | transition | supported | timeline | `from: identifier`<br>`to: identifier`<br>`duration?: string (fast / normal / slow)` |
| `person` | component | supported | figure, component | `label?: string`<br>`label?: string`<br>`variant?: string (default / muted / emphasis)`<br>`tone?: tone (neutral / info / success / warning / danger)` |
| `team` | component | supported | figure, component | `label?: string`<br>`label?: string`<br>`variant?: string (default / muted / emphasis)`<br>`tone?: tone (neutral / info / success / warning / danger)` |
| `service` | component | supported | figure, component | `label?: string`<br>`label?: string`<br>`variant?: string (default / muted / emphasis)`<br>`tone?: tone (neutral / info / success / warning / danger)` |
| `api` | component | supported | figure, component | `label?: string`<br>`label?: string`<br>`variant?: string (default / muted / emphasis)`<br>`tone?: tone (neutral / info / success / warning / danger)` |
| `database` | component | supported | figure, component | `label?: string`<br>`label?: string`<br>`variant?: string (default / muted / emphasis)`<br>`tone?: tone (neutral / info / success / warning / danger)` |
| `cache` | component | supported | figure, component | `label?: string`<br>`label?: string`<br>`variant?: string (default / muted / emphasis)`<br>`tone?: tone (neutral / info / success / warning / danger)` |
| `objectStore` | component | supported | figure, component | `label?: string`<br>`label?: string`<br>`variant?: string (default / muted / emphasis)`<br>`tone?: tone (neutral / info / success / warning / danger)` |
| `warehouse` | component | supported | figure, component | `label?: string`<br>`label?: string`<br>`variant?: string (default / muted / emphasis)`<br>`tone?: tone (neutral / info / success / warning / danger)` |
| `queue` | component | supported | figure, component | `label?: string`<br>`label?: string`<br>`variant?: string (default / muted / emphasis)`<br>`tone?: tone (neutral / info / success / warning / danger)` |
| `topic` | component | supported | figure, component | `label?: string`<br>`label?: string`<br>`variant?: string (default / muted / emphasis)`<br>`tone?: tone (neutral / info / success / warning / danger)` |
| `stream` | component | supported | figure, component | `label?: string`<br>`label?: string`<br>`variant?: string (default / muted / emphasis)`<br>`tone?: tone (neutral / info / success / warning / danger)` |
| `event` | component | supported | figure, component | `label?: string`<br>`label?: string`<br>`variant?: string (default / muted / emphasis)`<br>`tone?: tone (neutral / info / success / warning / danger)` |
| `browser` | component | supported | figure, component | `label?: string`<br>`label?: string`<br>`variant?: string (default / muted / emphasis)`<br>`tone?: tone (neutral / info / success / warning / danger)` |
| `mobile` | component | supported | figure, component | `label?: string`<br>`label?: string`<br>`variant?: string (default / muted / emphasis)`<br>`tone?: tone (neutral / info / success / warning / danger)` |
| `terminal` | component | supported | figure, component | `label?: string`<br>`label?: string`<br>`variant?: string (default / muted / emphasis)`<br>`tone?: tone (neutral / info / success / warning / danger)` |
| `server` | component | supported | figure, component | `label?: string`<br>`label?: string`<br>`variant?: string (default / muted / emphasis)`<br>`tone?: tone (neutral / info / success / warning / danger)` |
| `agent` | component | supported | figure, component | `label?: string`<br>`label?: string`<br>`variant?: string (default / muted / emphasis)`<br>`tone?: tone (neutral / info / success / warning / danger)` |
| `model` | component | supported | figure, component | `label?: string`<br>`label?: string`<br>`variant?: string (default / muted / emphasis)`<br>`tone?: tone (neutral / info / success / warning / danger)` |
| `tool` | component | supported | figure, component | `label?: string`<br>`label?: string`<br>`variant?: string (default / muted / emphasis)`<br>`tone?: tone (neutral / info / success / warning / danger)` |
| `worker` | component | supported | figure, component | `label?: string`<br>`label?: string`<br>`variant?: string (default / muted / emphasis)`<br>`tone?: tone (neutral / info / success / warning / danger)` |
| `file` | component | supported | figure, component | `label?: string`<br>`label?: string`<br>`variant?: string (default / muted / emphasis)`<br>`tone?: tone (neutral / info / success / warning / danger)` |
| `document` | component | supported | figure, component | `label?: string`<br>`label?: string`<br>`variant?: string (default / muted / emphasis)`<br>`tone?: tone (neutral / info / success / warning / danger)` |
| `code` | component | supported | figure, component | `label?: string`<br>`label?: string`<br>`variant?: string (default / muted / emphasis)`<br>`tone?: tone (neutral / info / success / warning / danger)` |
| `table` | component | supported | figure, component | `label?: string`<br>`label?: string`<br>`variant?: string (default / muted / emphasis)`<br>`tone?: tone (neutral / info / success / warning / danger)` |
| `note` | component | supported | figure, component | `label?: string`<br>`label?: string`<br>`variant?: string (default / muted / emphasis)`<br>`tone?: tone (neutral / info / success / warning / danger)` |
| `callout` | component | supported | figure, component | `label?: string`<br>`label?: string`<br>`variant?: string (default / muted / emphasis)`<br>`tone?: tone (neutral / info / success / warning / danger)` |
| `badge` | component | supported | figure, component | `label?: string`<br>`label?: string`<br>`variant?: string (default / muted / emphasis)`<br>`tone?: tone (neutral / info / success / warning / danger)` |
| `legend` | component | supported | figure, component | `label?: string`<br>`label?: string`<br>`variant?: string (default / muted / emphasis)`<br>`tone?: tone (neutral / info / success / warning / danger)` |
| `boundary` | component | supported | figure, component | `label?: string`<br>`label?: string`<br>`variant?: string (default / muted / emphasis)`<br>`tone?: tone (neutral / info / success / warning / danger)` |
| `barChart` | component | experimental | figure, component | `label?: string`<br>`label?: string`<br>`variant?: string (default / muted / emphasis)`<br>`tone?: tone (neutral / info / success / warning / danger)` |
| `lineChart` | component | experimental | figure, component | `label?: string`<br>`label?: string`<br>`variant?: string (default / muted / emphasis)`<br>`tone?: tone (neutral / info / success / warning / danger)` |
| `areaChart` | component | experimental | figure, component | `label?: string`<br>`label?: string`<br>`variant?: string (default / muted / emphasis)`<br>`tone?: tone (neutral / info / success / warning / danger)` |
| `progress` | component | experimental | figure, component | `label?: string`<br>`label?: string`<br>`variant?: string (default / muted / emphasis)`<br>`tone?: tone (neutral / info / success / warning / danger)` |

## Semantic tokens

- `color.accent`
- `color.accentSoft`
- `color.background`
- `color.border`
- `color.canvas`
- `color.connector`
- `color.danger`
- `color.info`
- `color.muted`
- `color.success`
- `color.surface`
- `color.surfaceMuted`
- `color.text`
- `color.warning`
- `elevation.low`
- `elevation.none`
- `elevation.raised`
- `motion.fast`
- `motion.normal`
- `motion.slow`
- `radius.lg`
- `radius.md`
- `radius.none`
- `radius.pill`
- `radius.sm`
- `space.lg`
- `space.md`
- `space.sm`
- `space.xl`
- `space.xs`
- `stroke.hairline`
- `stroke.normal`
- `stroke.strong`
- `type.body`
- `type.caption`
- `type.label`
- `type.title`

Chart-oriented components are experimental in the public alpha. Supported technical components follow the compatibility policy documented in Migration.
