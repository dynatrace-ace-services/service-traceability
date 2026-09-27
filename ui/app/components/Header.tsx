import React from "react";
import { Link } from "react-router-dom";
import { AppHeader } from "@dynatrace/strato-components/layouts";

// PNG is served as a static asset (see build.ui.assets in app.config.json).
// Using origin + known base path avoids import.meta.url which is undefined
// when the bundle is loaded as a classic script in AppEngine.
const logoSrc = `${window.location.origin}/ui/assets/logo.png`;

export const Header = () => {
  return (
    <AppHeader>
      <AppHeader.Navigation>
        <AppHeader.Logo as={Link} to="/" appName="Service Traceability">
          <img src={logoSrc} alt="Service Traceability" style={{ height: 32, width: 32, borderRadius: 6 }} />
        </AppHeader.Logo>
      </AppHeader.Navigation>
    </AppHeader>
  );
};
