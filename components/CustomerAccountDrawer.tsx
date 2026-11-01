import React from 'react';
import CustomerPortalModal, { CustomerPortalModalProps, PortalTabId } from './CustomerPortalModal';

export type { PortalTabId, CustomerPortalModalProps };

/**
 * CustomerAccountDrawer — Unified B2B Publisher & Self-Service Account Hub
 * Provides 1-click reprints, Stripe/SEPA & B2B Wire checkout, EN 16931 e-Invoicing
 * (Facturae 3.2.2 & XRechnung 3.0), Dock & Shipping Address Book, and Live Telemetry POD.
 */
export const CustomerAccountDrawer: React.FC<CustomerPortalModalProps> = (props) => {
  return <CustomerPortalModal {...props} />;
};

export default CustomerAccountDrawer;

