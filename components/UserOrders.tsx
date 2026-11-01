import React from 'react';
import CustomerPortalModal, { PortalTabId } from './CustomerPortalModal';

export interface UserOrdersProps {
  userId?: string | number;
  userEmail?: string;
  userName?: string;
  initialTab?: PortalTabId;
  onClose: () => void;
  onLoadSpecsToCalculator?: (specs: Record<string, any>, bookTitle?: string) => void;
}

const UserOrders: React.FC<UserOrdersProps> = ({
  userId,
  userEmail,
  userName,
  initialTab = 'ORDERS_REPRINTS',
  onClose,
  onLoadSpecsToCalculator,
}) => {
  return (
    <CustomerPortalModal
      userId={userId}
      userEmail={userEmail}
      userName={userName}
      initialTab={initialTab}
      onClose={onClose}
      onLoadSpecsToCalculator={onLoadSpecsToCalculator}
    />
  );
};

export default UserOrders;
