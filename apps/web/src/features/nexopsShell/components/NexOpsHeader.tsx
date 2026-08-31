import React from "react";
import type { TenantBranding } from "@nexteam/core";
import { PlatformMark, ProductLogo, TenantBrandMark, hasTenantLogo, productLabel, type ProductBrand } from "../../../shared/branding/ProductBranding";
import { NexTeamProductHeader } from "../../../shared/ui/NexTeamProductHeader";

export function NexOpsSharedMobileBar(props: {
  tenantBranding: TenantBranding | null;
  tenantId: string;
  product?: ProductBrand;
  menuControl?: React.ReactNode;
  signOutControl?: React.ReactNode;
  rightControls?: React.ReactNode;
  secondaryControls?: React.ReactNode;
  onBrandClick?: () => void;
  brandAriaLabel?: string;
}): React.ReactElement {
  const product = props.product ?? "nexops";
  const tenantLogoAvailable = hasTenantLogo(props.tenantBranding, props.tenantId);
  const brandLockup = (
    <div className="nexsuite-header__brand-lockup">
      <PlatformMark className="nexsuite-header__platform-mark" alt="NexTeam" />
      <span className="nexsuite-header__brand-name">{productLabel(product)}</span>
    </div>
  );
  return (
    <header className="nexops-mobile-bar"><div className="nexops-mobile-header-grid"><div className="nexops-mobile-header-left">{props.onBrandClick ? <button className="nexops-mobile-brand-button" type="button" aria-label={props.brandAriaLabel ?? `Open ${productLabel(product)}`} onClick={props.onBrandClick}>{brandLockup}</button> : brandLockup}</div>{tenantLogoAvailable ? <div className="nexops-mobile-header-center"><TenantBrandMark branding={props.tenantBranding} tenantId={props.tenantId} className="nexops-mobile-tenant-mark" /></div> : null}<div className="nexops-mobile-header-right"><div className="nexops-mobile-controls">{props.rightControls}</div>{props.secondaryControls ? <div className="nexops-mobile-secondary-controls">{props.secondaryControls}</div> : null}</div></div></header>
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
  const tenantLogoAvailable = hasTenantLogo(props.tenantBranding, props.tenantId);
  return (
    <NexTeamProductHeader
      className="nexops-web-topbar"
      ariaLabel="NexOps workspace header"
      brand={(
        <div className="nexops-web-platform-lockup">
          <PlatformMark className="nexops-header-platform-mark" alt="NexTeam" />
          <ProductLogo product={product} className="nexops-header-product-logo" alt={productLabel(product)} />
        </div>
      )}
      tenantBrand={tenantLogoAvailable ? (
        <>
          <span className="nexops-web-brand-divider" aria-hidden="true" />
          <TenantBrandMark branding={props.tenantBranding} tenantId={props.tenantId} className="nexops-header-tenant-logo" />
        </>
      ) : undefined}
      context={(
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
        </div>
      )}
      utilities={<div className="nexops-web-account-tools">{props.accountTools}</div>}
    />
  );
}
