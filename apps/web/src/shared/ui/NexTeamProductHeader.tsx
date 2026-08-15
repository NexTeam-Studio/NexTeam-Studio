import React from "react";

/**
 * The common structural shell for NexTeam product headers. Product areas supply
 * their own identity and controls, but keep the approved platform layout.
 */
export function NexTeamProductHeader(props: {
  className: string;
  navigation?: React.ReactNode;
  brand: React.ReactNode;
  tenantBrand?: React.ReactNode;
  context?: React.ReactNode;
  utilities?: React.ReactNode;
  ariaLabel?: string;
}): React.ReactElement {
  return (
    <header className={`nexteam-product-header ${props.className}`.trim()} aria-label={props.ariaLabel}>
      {props.navigation ? <div className="nexteam-product-header__navigation">{props.navigation}</div> : null}
      <div className="nexteam-product-header__brand">{props.brand}</div>
      {props.tenantBrand ? <div className="nexteam-product-header__tenant">{props.tenantBrand}</div> : null}
      {props.context ? <div className="nexteam-product-header__context">{props.context}</div> : null}
      {props.utilities ? <div className="nexteam-product-header__utilities">{props.utilities}</div> : null}
    </header>
  );
}
