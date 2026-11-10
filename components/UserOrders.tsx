import React from 'react';
import CustomerPortalModal, { PortalTabId } from './CustomerPortalModal';

export interface UserOrdersProps {
  userId?: string | number;
  userEmail?: string;
  userName?: string;
  userRole?: string | null;
  organizationName?: string;
  company?: string;
  initialTab?: PortalTabId;
  onClose: () => void;
  onLoadSpecsToCalculator?: (specs: Record<string, any>, bookTitle?: string) => void;
}

const UserOrders: React.FC<UserOrdersProps> = ({
  userId,
  userEmail,
  userName,
  userRole = null,
  organizationName,
  company,
  initialTab = 'ORDERS_REPRINTS',
  onClose,
  onLoadSpecsToCalculator,
}) => {
  return (
    <CustomerPortalModal
      userId={userId}
      userEmail={userEmail}
      userName={userName}
      userRole={userRole}
      organizationName={organizationName}
      company={company}
      initialTab={initialTab}
      onClose={onClose}
      onLoadSpecsToCalculator={onLoadSpecsToCalculator}
    />
  );
};

export default UserOrders;
