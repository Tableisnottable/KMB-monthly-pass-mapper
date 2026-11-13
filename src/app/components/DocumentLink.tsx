import type { ComponentProps } from 'react';
/** Static pages navigate as documents, without requiring a Next.js server. */
export function DocumentLink(props: ComponentProps<'a'>) { return <a {...props} />; }
