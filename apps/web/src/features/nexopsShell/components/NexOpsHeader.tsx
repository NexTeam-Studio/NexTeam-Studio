import React from "react";
import type { TenantBranding } from "@nexteam/core";
import { PlatformMark, ProductLogo, TenantBrandMark, productLabel, type ProductBrand } from "../../../shared/branding/ProductBranding";

export function NexOpsSharedMobileBar(props: {
  tenantBranding: TenantBranding | null;
  tenantId: string;
  product?: ProductBrand;
  rightControls: React.ReactNode;
  secondaryControls?: React.ReactNode;
  onBrandClick?: () => void;
  brandAriaLabel?: string;
}): React.ReactElement {
  const product = props.product ?? "nexops";
  const brandLockup = (
    <div className="nexops-mobile-brand-lockup">
      <PlatformMark className="nexops-mobile-platform-mark" alt="NexTeam" />
      <ProductLogo product={product} className="nexops-mobile-product-logo" alt={productLabel(product)} />
    </div>
  );
  return (
    <header className="nexops-mobile-bar">
      <div className="nexops-mobile-header-grid">
        <div className="nexops-mobile-header-left">
          {props.onBrandClick ? (
            <button
              className="nexops-mobile-brand-button"
              type="button"
              aria-label={props.brandAriaLabel ?? `Open ${productLabel(product)}`}
              onClick={props.onBrandClick}
            >
              {brandLockup}
            </button>
          ) : brandLockup}
        </div>
        <div className="nexops-mobile-header-center">
          <TenantBrandMark branding={props.tenantBranding} tenantId={props.tenantId} className="nexops-mobile-tenant-mark" />
        </div>
        <div className="nexops-mobile-header-right">
          <div className="nexops-mobile-controls">
            {props.rightControls}
          </div>
          {props.secondaryControls ? (
            <div className="nexops-mobile-secondary-controls">
              {props.secondaryControls}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}

export function NexOpsSharedWebTopbar(props: {
  tenantBranding: TenantBranding | null;
  tenantId: string;
  moduleTitle: string;
  product?: ProductBrand;
  moduleSwitcherOpen: boolean;
  onToggleModuleSwitcher: () => void;
  accountTools: React.ReactNode;
  searchPlaceholder?: string;
}): React.ReactElement {
  const product = props.product ?? "nexops";
  return (
    <header className="nexops-web-topbar">
      <div className="nexops-web-brand">
        <div className="nexops-web-platform-lockup">
          <PlatformMark className="nexops-header-platform-mark" alt="NexTeam" />
          <ProductLogo product={product} className="nexops-header-product-logo" alt={productLabel(product)} />
        </div>
        <span className="nexops-web-brand-divider" aria-hidden="true" />
        <TenantBrandMark branding={props.tenantBranding} tenantId={props.tenantId} className="nexops-header-tenant-logo" />
      </div>
      <div className="nexops-web-tools">
        <label>
          <span className="sr-only">Global search</span>
          <input placeholder={props.searchPlaceholder ?? "Search NexOps..."} />
        </label>
        <button
          className="nexops-module-switcher-button"
          type="button"
          aria-expanded={props.moduleSwitcherOpen}
          onClick={props.onToggleModuleSwitcher}
        >
          Modules
        </button>
        <span>{props.moduleTitle}</span>
        <div className="nexops-web-account-tools">
          {props.accountTools}
        </div>
      </div>
    </header>
  );
}
