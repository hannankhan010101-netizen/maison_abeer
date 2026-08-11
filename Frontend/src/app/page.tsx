import { RoleRouter } from '@/components/RoleRouter';

/**
 * The landing route.
 *
 * The app now has two audiences with two different homes, and middleware
 * cannot tell them apart — the role lives in the database, and querying it on
 * every edge request is the wrong trade. So this asks once and forwards.
 *
 * Replaces the component gallery that stood here from the first pass, whose
 * own docstring said it should go once the real screens landed.
 */

export default function Page() {
  return <RoleRouter />;
}
