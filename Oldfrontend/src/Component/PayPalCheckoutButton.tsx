import { 
  PayPalButtons, 
  usePayPalScriptReducer, 
  PayPalButtonsComponentProps 
} from "@paypal/react-paypal-js";
import React from "react";
import { colors } from '../style';
import type {
  CreateOrderData,
  CreateOrderActions,
  OnApproveData,
  OnApproveActions,
} from "@paypal/paypal-js";

interface PayPalButtonProps {
    amount: string;
    onApprove: (data: OnApproveData, actions: OnApproveActions) => Promise<void>;
    onError: (err: any) => void;
    currency?: string;
    description?: string;
    disabled?: boolean;
}


export const PayPalCheckoutButton: React.FC<PayPalButtonProps> = ({
  amount,
  currency = 'USD',
  description = 'Subscription Payment',
  onApprove,
  onError,
  disabled = false,
}) => {
  const [{ isPending, isResolved }] = usePayPalScriptReducer();

   const createOrder = (
    _data: CreateOrderData,
    actions: CreateOrderActions,
  ): Promise<string> => {

    return actions.order.create({
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: {
            value: amount,
            currency_code: currency,
          },
          description,
        },
      ],
    });
  };

  if (disabled) {
    return (
      <div className={`p-4 rounded-lg ${colors.bg.tertiary} text-center`}>
        <p className={colors.text.primary}>PayPal payment is currently unavailable</p>
      </div>
    );
  }

  const styles :PayPalButtonsComponentProps["style"]= {
        layout: 'vertical',
        color: 'gold',
        shape: 'rect',   
    };

  return (
    <div className={`p-4 rounded-lg ${colors.bg.tertiary}`}>
      {isPending ? (
        <div className="text-center py-4">Loading PayPal...</div>
      ) : isResolved ? (
        <PayPalButtons
          style={styles}
          createOrder={createOrder}
          onApprove={onApprove}
          onError={onError}
          disabled={disabled}
        />
      ) : (
        <div className="text-center py-4">
          <p className={colors.text.secondary}>Failed to load PayPal</p>
          <button
            onClick={() => window.location.reload()}
            className={`mt-2 px-4 py-2 rounded-md ${colors.bg.primary} ${colors.text.primary}`}
          >
            Retry
          </button>
        </div>
      )}
      <p className={`mt-3 text-xs text-center ${colors.text.secondary}`}>
        Secure payment by PayPal
      </p>
    </div>
  );
};

export default PayPalCheckoutButton;