import type { Unit, Word } from "@sukhan/core";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { fetchCurriculum, fetchWordsByCategory } from "../lib/api.js";

/**
 * Server state.
 *
 * The original loaded both datasets in a single `useEffect` that awaited them
 * one after the other, wrote `null` into state on failure, and logged the error
 * to the console — so a network problem rendered as a permanently empty home
 * screen with no explanation and no way to retry.
 *
 * React Query gives loading, error, and retry semantics for free, caches
 * between route changes, and — because these are two independent queries rather
 * than two sequential awaits — fetches them concurrently.
 */

export const queryKeys = {
  curriculum: ["curriculum"] as const,
  wordsByCategory: ["words", "byCategory"] as const,
};

export function useCurriculum(): UseQueryResult<Unit[], Error> {
  return useQuery({
    queryKey: queryKeys.curriculum,
    queryFn: fetchCurriculum,
    // Curriculum content changes when the author edits it, not while a learner
    // is studying. An hour of freshness is generous and avoids refetching on
    // every navigation.
    staleTime: 60 * 60 * 1000,
  });
}

export function useWordsByCategory(): UseQueryResult<Record<string, Word[]>, Error> {
  return useQuery({
    queryKey: queryKeys.wordsByCategory,
    queryFn: fetchWordsByCategory,
    staleTime: 60 * 60 * 1000,
  });
}

/** Find a unit by its route parameter, from already-fetched curriculum. */
export function findUnit(units: readonly Unit[] | undefined, unitId: string | undefined): Unit | undefined {
  if (units === undefined || unitId === undefined) return undefined;
  return units.find((unit) => unit.id === unitId);
}
