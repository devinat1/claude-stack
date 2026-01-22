
## Frontend
### JSX Elements
- Always use `<div>` and `<span>`, never semantic HTML (`<p>`, `<h1>`, etc.). This prevents style inheritance issues.

### Styling
- Tailwind classes only - no inline styles or style objects
- No negative margins allowed
- Use spacing/gap on parent instead of margins on child throughout.
- Spacing: multiples of 2 (gap-2, gap-4, p-4, m-8)
- Remove redundant responsive breakpoints
- avoid not-null assertions.

```tsx
// Good
<div className="flex gap-4">
  <Child1 />
  <Child2 />
</div>

// Bad
<div className="flex" style={{ gap: '12px' }}>
  <Child1 className="mr-3" />
</div>
```

### Component Patterns
- Extract repeated JSX into components
- Inline conditional placeholders to avoid duplicate wrappers
- Use ternary operators for conditionals, rather than `&&`

### Props & Constants
- Remove unused props
- Use constants for magic values that need explanation
- Add `TODO(cleanup):` for temporary code

## General
### Structure
- Do not ever create your own function if it already exists in the codebase!
- To get the owner of a meeting, use join of usermeetings and Meeting. Prefer this to using creatorId
- Avoid unnecessary comments. Only add them where absolutely necessary.
- All types that are not schemas or derived from schemas should be in `types/src/email.ts`

### TypeScript
- We should avoid .then and .catch. Consider using try/catch instead.
- It is generally considered a bad pattern to cast types. Avoid unless necessary.
- Always use named params, instead of positional arguments
- Avoid non null assertions, i.e: `const transcript = meeting.transcript!`. Instead, cast always like so: ` const transcript = meeting.transcript as NonNullable<typeof meeting.transcript>`
- If we need to export the type, they should be in the types package.
- Don't use`let` in the code base. Prefer const always.
- Explicit nullable types: `value?: number | null`
- Array syntax: `items: Item[]` not `Array<Item>`
- Array checks: `arr.length === 0` not `!arr`
- Avoid mutations
- Do not await the prisma db calls
- Use strong types where possible, i.e. Array\<MeetingWithForeignProperties\>
- null is when you asked the db and nothing was returned, whereas undefined is user level, such as when you get the
- We usually don't have fetch inside a component. We use a helper for this.

### Naming
- Use complete variable names, i.e. do `averageWordsPerMinute` instead of `averageWpm`
- Complete sentence errors/comments/logs.
- Booleans: `isOpen`, `hasData`, `shouldShow` (not `showModal`)
- Parameters: descriptive (`specificUserId` not `userId`)
- Types: match UI terminology
- When logging, everything should be a sentence (end with a period)

### Functional Programming
- Use `Array.from()`, `.map()`, `.reduce()` instead of for-loops
- Use utility functions: `getPluralSuffix()`, `.toLocaleString()`

### Lodash
- Use lodash where applicable. For example, the mean utility, and sum

### Common Circleback Utils

```
import {
  getFullName,
  getTimeRangeStartDate,
  isPresent,
} from '@circleback/utils'
```
