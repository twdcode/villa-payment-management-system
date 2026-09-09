/**
 * Stands in for the `server-only` package under the unit test runner.
 *
 * The real package throws when imported outside a Server Component, so any module that
 * guards itself with it cannot be unit tested at all. Aliased in `vitest.config.mts`;
 * application builds still import the genuine package and keep the guarantee.
 */
export {};
