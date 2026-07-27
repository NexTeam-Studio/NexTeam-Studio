import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { NexOpsCreateMenu } from "../src/features/nexopsShell/components/NexOpsCreateMenu.tsx";
import {
  getMobileCreateFabScrollIntent,
  mobileFabCanFitViewport,
  mobileFabShouldHideOverlays,
  mobileFabVisibleForViewport,
  NEXOPS_SHARED_CREATE_MENU_ID,
  NexOpsMobileCreateFab,
  shouldPulseMobileCreateFab
} from "../src/features/nexopsShell/components/NexOpsMobileCreateFab.tsx";
import { isDismissKey } from "../src/features/nexopsShell/domain/nexopsNavigation.ts";

test("mobile create fab renders only at the mobile breakpoint", () => {
  assert.equal(mobileFabVisibleForViewport(880), true);
  assert.equal(mobileFabVisibleForViewport(881), false);
});

test("mobile create fab points at the shared create menu component", () => {
  const fabHtml = renderToStaticMarkup(
    React.createElement(NexOpsMobileCreateFab, {
      collapsed: false,
      expanded: false,
      onClick: () => {}
    })
  );
  const menuHtml = renderToStaticMarkup(
    React.createElement(NexOpsCreateMenu, {
      presentation: "sheet",
      activeContextLabel: "Open the next creation rail from anywhere in NexOps.",
      onClose: () => {},
      onSelect: () => {}
    })
  );
  assert.match(fabHtml, new RegExp(`aria-controls="${NEXOPS_SHARED_CREATE_MENU_ID}"`));
  assert.match(menuHtml, new RegExp(`id="${NEXOPS_SHARED_CREATE_MENU_ID}"`));
});

test("mobile create fab stays within common phone viewport widths", () => {
  assert.equal(mobileFabCanFitViewport(320), true);
  assert.equal(mobileFabCanFitViewport(390), true);
  assert.equal(mobileFabCanFitViewport(430), true);
  assert.equal(mobileFabCanFitViewport(280), false);
});

test("mobile create fab collapses on downward scroll and expands on upward return", () => {
  assert.equal(getMobileCreateFabScrollIntent(40, 64), "collapse");
  assert.equal(getMobileCreateFabScrollIntent(92, 68), "expand");
  assert.equal(getMobileCreateFabScrollIntent(16, 20), "expand");
  assert.equal(getMobileCreateFabScrollIntent(120, 126), "none");
});

test("mobile create fab pulse fires once per fresh storage marker", () => {
  assert.equal(shouldPulseMobileCreateFab(null), true);
  assert.equal(shouldPulseMobileCreateFab("seen"), false);
});

test("mobile create fab hides behind active overlays and keeps shared dismissal rules", () => {
  assert.equal(mobileFabShouldHideOverlays({ mobileNavOpen: true, notificationsOpen: false, moduleSwitcherOpen: false }), true);
  assert.equal(mobileFabShouldHideOverlays({ mobileNavOpen: false, notificationsOpen: true, moduleSwitcherOpen: false }), true);
  assert.equal(mobileFabShouldHideOverlays({ mobileNavOpen: false, notificationsOpen: false, moduleSwitcherOpen: true }), true);
  assert.equal(mobileFabShouldHideOverlays({ mobileNavOpen: false, notificationsOpen: false, moduleSwitcherOpen: false }), false);
  assert.equal(isDismissKey("Escape"), true);
  assert.equal(isDismissKey("Enter"), false);
});

test("mobile create fab supports expanded and collapsed render states", () => {
  const collapsedHtml = renderToStaticMarkup(
    React.createElement(NexOpsMobileCreateFab, {
      collapsed: true,
      expanded: false,
      pulse: true,
      onClick: () => {}
    })
  );
  const expandedHtml = renderToStaticMarkup(
    React.createElement(NexOpsMobileCreateFab, {
      collapsed: false,
      expanded: true,
      onClick: () => {}
    })
  );
  assert.match(collapsedHtml, /nexops-mobile-create-fab collapsed pulse/);
  assert.match(expandedHtml, /nexops-mobile-create-fab active/);
  assert.match(expandedHtml, />Create</);
});
