---
trigger: manual
---

# STRICT FRONTEND & REACT GENERATION RULES

You must strictly adhere to the following constraints when generating or refactoring React/TypeScript code. Violations are unacceptable.

## 1. File Architecture & Directory Structure
* **Max File Length:** Strictly maximum **200 lines** per file. Split larger components into sub-components:
  * Single-use sub-components: place in the same folder next to the parent.
  * Reusable sub-components: place in a dedicated folder.
* **Dedicated Folders:**
  * Constants: `consts/`
  * Custom Hooks: `hooks/use<Name>.hook.ts`
  * Context Providers: `providers/`
  * Utilities: `utils/`
  * Non-Prop Types/Interfaces: `types/`
* **API Layer (`src/api/`):** Strictly split into 3 layers (NEVER inline endpoints into the client):
  1. **Axios Instance:** Dedicated file configuring `axios` with the `.env` base URL.
  2. **Domain Modules (`<domain>.api.ts`):** Separate file per domain exporting endpoint methods (e.g., `settings.api.ts`).
  3. **Aggregator (`apiClient`):** Dedicated file importing all `*.api.ts` modules and exporting a single `apiClient` object (usage: `await apiClient.llm.chat()`).

## 2. React Components & JSX Rules
* **Component Declaration:** Declare components as arrow functions with a bottom default export (`const Comp = () => {}; export default Comp;`).
* **Named React Imports Only:** NEVER import the full `React` namespace (`import React from 'react'`). Import ONLY required hooks/types directly (`import { useState, useEffect } from 'react'`).
* **No Inline Event Handlers:** Extract all event handler logic into dedicated functions declared at the top of the component (before the `return` statement).
* **No Inline Computed JSX Attributes:** Extract ternary expressions or computed values for JSX attributes (e.g., `aria-current={activeProjectId === project.id ? 'page' : undefined}`) into dedicated variables declared at the top of the component.

## 3. Custom Hooks (`hooks/use<Name>.hook.ts`)
* **Extraction Threshold:** Extract state logic into a custom hook whenever a component has:
  * More than 4 `useState` calls, **OR**
  * 2+ `useState` calls combined with 2+ `useEffect` calls.
* **Hook Typing:** Directly above the hook definition, declare:
  * `type ReturnProps = { ... }` (mandatory).
  * `type HookProps = { ... }` (**omit completely** if the hook accepts no arguments).

## 4. TypeScript & Typing Constraints
* **Component Props:** Define `type <ComponentName>Props = { ... }`. If a component accepts no props, **omit the props type completely** (NEVER use `{}` or `Record<string, never/unknown>`).
* **Externalize Non-Prop Types:** Move all types and interfaces that do not represent component `Props` or hook `HookProps`/`ReturnProps` into dedicated files inside the `types/` folder.
* **No `FormEvent`:** NEVER import or use `FormEvent`.
* **No `void` Operator:** NEVER use the `void` keyword before function or promise calls (e.g., forbidden: `void Promise.all(...)`, `onClick={() => void testConnection()}`).

## 5. Code Formatting & Control Flow
* **Mandatory Braces:** Always wrap `if`, `else`, `for`, and `while` bodies in curly braces `{ ... }`, even for single-line statements.
* **Vertical Whitespace (Blank Lines):** Always insert an empty line between logical blocks: variable declarations, function/state calls, `if/else` blocks, and `return` statements.
  ```ts
  if (!/\.(mp3|wav)$/i.test(file.name)) {
    setError('Choose an MP3 or WAV audio file.');

    if (inputRef.current) {
      inputRef.current.value = '';
    }

    return;
  }

  setUploading(true);
  setError(null);