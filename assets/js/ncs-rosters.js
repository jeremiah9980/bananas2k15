/* ───────────────────────────────────────────────────────────────────────────
 * NCS 12U Central Texas — Roster dataset
 *
 * Team list is seeded from the live NCS Monitor roster-change feed that posts
 * to #bananas-coaches (the 12U Central Texas teams we track to scout talent in
 * surrounding areas). City / org metadata is real; the per-player rows are
 * deterministic SAMPLE data generated client-side so the portal is fully
 * functional before the live NCS roster feed is wired in.
 *
 * To replace sample rosters with live data, drop real player arrays onto the
 * matching team's `roster` field (see shape below) — the portal renders
 * whatever is provided and clears the SAMPLE banner when every selected team
 * is `sample: false`.
 *
 * Player shape:
 *   { num: '12', name: 'Last, First', pos: 'SS', bats: 'R', throws: 'R', grad: 2032 }
 * ─────────────────────────────────────────────────────────────────────────── */

(function (global) {
  'use strict';

  // 12U Central Texas teams currently tracked by the NCS Monitor.
  const TEAMS = [
    { id: 'pfreeze',         name: 'Pfreeze',                              org: 'Pfreeze Fastpitch',      city: 'Pflugerville', state: 'TX' },
    { id: '12u-canes',       name: '12U Canes',                            org: 'Canes Softball',         city: 'Leander',      state: 'TX' },
    { id: 'american-freedom', name: 'American Freedom CTX – Morales',       org: 'American Freedom',       city: 'Austin',       state: 'TX' },
    { id: 'austin-crush',    name: 'Austin Crush 12U',                     org: 'Austin Crush',           city: 'Austin',       state: 'TX' },
    { id: 'bybc-starfire',   name: 'BYBC Starfire – Ochoa',                org: 'BYBC Starfire',          city: 'Hutto',        state: 'TX' },
    { id: 'corespeed',       name: 'Corespeed',                            org: 'Corespeed Fastpitch',    city: 'Liberty Hill', state: 'TX' },
    { id: 'illusions-gold',  name: 'Illusions Gold CTX 12U – Roberts',     org: 'Illusions Gold',         city: 'Cedar Park',   state: 'TX' },
    { id: 'tx-premier',      name: 'Texas Premier 12U',                    org: 'Texas Premier',          city: 'Austin',       state: 'TX' },
    { id: 'tx-united',       name: 'Texas United 12U – Heirigs',           org: 'Texas United',           city: 'Manor',        state: 'TX' },
    { id: 'velocity',        name: 'Velocity Fastpitch',                   org: 'Velocity Fastpitch',     city: 'Belton',       state: 'TX' }
  ];

  // ── Deterministic sample-roster generator ──────────────────────────────────
  // Stable per team (seeded by team id) so rosters don't reshuffle on reload.

  const FIRST = ['Ava','Olivia','Emma','Sophia','Isabella','Mia','Charlotte','Amelia',
    'Harper','Evelyn','Abigail','Ella','Scarlett','Grace','Lily','Aria','Zoe','Layla',
    'Riley','Nora','Hailey','Kennedy','Brooklyn','Savannah','Paisley','Skylar','Addison',
    'Emery','Reagan','Presley'];
  const LAST = ['Morales','Ochoa','Roberts','Heirigs','Garcia','Martinez','Reyes','Flores',
    'Nguyen','Carter','Brooks','Hayes','Sullivan','Bennett','Ramsey','Coleman','Frazier',
    'Vance','Dalton','Maddox','Whitaker','Solis','Cabrera','Pruitt','Stokes','Ellison'];
  const POS = ['P','C','1B','2B','3B','SS','LF','CF','RF','UTIL'];
  const HAND = ['R','L','S'];

  function makeRng(seedStr) {
    // xfnv1a hash → mulberry32 PRNG
    let h = 2166136261 >>> 0;
    for (let i = 0; i < seedStr.length; i++) {
      h ^= seedStr.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return function () {
      h |= 0; h = (h + 0x6D2B79F5) | 0;
      let t = Math.imul(h ^ (h >>> 15), 1 | h);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }

  function buildRoster(team) {
    const rng = makeRng(team.id);
    const size = 11 + Math.floor(rng() * 3);            // 11–13 players
    const nums = new Set();
    const usedNames = new Set();
    const roster = [];

    for (let i = 0; i < size; i++) {
      let num;
      do { num = 1 + Math.floor(rng() * 44); } while (nums.has(num));
      nums.add(num);

      let first, last, full;
      do {
        first = pick(rng, FIRST);
        last  = pick(rng, LAST);
        full  = `${last}, ${first}`;
      } while (usedNames.has(full));
      usedNames.add(full);

      const bats   = rng() < 0.78 ? 'R' : pick(rng, HAND);
      const throws = rng() < 0.92 ? 'R' : 'L';
      const grad   = rng() < 0.5 ? 2031 : 2032;          // 12U → 2031/2032 grads

      roster.push({
        num: String(num),
        name: full,
        pos: pick(rng, POS),
        bats,
        throws,
        grad
      });
    }

    // Sort by jersey number for a stable, readable default.
    roster.sort((a, b) => Number(a.num) - Number(b.num));
    return roster;
  }

  const teams = TEAMS.map(t => ({
    ...t,
    age: '12U',
    sample: true,                 // flip to false once live NCS data is attached
    roster: buildRoster(t)
  }));

  global.NCS_DATA = {
    season: '2026',
    division: '12U',
    region: 'Central Texas',
    teams
  };

})(window);
