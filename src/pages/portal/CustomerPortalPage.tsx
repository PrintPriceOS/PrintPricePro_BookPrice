import React from 'react';
import CustomerPortalModal, { CustomerPortalModalProps, PortalTabId } from '../../../components/CustomerPortalModal';

export type { PortalTabId, CustomerPortalModalProps };

export interface CustomerPortalPageProps extends Omit<CustomerPortalModalProps, 'isFullPage' | 'onClose'> {
  onClose?: () => void;
  onBackToConfigurator?: () => void;
  activeRoutePath?: string;
  onNavigateRoute?: (path: string, tab?: PortalTabId, orderId?: string | null) => void;
}

/**
 * CustomerPortalPage — Dedicated Full-Screen B2B Publisher & Self-Service Portal View
 * Supports dedicated routes:
 * - /portal/orders
 * - /portal/invoices
 * - /portal/tracking/:orderId?
 * - /portal/shipping
 * - /portal/fiscal
 * - /order/:orderId/files
 */
export const CustomerPortalPage: React.FC<CustomerPortalPageProps> = ({
  onClose,
  onBackToConfigurator,
  ...props
}) => {
  const handleClose = () => {
    if (onBackToConfigurator) {
      onBackToConfigurator();
    }
    if (onClose) {
      onClose();
    }
  };
  return <CustomerPortalModal {...props} onClose={handleClose} isFullPage={true} />;
};

export default CustomerPortalPage;
