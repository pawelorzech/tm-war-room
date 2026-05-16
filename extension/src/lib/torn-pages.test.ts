import { describe, it, expect } from 'vitest';
import { matchPage } from './torn-pages';

const u = (href: string): URL => new URL(href, 'https://www.torn.com');

describe('matchPage — characterization tests (Sprint 0 baseline)', () => {
  describe('profile pages', () => {
    it('matches /profile.php?XID=', () => {
      expect(matchPage(u('/profile.php?XID=123'))).toEqual({ kind: 'profile', player_id: 123 });
    });
    it('matches /profiles.php?XID= (older URL form)', () => {
      expect(matchPage(u('/profiles.php?XID=999'))).toEqual({ kind: 'profile', player_id: 999 });
    });
    it('accepts lowercase xid parameter', () => {
      expect(matchPage(u('/profile.php?xid=42'))).toEqual({ kind: 'profile', player_id: 42 });
    });
    it('returns null player_id when XID is missing', () => {
      expect(matchPage(u('/profile.php'))).toEqual({ kind: 'profile', player_id: null });
    });
    it('is case-insensitive on the pathname', () => {
      expect(matchPage(u('/Profile.php?XID=7'))).toEqual({ kind: 'profile', player_id: 7 });
    });
  });

  describe('attack pages', () => {
    it('matches /page.php?sid=attack&user2ID= (current router)', () => {
      expect(matchPage(u('/page.php?sid=attack&user2ID=500'))).toEqual({
        kind: 'attack',
        player_id: 500,
      });
    });
    it('matches /loader.php?sid=attack&user2ID= (legacy router)', () => {
      expect(matchPage(u('/loader.php?sid=attack&user2ID=600'))).toEqual({
        kind: 'attack',
        player_id: 600,
      });
    });
    it('matches sid=getInAttack alias', () => {
      expect(matchPage(u('/page.php?sid=getInAttack&user2ID=7'))).toEqual({
        kind: 'attack',
        player_id: 7,
      });
    });
    it('returns null player_id when user2ID is missing', () => {
      expect(matchPage(u('/page.php?sid=attack'))).toEqual({ kind: 'attack', player_id: null });
    });
  });

  describe('page.php sid routes', () => {
    it.each([
      ['bounties', 'bounties'],
      ['stocks', 'stocks'],
      ['hospitalView', 'hospital'],
      ['hospital', 'hospital'],
      ['imarket', 'imarket'],
      ['iMarket', 'imarket'],
      ['jailView', 'jail'],
      ['jail', 'jail'],
    ] as const)('sid=%s → kind=%s', (sid, kind) => {
      expect(matchPage(u(`/page.php?sid=${sid}`))).toEqual({ kind, player_id: null });
    });
  });

  describe('direct .php paths', () => {
    it.each([
      ['/bounties.php', 'bounties'],
      ['/hospitalview.php', 'hospital'],
      ['/imarket.php', 'imarket'],
      ['/jailview.php', 'jail'],
      ['/halloffame.php', 'halloffame'],
      ['/travelagency.php', 'travel'],
    ] as const)('%s → %s', (path, kind) => {
      expect(matchPage(u(path))).toEqual({ kind, player_id: null });
    });
  });

  describe('travel router alias', () => {
    it('matches /index.php?page=travel', () => {
      expect(matchPage(u('/index.php?page=travel'))).toEqual({ kind: 'travel', player_id: null });
    });
    it('does NOT match /index.php without travel page param', () => {
      expect(matchPage(u('/index.php'))).toEqual({ kind: 'unknown', player_id: null });
    });
  });

  describe('ambient decorator pages', () => {
    it.each(['/messages.php', '/forums.php', '/friendlist.php', '/searchresults.php'])(
      '%s → ambient',
      (path) => {
        expect(matchPage(u(path))).toEqual({ kind: 'ambient', player_id: null });
      },
    );
  });

  describe('faction profile + sub-routes', () => {
    it('matches /factions.php?step=profile&ID=', () => {
      expect(matchPage(u('/factions.php?step=profile&ID=11559'))).toEqual({
        kind: 'faction',
        player_id: null,
        faction_id: 11559,
      });
    });
    it('matches lowercase id parameter', () => {
      expect(matchPage(u('/factions.php?step=profile&id=42'))).toEqual({
        kind: 'faction',
        player_id: null,
        faction_id: 42,
      });
    });
    it('rejects non-numeric faction id', () => {
      expect(matchPage(u('/factions.php?step=profile&ID=abc'))).toEqual({
        kind: 'unknown',
        player_id: null,
      });
    });
    it('matches step=armoury', () => {
      expect(matchPage(u('/factions.php?step=armoury'))).toEqual({
        kind: 'armoury',
        player_id: null,
      });
    });
    it('matches step=your&type=1 (armoury legacy)', () => {
      expect(matchPage(u('/factions.php?step=your&type=1'))).toEqual({
        kind: 'armoury',
        player_id: null,
      });
    });
    it.each([
      ['retals', 'retals'],
      ['retaliations', 'retals'],
      ['crimes', 'oc'],
      ['oc', 'oc'],
    ] as const)('step=%s → %s', (step, kind) => {
      expect(matchPage(u(`/factions.php?step=${step}`))).toEqual({ kind, player_id: null });
    });
  });

  describe('unknown fallback', () => {
    it.each(['/', '/some-random-page', '/items.php', '/gym.php'])(
      '%s → unknown',
      (path) => {
        expect(matchPage(u(path))).toEqual({ kind: 'unknown', player_id: null });
      },
    );
  });
});
