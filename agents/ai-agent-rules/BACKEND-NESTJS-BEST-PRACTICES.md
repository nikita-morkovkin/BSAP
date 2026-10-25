---
trigger: manual
---

# STRICT CODE GENERATION RULES

You must strictly adhere to the following constraints when generating or refactoring code. Violations are unacceptable.

## 1. File Architecture & Naming

- **Single Entity Rule:** Place strictly 1 entity (class, type, interface, const, function) per file.
- **Directory Paths:**
  - DTOs: `<module>/dto/<name>.dto.ts`
  - Constants: `<module>/consts/<name>.const.ts`
  - Types: `<module>/types/<name>.type.ts`
  - Schemas: `schemas/<name>.schema.ts`
  - Prompts: `prompts/<name>.prompt.ts`
  - Utils (module-scoped): `<module>/utils/<name>.util.ts`
  - Utils (shared across modules): `utils/<name>.util.ts`
- **Barrel Exports:** Create an `index.ts` barrel file in any `dto`, `consts`, `schemas`, `prompts`, or `utils` folder containing **3 or more** files.

## 2. TypeScript, Imports & DI

- **No Double Assertions:** NEVER use `as unknown as Type`.
- **Named Prisma Imports:** NEVER import the full `Prisma` namespace (e.g., `Prisma.TransactionClient`). Import ONLY specific required types/members directly from `@prisma/client`.
- **Standard DI Only:** Inject full service classes directly via constructor (e.g., `private readonly prisma: PrismaService`). NEVER use `@Inject()` with partial type subsets like `Pick<PrismaService, ...>`.

## 3. Class Structure & Formatting

- **Explicit Visibility:** Always add the `public` modifier to all public methods.
- **Strict Member Ordering:** Order class members strictly as follows:
  1. `constructor`
  2. `public async` methods
  3. `public` sync methods
  4. `private async` methods
  5. `private` sync methods
- **Mandatory Braces:** Always wrap `if`, `else`, `for`, and `while` bodies in curly braces `{ ... }`, even for single-line statements. Never write single-line braceless conditions.
- **Vertical Whitespace (Blank Lines):** Always insert an empty line between logical blocks: variable declarations, function/method calls, `if/else` blocks, and `return` statements.

  ```ts
  const user = await this.prismaService.user.findUnique({
    where: { id: payload.sub },
  });

  if (!user) {
    throw new UnauthorizedException("User account no longer exists");
  }

  return this.toAuthUser(user);
  ```
