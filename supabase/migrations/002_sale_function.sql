CREATE OR REPLACE FUNCTION process_sale(
  p_staff_id UUID,
  p_items JSONB,
  p_discount DECIMAL,
  p_payment_method TEXT,
  p_amount_paid DECIMAL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sale_id UUID;
  v_receipt_number TEXT;
  v_item JSONB;
  v_product_id UUID;
  v_quantity INTEGER;
  v_unit_price DECIMAL;
  v_subtotal DECIMAL := 0;
  v_total DECIMAL;
  v_current_stock INTEGER;
  v_product_name TEXT;
  v_sale_data JSONB;
BEGIN
  -- Generate receipt number
  v_receipt_number := 'OPK-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || 
                      LPAD(CAST(EXTRACT(EPOCH FROM NOW()) AS TEXT), 6, '0');

  -- Calculate subtotal and check stock
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_quantity := (v_item->>'quantity')::INTEGER;
    v_unit_price := (v_item->>'unit_price')::DECIMAL;
    
    SELECT stock_quantity, name INTO v_current_stock, v_product_name
    FROM products
    WHERE id = v_product_id
    FOR UPDATE;
    
    IF v_current_stock < v_quantity THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Insufficient stock for product: ' || v_product_name
      );
    END IF;
    
    v_subtotal := v_subtotal + (v_unit_price * v_quantity);
  END LOOP;

  v_total := v_subtotal - p_discount;

  -- Insert sale
  INSERT INTO sales (
    receipt_number,
    staff_id,
    subtotal,
    discount,
    total,
    payment_method,
    amount_paid,
    change_amount
  ) VALUES (
    v_receipt_number,
    p_staff_id,
    v_subtotal,
    p_discount,
    v_total,
    p_payment_method,
    p_amount_paid,
    p_amount_paid - v_total
  ) RETURNING id INTO v_sale_id;

  -- Insert sale items and update stock
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_quantity := (v_item->>'quantity')::INTEGER;
    v_unit_price := (v_item->>'unit_price')::DECIMAL;
    
    SELECT name INTO v_product_name FROM products WHERE id = v_product_id;
    
    INSERT INTO sale_items (
      sale_id,
      product_id,
      product_name_snapshot,
      quantity,
      unit_price,
      total_price
    ) VALUES (
      v_sale_id,
      v_product_id,
      v_product_name,
      v_quantity,
      v_unit_price,
      v_unit_price * v_quantity
    );
    
    UPDATE products
    SET stock_quantity = stock_quantity - v_quantity,
        updated_at = NOW()
    WHERE id = v_product_id
    RETURNING stock_quantity INTO v_current_stock;
    
    INSERT INTO stock_movements (
      product_id,
      user_id,
      movement_type,
      quantity,
      previous_quantity,
      new_quantity,
      reason
    ) VALUES (
      v_product_id,
      p_staff_id,
      'sale',
      v_quantity,
      v_current_stock + v_quantity,
      v_current_stock,
      'Sale: ' || v_receipt_number
    );
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'sale_id', v_sale_id,
    'receipt_number', v_receipt_number
  );
END;
$$;