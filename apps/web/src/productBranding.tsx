import React from "react";
import type { TenantBranding } from "@nexteam/core";

export type ProductBrand = "nexops" | "nexcam" | "nexportal" | "nexreach" | "nexdocs" | "nexi";
const DEFAULT_TENANT_ID = "aquatrace";
const DEFAULT_TENANT_LOGO_SRC: Record<string, string> = {
  [DEFAULT_TENANT_ID]: "/tenants/aquatrace/aquatrace-banner-logo.png"
};

const PRODUCT_LOGO_SRC: Record<ProductBrand, string> = {
  nexops: "/assets/brand/nexops-logo.png",
  nexcam: "/assets/brand/nexcam-logo.png",
  nexportal: "/assets/brand/nexportal-logo.png",
  nexreach: "/assets/brand/nexreach-logo.png",
  nexdocs: "/assets/brand/nexdocs-logo.png",
  nexi: "/assets/brand/nexi-logo.png"
};

const SIDEBAR_STACK_TOP_LOGO_SRC = "/assets/brand/nexteam-block-logo.png";

const PRODUCT_LABEL: Record<ProductBrand, string> = {
  nexops: "NexOps",
  nexcam: "NexCam",
  nexportal: "NexPortal",
  nexreach: "NexReach",
  nexdocs: "NexDocs",
  nexi: "Nexi"
};

export function productLogoSrc(product: ProductBrand): string {
  return PRODUCT_LOGO_SRC[product];
}

export function productLabel(product: ProductBrand): string {
  return PRODUCT_LABEL[product];
}

export function tenantDisplayName(branding: TenantBranding | null, tenantId: string): string {
  return branding?.displayName ?? (tenantId === DEFAULT_TENANT_ID ? "Aquatrace" : tenantId);
}

export function tenantLogoSrc(branding: TenantBranding | null, tenantId: string): string | null {
  if (branding?.logo?.url) {
    return branding.logo.url;
  }
  if (branding?.logo?.mediaId) {
    return `/api/media/${encodeURIComponent(branding.logo.mediaId)}?tenantId=${encodeURIComponent(tenantId)}`;
  }
  return DEFAULT_TENANT_LOGO_SRC[tenantId] ?? null;
}

export function ProductLogo(props: {
  product: ProductBrand;
  className?: string;
  alt?: string;
  decorative?: boolean;
}): React.ReactElement {
  return (
    <img
      alt={props.decorative ? "" : props.alt ?? `${productLabel(props.product)} logo`}
      aria-hidden={props.decorative ? "true" : undefined}
      className={`product-logo product-logo-${props.product} ${props.className ?? ""}`.trim()}
      src={productLogoSrc(props.product)}
    />
  );
}

export function ProductInlineLabel(props: {
  product: ProductBrand;
  label?: string;
  className?: string;
}): React.ReactElement {
  return (
    <span className={`product-inline-label ${props.className ?? ""}`.trim()}>
      <ProductLogo product={props.product} className="product-inline-label-image" decorative />
      <span>{props.label ?? productLabel(props.product)}</span>
    </span>
  );
}

export function PlatformMark(props: {
  className?: string;
  alt?: string;
  decorative?: boolean;
}): React.ReactElement {
  return (
    <img
      alt={props.decorative ? "" : props.alt ?? "NexTeam logo"}
      aria-hidden={props.decorative ? "true" : undefined}
      className={`platform-mark ${props.className ?? ""}`.trim()}
      src={SIDEBAR_STACK_TOP_LOGO_SRC}
    />
  );
}

export function TenantBrandMark(props: {
  branding: TenantBranding | null;
  tenantId: string;
  className?: string;
}): React.ReactElement {
  const displayName = tenantDisplayName(props.branding, props.tenantId);
  const logoSrc = tenantLogoSrc(props.branding, props.tenantId);
  if (logoSrc) {
    return (
      <img
        alt={props.branding?.logo?.alt ?? `${displayName} logo`}
        className={`tenant-logo ${props.className ?? ""}`.trim()}
        src={logoSrc}
      />
    );
  }
  return (
    <div className={`tenant-wordmark ${props.className ?? ""}`.trim()} aria-label={`${displayName} logo placeholder`}>
      {displayName}
    </div>
  );
}

export function SidebarBrandStack(props: {
  product: ProductBrand;
  branding: TenantBranding | null;
  tenantId: string;
}): React.ReactElement {
  return (
    <div className="nexops-sidebar-brand-stack" aria-label={`${productLabel(props.product)} brand stack`}>
      <div className="nexops-sidebar-brand-tier nexops-sidebar-brand-tier-platform">
        <img alt="NexTeam" className="product-logo nexops-sidebar-brand-logo nexops-sidebar-brand-logo-platform" src={SIDEBAR_STACK_TOP_LOGO_SRC} />
      </div>
      <div className="nexops-sidebar-brand-tier">
        <ProductLogo product={props.product} className="nexops-sidebar-brand-logo nexops-sidebar-brand-logo-product" alt={productLabel(props.product)} />
      </div>
      <div className="nexops-sidebar-brand-tier nexops-sidebar-brand-tier-tenant">
        <TenantBrandMark branding={props.branding} tenantId={props.tenantId} className="nexops-sidebar-tenant-mark" />
      </div>
    </div>
  );
}

export function NexiIdentityMark(props: {
  className?: string;
  renderedAvatar?: React.ReactNode | null;
  caption?: string;
}): React.ReactElement {
  const signature = <ProductLogo product="nexi" className="nexi-signature-mark" alt="Nexi" />;
  return (
    <div className={`nexi-identity-mark ${props.className ?? ""}`.trim()}>
      <div className="nexi-avatar-stage" aria-label="Nexi avatar">
        {props.renderedAvatar ?? <ProductLogo product="nexi" className="nexi-avatar-fallback" alt="Nexi" />}
      </div>
      {props.renderedAvatar ? signature : null}
      {props.caption ? <span className="nexi-identity-caption">{props.caption}</span> : null}
    </div>
  );
}
