/**
 * Typed domain errors. Actions catch infrastructure failures (Supabase, RPC)
 * and wrap them here so callers/UI can distinguish "the database is down"
 * from "the numbers violate a business rule" instead of matching on strings.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** A read from Supabase/an RPC failed. */
export class DataFetchError extends DomainError {
  readonly code = 'DATA_FETCH_FAILED';

  constructor(resource: string, cause: unknown) {
    super(`Failed to fetch ${resource}: ${causeMessage(cause)}`, { cause });
  }
}

/** A write to Supabase/an RPC failed. */
export class DataWriteError extends DomainError {
  readonly code = 'DATA_WRITE_FAILED';

  constructor(resource: string, cause: unknown) {
    super(`Failed to write ${resource}: ${causeMessage(cause)}`, { cause });
  }
}

/**
 * Data crossing into the domain boundary violates one of the accounting
 * invariants in PROJECT_RULES.md (e.g. the five-tier financial model).
 * This should never happen with valid input - it means either corrupted
 * data or a bug upstream, so it fails fast rather than silently computing
 * a wrong balance.
 */
export class InvariantViolationError extends DomainError {
  readonly code = 'INVARIANT_VIOLATION';
}

function causeMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
