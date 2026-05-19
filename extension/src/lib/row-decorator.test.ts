// Unit tests for decorateRows — focused on the row-container detection guard
// that prevents badges from leaking into Torn's non-list chrome (the left-side
// "Information" sidebar on hospitalview.php, the header bar, etc).
//
// The interesting axis is `findRowContainer`: anchors must live inside an
// <li>/<tr> or a class-matched list row (`bounty|user-info-list|user-row|
// listed-row|members-list|honor-list|hospital|jail|retal`). Anchors mounted in
// a generic <div> ancestor — like the Information panel name plate — should be
// skipped, not decorated with anchor.parentElement as a fallback.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { decorateRows } from './row-decorator';

interface Marker { tag: string }

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

afterEach(() => {
  // Tear down any per-test <style> tags written by ensureStyles.
  document
    .querySelectorAll('style[id^="tm-companion-"]')
    .forEach((s) => s.remove());
});

const ATTR = (id: string): string => `data-tm-${id}-badge`;

async function run(
  featureId: string,
  data: Map<number, Marker>,
  styles?: string,
): Promise<void> {
  await decorateRows<Marker>({
    featureId,
    // Match the selector that hospital + jail overlays already use in
    // production. The default `a[href*="profiles.php?XID="]` is more specific
    // but the `?` character interacts oddly with happy-dom's attribute parser
    // — using the simpler form keeps the tests focused on scoping behaviour.
    anchorSelector: 'a[href*="XID="]',
    buildMap: async () => data,
    styles,
    render: ({ appendBadge, data: d }) => {
      const span = document.createElement('span');
      span.textContent = d.tag;
      appendBadge(span);
    },
  });
}

describe('decorateRows — row scoping', () => {
  it('decorates an anchor inside an <li>', async () => {
    document.body.innerHTML = `
      <div id="mainContainer">
        <ul>
          <li><a href="/profiles.php?XID=1">P1</a></li>
        </ul>
      </div>
    `;
    await run('test1', new Map([[1, { tag: 'ok' }]]));
    expect(document.querySelectorAll(`[${ATTR('test1')}]`).length).toBe(1);
  });

  it('decorates an anchor inside a <tr>', async () => {
    document.body.innerHTML = `
      <div id="mainContainer">
        <table><tbody>
          <tr><td><a href="/profiles.php?XID=2">P2</a></td></tr>
        </tbody></table>
      </div>
    `;
    await run('test2', new Map([[2, { tag: 'ok' }]]));
    expect(document.querySelectorAll(`[${ATTR('test2')}]`).length).toBe(1);
  });

  it('decorates an anchor inside a class-matched container (hospital)', async () => {
    document.body.innerHTML = `
      <div id="mainContainer">
        <div class="hospital-row"><a href="/profiles.php?XID=3">P3</a></div>
      </div>
    `;
    await run('test3', new Map([[3, { tag: 'ok' }]]));
    expect(document.querySelectorAll(`[${ATTR('test3')}]`).length).toBe(1);
  });

  it('does NOT decorate an anchor whose only ancestor is a generic <div>', async () => {
    // This mirrors the Information panel on hospitalview.php — the viewer's
    // own profile link, inside a <div class="info-cont"> with NO <li>/<tr>
    // and no class matching ROW_CLASS_PATTERN. The pre-fix decorator fell
    // back to anchor.parentElement and painted the sidebar.
    document.body.innerHTML = `
      <div id="mainContainer">
        <div class="info-cont">
          <div class="user-info-cont">
            <a href="/profiles.php?XID=4">P4</a>
          </div>
        </div>
      </div>
    `;
    await run('test4', new Map([[4, { tag: 'leak' }]]));
    expect(document.querySelectorAll(`[${ATTR('test4')}]`).length).toBe(0);
  });

  it('decorates only the list-row anchor when an XID anchor also exists in a generic <div> sibling', async () => {
    // Both anchors point at the same player. The list-row one should get the
    // badge; the sidebar one should be ignored.
    document.body.innerHTML = `
      <div id="mainContainer">
        <div class="info-cont"><a href="/profiles.php?XID=5">P5 sidebar</a></div>
        <ul>
          <li><a href="/profiles.php?XID=5">P5 row</a></li>
        </ul>
      </div>
    `;
    await run('test5', new Map([[5, { tag: 'ok' }]]));
    const badges = document.querySelectorAll(`[${ATTR('test5')}]`);
    expect(badges.length).toBe(1);
    // Badge sits next to the LI anchor, not the sidebar anchor.
    const sidebarAnchor = document.querySelector('.info-cont a') as HTMLElement;
    expect(sidebarAnchor.nextElementSibling).toBeNull();
  });

  it('skips anchors outside #mainContainer entirely (existing scope guard)', async () => {
    // Header / global sidebar lives outside mainContainer on Torn — those
    // anchors should never get decorated even if they ARE inside an <li>.
    document.body.innerHTML = `
      <div id="header">
        <ul><li><a href="/profiles.php?XID=6">P6 header</a></li></ul>
      </div>
      <div id="mainContainer"></div>
    `;
    await run('test6', new Map([[6, { tag: 'header-leak' }]]));
    expect(document.querySelectorAll(`[${ATTR('test6')}]`).length).toBe(0);
  });
});
