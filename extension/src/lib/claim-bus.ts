// Tab-scoped in-memory state bus for active hit claims.
//
// Many button instances (hospital list rows, attack page, profile) need to
// react to the same SSE / poll events. Rather than each one running its
// own poll, we centralize:
//
//   - one streamClaims() loop publishes here (started by claim-banner)
//   - every button subscribes here and reads getActiveClaim(targetId)
//
// Decision: a single EventTarget + a Map<target_id, ClaimRow> beats letting
// each button poll because the Torn hospital list often has 50+ rows.

import type { ClaimRow } from '../types';

const _active = new Map<number, ClaimRow>();
const _emitter = new EventTarget();

export const CLAIM_BUS_EVENT = 'tm-hub-claim-bus';

export interface ClaimBusDetail {
  kind: 'snapshot' | 'created' | 'released' | 'hit' | 'expired';
  target_id?: number;
  claim?: ClaimRow;
}

export function getActiveClaim(targetId: number): ClaimRow | undefined {
  return _active.get(targetId);
}

export function getAllActiveClaims(): ClaimRow[] {
  return Array.from(_active.values());
}

/**
 * Replace the entire active set (called by the snapshot / initial fetch).
 */
export function setSnapshot(claims: ClaimRow[]): void {
  _active.clear();
  for (const c of claims) _active.set(c.target_id, c);
  dispatch({ kind: 'snapshot' });
}

export function applyCreated(claim: ClaimRow): void {
  _active.set(claim.target_id, claim);
  dispatch({ kind: 'created', target_id: claim.target_id, claim });
}

export function applyReleased(claim: ClaimRow): void {
  _active.delete(claim.target_id);
  dispatch({ kind: 'released', target_id: claim.target_id, claim });
}

export function applyHit(claim: ClaimRow): void {
  _active.delete(claim.target_id);
  dispatch({ kind: 'hit', target_id: claim.target_id, claim });
}

export function applyExpired(claim: ClaimRow): void {
  _active.delete(claim.target_id);
  dispatch({ kind: 'expired', target_id: claim.target_id, claim });
}

export function subscribe(handler: (d: ClaimBusDetail) => void): () => void {
  const wrapped = (e: Event) => handler((e as CustomEvent<ClaimBusDetail>).detail);
  _emitter.addEventListener(CLAIM_BUS_EVENT, wrapped);
  return () => _emitter.removeEventListener(CLAIM_BUS_EVENT, wrapped);
}

function dispatch(detail: ClaimBusDetail): void {
  _emitter.dispatchEvent(new CustomEvent<ClaimBusDetail>(CLAIM_BUS_EVENT, { detail }));
}
