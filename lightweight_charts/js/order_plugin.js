class OrderPlugin {
  constructor(handler) {
    if (!handler) return;
    this.handler = handler;
    this.orders = new Map();
    this.draggingOrderId = null;

    // Inject CSS for close button hover effect
    if (!document.getElementById('order-plugin-styles')) {
      const style = document.createElement('style');
      style.id = 'order-plugin-styles';
      style.innerHTML = `
          .order-label-close:hover { 
            color: #fff !important; 
            background-color: rgba(255, 0, 0, 0.7);
            border-top-left-radius: 4px;
            border-bottom-left-radius: 4px;
          }
        `;
      document.head.appendChild(style);
    }

    this._renderLoop = this._renderLoop.bind(this);
    this._handleMouseDown = this._handleMouseDown.bind(this);
    this._handleMouseUp = this._handleMouseUp.bind(this);
    this._handleMouseMove = this._handleMouseMove.bind(this);

    if (this.handler.wrapper) {
      this.handler.wrapper.addEventListener('mousemove', this._handleMouseMove);
      this.handler.wrapper.addEventListener('mousedown', this._handleMouseDown);
      document.addEventListener('mouseup', this._handleMouseUp);
    } else {
      console.warn('OrderPlugin: Handler wrapper not ready during init. Retrying listeners in 500ms...');
      setTimeout(() => {
        if (this.handler.wrapper) {
          this.handler.wrapper.addEventListener('mousemove', this._handleMouseMove);
          this.handler.wrapper.addEventListener('mousedown', this._handleMouseDown);
          document.addEventListener('mouseup', this._handleMouseUp);
        }
      }, 500);
    }

    requestAnimationFrame(this._renderLoop);
  }

  addOrder(id, price, title, color, textColor, axisLabelVisible, draggable, zIndex, entryPrice, dashed, retryCount = 0) {
    if (this.orders.has(id)) this.removeOrder(id);

    // Default draggable to true if undefined
    if (draggable === undefined) draggable = true;
    // Default zIndex: Entry lines use lower value (10), regular orders use 20
    if (zIndex === undefined) zIndex = 20;
    // Default dashed to false (solid line for real orders)
    if (dashed === undefined) dashed = false;

    if (!this.handler || !this.handler.series) {
      if (retryCount > 50) { // Max 5 seconds retry
        console.error('OrderPlugin: Failed to add order after 50 retries (Handler/Series missing):', id);
        return;
      }
      // console.warn('OrderPlugin: Handler or series not waiting, retrying order add...', id);
      setTimeout(() => this.addOrder(id, price, title, color, textColor, axisLabelVisible, draggable, zIndex, entryPrice, dashed, retryCount + 1), 100);
      return;
    }

    // 1. Create PriceLine (Title empty so only price shows on axis - unless hidden)
    // lineStyle: 0 = Solid, 1 = Dotted, 2 = Dashed, 3 = Large Dashed, 4 = Sparse Dotted
    const line = this.handler.series.createPriceLine({
      price: price,
      color: color || '#2196F3',
      lineWidth: dashed ? 1 : 2,  // Thinner line for fake orders
      lineStyle: dashed ? 2 : 0,  // 2 = Dashed, 0 = Solid
      axisLabelVisible: axisLabelVisible !== false, // Default true
      title: '',
    });


    // 2. Create Custom Label
    const label = document.createElement('div');
    label.className = 'order-label';
    label.style.position = 'absolute';
    label.style.zIndex = String(zIndex);
    label.style.backgroundColor = color || '#2196F3';
    label.style.color = textColor || 'white';
    label.style.padding = '3px 8px';
    label.style.fontSize = '12px';
    label.style.fontFamily = 'sans-serif';
    label.style.fontWeight = 'bold';
    label.style.borderRadius = '4px 0 0 4px';
    label.style.cursor = draggable ? 'grab' : 'default';
    label.style.whiteSpace = 'nowrap';
    label.style.display = 'flex';
    label.style.alignItems = 'center';
    label.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
    label.style.userSelect = 'none';
    // Reduced opacity for fake orders (dashed lines)
    label.style.opacity = dashed ? '0.6' : '1';


    // Close Button (Using text character ✕)
    const closeBtn = document.createElement('span');
    closeBtn.innerHTML = '✕';
    closeBtn.className = 'order-label-close';
    // Increase hit area by adding padding
    closeBtn.style.padding = '3px 8px 3px 6px';
    closeBtn.style.margin = '-3px 4px -3px -8px'; // Negative margins to offsetting padding, pulling it to the left edge
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.fontSize = '14px';
    closeBtn.title = "Cancel Order";
    closeBtn.style.display = 'flex';
    closeBtn.style.alignItems = 'center';
    closeBtn.style.borderRight = '1px solid rgba(255,255,255,0.2)'; // Optional separator for visual clarity

    closeBtn.onmousedown = (e) => { e.stopPropagation(); }; // Prevent drag start
    closeBtn.onclick = (e) => {
      e.stopPropagation();
      window.callbackFunction('remove_order' + this.handler.id + '_~_' + id);
      this.removeOrder(id);
    };

    const textSpan = document.createElement('span');
    textSpan.innerText = title.trim();
    textSpan.style.paddingLeft = '4px';

    label.appendChild(closeBtn);
    label.appendChild(textSpan);

    // Drag start on label
    label.onmousedown = (e) => {
      // Check draggable status
      const order = this.orders.get(id);
      if (order && !order.draggable) return;

      if (e.target === closeBtn) return;
      this.draggingOrderId = id;
      if (this.handler && this.handler.chart) {
        this.handler.chart.applyOptions({ handleScroll: false, handleScale: false });
      }
      e.stopPropagation();
      e.preventDefault();
    };

    this.handler.div.appendChild(label);

    // Store necessary params to recreate if needed in render loop
    const params = { id, price, title, color, textColor, axisLabelVisible, draggable, zIndex, entryPrice, dashed };
    this.orders.set(id, { price, line, label, title, color, draggable, entryPrice, params });
  }

  removeOrder(id) {
    if (this.orders.has(id)) {
      const o = this.orders.get(id);
      if (this.handler && this.handler.series) {
        try { this.handler.series.removePriceLine(o.line); } catch (e) { }
      }
      if (o.label && o.label.parentNode) o.label.parentNode.removeChild(o.label);
      this.orders.delete(id);
    }
  }

  _renderLoop() {
    requestAnimationFrame(this._renderLoop);
    try {
      if (!this.handler || !this.handler.series) return;

      const priceScale = this.handler.series.priceScale();
      const priceScaleWidth = priceScale.width();

      // Get chart element offset - priceToCoordinate returns coords relative to chart canvas,
      // but label is positioned relative to handler.div (which may have legend at top)
      let chartTopOffset = 0;
      try {
        if (this.handler.chart && this.handler.chart.chartElement && this.handler.div) {
          const chartEl = this.handler.chart.chartElement();
          const divRect = this.handler.div.getBoundingClientRect();
          const chartRect = chartEl.getBoundingClientRect();
          chartTopOffset = chartRect.top - divRect.top;
        }
      } catch (e) { }

      // Fix: Get height from chart options or container, as priceScale() doesn't expose height()
      let chartHeight = 0;
      try {
        if (this.handler.chart && this.handler.chart.options) {
          chartHeight = this.handler.chart.options().height;
        }
      } catch (e) { }

      if (!chartHeight && this.handler.div) {
        chartHeight = this.handler.div.clientHeight;
      }

      for (const [id, order] of this.orders) {

        // 1. Validation: Check if line still exists on chart (might be cleared on reset)
        // Check line object validity? Not easy.

        let y = null;
        try {
          y = this.handler.series.priceToCoordinate(order.price);
        } catch (e) { }

        if (y === null) {
          // Price is outside visible range.
          // Fallback logic to show arrow/label at top/bottom

          // For now, if null, try to detect direction
          let visibleRange = null;
          try {
            // Check if function exists
            // @ts-ignore
            if (typeof priceScale.getVisiblePriceRange === 'function') {
              visibleRange = priceScale.getVisiblePriceRange();
            }
          } catch (e) { }

          if (visibleRange) {
            if (order.price > visibleRange.to) {
              y = 0; // Top
            } else if (order.price < visibleRange.from) {
              y = chartHeight; // Bottom
            }
          }
        }

        if (y === null) {
          // Still null (range check failed?), fallback to hide
          order.label.style.display = 'none';
        } else {
          // Clamp y to be safe visually
          y = Math.max(0, Math.min(y, chartHeight));

          order.label.style.display = 'flex';
          // Center label vertically on the line, accounting for chart element offset
          order.label.style.top = (y + chartTopOffset - 12) + 'px';
          // Anchor to the right edge of chart area (next to scale)
          order.label.style.right = priceScaleWidth + 'px';
        }
      }
    } catch (e) {
      console.warn("OrderPlugin render error:", e);
    }
  }

  _handleMouseDown(e) {
    // Placeholder for future logic
  }

  _handleMouseUp(e) {
    if (this.draggingOrderId) {
      const order = this.orders.get(this.draggingOrderId);
      if (order) {
        console.log('[OrderPlugin] MouseUp - Sending callback for:', this.draggingOrderId, 'price:', order.price.toFixed(2));
        if (typeof window.callbackFunction === 'function') {
          window.callbackFunction('update_order' + this.handler.id + '_~_' + this.draggingOrderId + '_~_' + order.price.toFixed(2));
        } else {
          console.error('[OrderPlugin] window.callbackFunction is not defined!');
        }
        order.label.style.cursor = order.draggable ? 'grab' : 'default';
      }
      this.draggingOrderId = null;
      if (this.handler && this.handler.chart) {
        this.handler.chart.applyOptions({ handleScroll: true, handleScale: true });
      }
    }
  }

  _handleMouseMove(e) {
    if (!this.handler || !this.handler.div) return;

    try {
      // Drag Logic
      if (this.draggingOrderId) {
        const rect = this.handler.div.getBoundingClientRect();
        const y = e.clientY - rect.top;
        if (this.handler.series) {
          const price = this.handler.series.coordinateToPrice(y);
          if (price !== null) {
            const order = this.orders.get(this.draggingOrderId);
            if (order) {
              order.price = price;
              // order.line.applyOptions({ price: price }); // Updating line might fail if line is detached
              try {
                order.line.applyOptions({ price: price });
              } catch (err) {
                // If line update fails, try to recreate it? or just fail gracefully
              }

              order.label.style.cursor = 'grabbing';
              // Dynamic title update if entryPrice is available
              if (order.entryPrice !== undefined && order.entryPrice !== null) {
                let diff = price - order.entryPrice;
                let sign = diff > 0 ? "+" : "";
                // Use 1 decimal place and pad to 4 chars with spaces (e.g. " 5.3" instead of "05.3")
                let valStr = Math.abs(diff).toFixed(1).padStart(4, ' ');
                let newTitle = sign + valStr + " pts";
                // Update text span (2nd child)
                if (order.label.childNodes.length > 1) {
                  order.label.childNodes[1].innerText = newTitle;
                }
              }
            }
          }
        }
        e.preventDefault();
        e.stopPropagation();
      }
    } catch (e) {
      console.warn("OrderPlugin mousemove error:", e);
    }
  }
}
