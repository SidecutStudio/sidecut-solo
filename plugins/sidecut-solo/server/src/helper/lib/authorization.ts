// Resolves existing task permissions; no provider calls, stored grants or config additions.
import { MERGE_POLICIES } from './config.ts';

export const PUBLICATION_EFFECTS = ['none', 'automatic', 'unknown'] as const;
export const HOST_SCOPES = ['allowed', 'approval_required', 'unknown'] as const;

export type AuthorizationInput = {
  userMerge: boolean;
  userPublication: boolean;
  publicationEffect: string;
  hostScope: string;
};

/** Inputs assert inspected config/task evidence; the result does not grant host access. */
export function resolveAuthorization(mergePolicy: string, input: AuthorizationInput) {
  const { userMerge, userPublication, publicationEffect, hostScope } = input;
  for (const [value, choices] of [
    [mergePolicy, MERGE_POLICIES],
    [publicationEffect, PUBLICATION_EFFECTS],
    [hostScope, HOST_SCOPES],
  ] as const) {
    if (!(choices as readonly string[]).includes(value)) {
      throw new Error(`Invalid authorization input: ${value}`);
    }
  }
  const mergeAuthorized = mergePolicy !== 'never' && (userMerge || mergePolicy === 'when-green');
  const missing: string[] = [];
  if (!mergeAuthorized && mergePolicy !== 'never') missing.push('merge');
  if (publicationEffect === 'automatic' && !userPublication) missing.push('publication');
  const unresolved: string[] = [];
  if (publicationEffect === 'unknown') {
    unresolved.push('Inspect what merging triggers before proceeding');
  }
  if (hostScope === 'unknown') {
    unresolved.push('Host permission scope is unknown; use the native tool approval flow');
  }
  return {
    merge_authorized: mergeAuthorized,
    publication_authorized: userPublication,
    missing_user_authorizations: missing,
    merge_vetoed: mergePolicy === 'never',
    publication_effect: publicationEffect,
    host_scope: hostScope,
    host_approval_required: hostScope === 'approval_required',
    unresolved,
    ready:
      mergeAuthorized &&
      !missing.length &&
      publicationEffect !== 'unknown' &&
      hostScope === 'allowed',
  };
}
