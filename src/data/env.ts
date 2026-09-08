export interface DataConfig {
  readonly supabaseUrl: string | null
  readonly supabaseAnonKey: string | null
}

const clean = (value: string | undefined): string | null => {
  const trimmed = value?.trim() ?? ''
  return trimmed === '' ? null : trimmed
}

/**
 * Whether Supabase is configured for the browser.
 *
 * Only `VITE_`-prefixed variables reach the browser, and that prefix is a security
 * boundary rather than a naming convention: Vite inlines those values into the shipped
 * bundle verbatim. The Supabase *anon* key is designed to be public and is safe there.
 * `SUPABASE_DIRECT_CONNECTION_STRING` carries the database password and `GROQ_API_KEY` is
 * a paid credential -- neither may ever gain the prefix (§10, constraint 1).
 */
export function readDataConfig(
  env: Record<string, string | undefined> = import.meta.env as unknown as Record<
    string,
    string | undefined
  >,
): DataConfig {
  const supabaseUrl = clean(env.VITE_SUPABASE_URL)
  const supabaseAnonKey = clean(env.VITE_SUPABASE_ANON_KEY)

  // Half a configuration is a misconfiguration. Running on one value would build a
  // client that fails at its first request rather than at startup, which is a much
  // harder failure to place -- so both or neither.
  if (supabaseUrl === null || supabaseAnonKey === null) {
    return { supabaseUrl: null, supabaseAnonKey: null }
  }

  return { supabaseUrl, supabaseAnonKey }
}
