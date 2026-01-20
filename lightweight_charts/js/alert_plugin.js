class AlertPlugin {
  constructor(handler) {
    if (!handler) return;
    this.handler = handler;
    this.alerts = new Map(); // Stores {id: {price, line, label}}
    this.draggingAlertId = null;
    this.hoveredAlertId = null;
    this.currentPrice = null;
    this.crosshairY = null;  // Y coordinate from crosshair
    this.isMouseInChart = false;  // Track if mouse is in chart area

    this.button = null; // Plus button

    // Inject CSS if not already there (shared with OrderPlugin)
    if (!document.getElementById('order-plugin-styles')) {
      const style = document.createElement('style');
      style.id = 'order-plugin-styles';
      style.innerHTML = `
          .order-label-close:hover { color: #ffebee !important; text-shadow: 0 0 2px red; }
        `;
      document.head.appendChild(style);
    }

    this._initPlusButton();

    this._renderLoop = this._renderLoop.bind(this);
    this._handleMouseMove = this._handleMouseMove.bind(this);
    this._handleCrosshairMove = this._handleCrosshairMove.bind(this);
    this._handleMouseDown = this._handleMouseDown.bind(this);
    this._handleMouseUp = this._handleMouseUp.bind(this);
    this._handleWrapperClick = this._handleWrapperClick.bind(this);
    this._handleContextMenu = this._handleContextMenu.bind(this);

    // Subscribe to crosshair move for exact Y coordinate
    if (this.handler.chart) {
      this.handler.chart.subscribeCrosshairMove(this._handleCrosshairMove);
    }

    if (this.handler.wrapper) {
      this.handler.wrapper.addEventListener('mousemove', this._handleMouseMove);
      this.handler.wrapper.addEventListener('mousedown', this._handleMouseDown);
      this.handler.wrapper.addEventListener('click', this._handleWrapperClick, { capture: true });
      this.handler.wrapper.addEventListener('contextmenu', this._handleContextMenu);
      document.addEventListener('mouseup', this._handleMouseUp);

      this.handler.wrapper.addEventListener('mouseleave', () => {
        this.isMouseInChart = false;
        if (this.button) this.button.style.display = 'none';
      });

      this.handler.wrapper.addEventListener('mouseenter', () => {
        this.isMouseInChart = true;
      });
    }

    requestAnimationFrame(this._renderLoop);
  }

  _handleCrosshairMove(param) {
    if (!param || !param.point) {
      this.crosshairY = null;
      if (this.button) this.button.style.display = 'none';
      return;
    }

    // Store the exact Y coordinate from the crosshair
    this.crosshairY = param.point.y;

    // Get the actual price at the crosshair Y position (not the candle's price)
    if (this.handler.series) {
      const price = this.handler.series.coordinateToPrice(this.crosshairY);
      if (price !== null) {
        this.currentPrice = price;
      }
    }

    // Update button position
    this._updateButtonPosition();
  }

  _initPlusButton() {
    this.button = document.createElement('div');
    this.button.id = 'alert-button-' + this.handler.chart.id;
    this.button.className = 'alert-plus-button';
    this.button.innerHTML = '+';
    this.button.style.position = 'absolute';
    this.button.style.zIndex = '100';
    this.button.style.width = '25px';
    this.button.style.height = '25px';  // Match crosshair label height
    this.button.style.borderRadius = '4px 0 0 4px';  // Round left corners only
    this.button.style.backgroundColor = '#3A393A';
    this.button.style.color = 'white';
    this.button.style.fontSize = '18px';
    this.button.style.fontWeight = 'bold';
    this.button.style.textAlign = 'center';
    this.button.style.lineHeight = '23px';
    this.button.style.cursor = 'pointer';
    this.button.style.display = 'none';
    this.button.style.userSelect = 'none';
    this.button.style.pointerEvents = 'none';  // Let mouse events pass through to keep crosshair

    // Store button bounds for click detection
    this.buttonBounds = null;

    this.handler.div.appendChild(this.button);
  }

  _renderLoop() {
    requestAnimationFrame(this._renderLoop);
    try {
      if (!this.handler || !this.handler.series) return;

      const priceScale = this.handler.series.priceScale();
      const priceScaleWidth = priceScale.width();

      for (const [id, alert] of this.alerts) {
        const y = this.handler.series.priceToCoordinate(alert.price);
        if (y === null) {
          if (alert.label) alert.label.style.display = 'none';
        } else {
          if (alert.label) {
            alert.label.style.display = 'flex';
            alert.label.style.top = (y - 12) + 'px';
            alert.label.style.right = priceScaleWidth + 'px';
          }
        }
      }
    } catch (e) {
      console.warn("AlertPlugin render error:", e);
    }
  }

  _handleMouseMove(e) {
    if (!this.handler || !this.handler.div) return;

    try {
      const rect = this.handler.div.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Handle alert dragging
      if (this.draggingAlertId) {
        if (this.handler.series) {
          const price = this.handler.series.coordinateToPrice(y);
          if (price !== null) {
            const alert = this.alerts.get(this.draggingAlertId);
            if (alert) {
              alert.price = price;
              alert.line.applyOptions({ price: price });
              alert.label.style.cursor = 'grabbing';
            }
          }
        }
        e.preventDefault();
        e.stopPropagation();
        return;  // Don't update button position while dragging
      }

      const priceScale = this.handler.series.priceScale();
      const priceScaleWidth = priceScale.width();

      // Hide button if in price scale area
      if (x > rect.width - priceScaleWidth) {
        if (this.button) this.button.style.display = 'none';
        this.handler.div.style.cursor = '';
        return;
      }

      // Update button position if we have crosshair data
      if (this.crosshairY !== null) {
        this._updateButtonPosition();
      }

      // Change cursor to pointer when over button bounds
      if (this.buttonBounds &&
        x >= this.buttonBounds.left && x <= this.buttonBounds.right &&
        y >= this.buttonBounds.top && y <= this.buttonBounds.bottom) {
        this.handler.div.style.cursor = 'pointer';
      } else {
        this.handler.div.style.cursor = '';
      }
    } catch (e) {
      console.warn("AlertPlugin mousemove error:", e);
    }
  }

  _updateButtonPosition() {
    if (!this.button || !this.handler || !this.handler.div || this.crosshairY === null) return;
    if (!this.isMouseInChart) return;

    try {
      const rect = this.handler.div.getBoundingClientRect();
      const priceScale = this.handler.series.priceScale();
      const priceScaleWidth = priceScale.width();

      this.button.style.display = 'block';

      // Use the exact Y from crosshair, center the 25px button on it
      const buttonTop = Math.floor(this.crosshairY - 12);
      this.button.style.top = buttonTop + 'px';

      // Find the price scale canvas to get exact left edge position
      let priceScaleLeft = rect.width - priceScaleWidth;  // Default fallback
      const canvases = this.handler.div.querySelectorAll('canvas');
      for (const canvas of canvases) {
        const canvasRect = canvas.getBoundingClientRect();
        // Price scale canvas has width close to priceScaleWidth and is at the right edge
        if (Math.abs(canvasRect.width - priceScaleWidth) < 5) {
          const clientLeft = this.handler.div.clientLeft || 0;
          priceScaleLeft = canvasRect.left - rect.left - clientLeft;
          break;
        }
      }

      // Position button with 1px gap from label
      this.button.style.right = 'auto';
      this.button.style.left = (priceScaleLeft - 25 - 1) + 'px';  // 25 = button width, 1px gap

      // Store button bounds for click detection (since pointer-events: none)
      this.buttonBounds = {
        left: priceScaleLeft - 25 - 1,
        right: priceScaleLeft - 1,
        top: buttonTop,
        bottom: buttonTop + 25
      };
    } catch (e) {
      console.warn("AlertPlugin updateButtonPosition error:", e);
    }
  }

  _handleMouseDown(e) {
    // Placeholder for alert drag
  }

  _handleMouseUp(e) {
    if (this.draggingAlertId) {
      const alert = this.alerts.get(this.draggingAlertId);
      if (alert) {
        // Restore cursor
        alert.label.style.cursor = 'grab';
        // Send callback to Python
        window.callbackFunction('update_alert_~_' + this.draggingAlertId + '_~_' + alert.price.toFixed(2));
      }
      // Restore chart scrolling/scaling
      if (this.handler && this.handler.chart) {
        this.handler.chart.applyOptions({ handleScroll: true, handleScale: true });
      }
      this.draggingAlertId = null;
    }
  }

  _handleWrapperClick(e) {
    // Check if click was on the plus button (pointer-events: none, so we detect by coords)
    if (this.buttonBounds && this.button && this.button.style.display === 'block') {
      const rect = this.handler.div.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (x >= this.buttonBounds.left && x <= this.buttonBounds.right &&
        y >= this.buttonBounds.top && y <= this.buttonBounds.bottom) {
        console.log('[AlertPlugin] Button click detected via coords! Price:', this.currentPrice);
        e.stopPropagation();
        e.preventDefault();
        if (this.currentPrice !== null) {
          this._handleClick(e);
        }
        return;
      }
    }
  }

  _handleContextMenu(e) {
    // Check if user is hovering a drawing (indicated by cursor style)
    // This allows the Drawing Tool (bundle_safe.js) to handle the event.
    const cursor = document.body.style.cursor;

    if (cursor === 'pointer' || cursor === 'move' || cursor === 'grab' || cursor === 'grabbing') {
      // Yield to drawing context menu
      return;
    }

    // DON'T show alert context menu on empty area right-click
    // Just prevent the default browser context menu
    e.preventDefault();
  }

  _handleClick(e) {
    // Debounce: prevent multiple menus from being created in quick succession
    const now = Date.now();
    if (this._lastMenuTime && now - this._lastMenuTime < 500) {
      console.log('[AlertPlugin] Debounced click - menu already created recently');
      return;
    }
    this._lastMenuTime = now;

    if (this.currentPrice !== null) {
      // Remove ALL existing context menus (alert menus AND drawing menus)
      const allMenus = document.querySelectorAll('.context-menu, .alert-context-menu');
      allMenus.forEach(el => {
        el.style.display = 'none';
        if (el.parentNode) el.parentNode.removeChild(el);
      });

      const menu = new AlertMenu(this.handler.chart.id, this.currentPrice, (id, p) => this.addAlertFromUI(id, p));

      // Position menu to the LEFT of the plus button
      if (this.button) {
        const btnRect = this.button.getBoundingClientRect();
        const menuWidth = 150;
        menu.div.style.left = (btnRect.left - menuWidth - 5) + 'px';
        menu.div.style.top = btnRect.top + 'px';
        menu.div.style.right = 'auto';
      }
    }
  }

  // Called from UI context menu - triggers backend creation
  addAlertFromUI(chartId, price) {
    const id = 'alert-' + Date.now();
    window.callbackFunction('add_alert_~_' + id + '_~_' + price.toFixed(2));
    // Note: The visual will be added when _load_backend_alerts calls addAlert after backend confirms
  }

  // Called from Python to display an existing backend alert (no callback loop)
  addAlert(id, price) {
    // Check if alert already exists
    if (this.alerts.has(id)) {
      console.log('[AlertPlugin] Alert already exists:', id);
      return;
    }

    if (!this.handler || !this.handler.series) return;

    // Create PriceLine (no title, just the line - no label on price axis)
    const line = this.handler.series.createPriceLine({
      price: price,
      color: '#FF9800',  // Orange for alerts
      lineWidth: 2,
      lineStyle: 2,  // Dashed
      axisLabelVisible: false,  // Don't show on price axis
      title: '',
    });

    // Create Custom Label (same style as order lines)
    const label = document.createElement('div');
    label.className = 'alert-label';
    label.style.position = 'absolute';
    label.style.zIndex = '50';
    label.style.backgroundColor = '#FF9800';
    label.style.color = 'white';
    label.style.padding = '3px 8px';
    label.style.fontSize = '12px';
    label.style.fontFamily = 'sans-serif';
    label.style.fontWeight = 'bold';
    label.style.borderRadius = '4px 0 0 4px';
    label.style.cursor = 'grab';  // Draggable cursor
    label.style.whiteSpace = 'nowrap';
    label.style.display = 'flex';
    label.style.alignItems = 'center';
    label.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
    label.style.userSelect = 'none';

    // Close Button (Using text character ✕)
    const closeBtn = document.createElement('span');
    closeBtn.innerHTML = '✕';
    closeBtn.className = 'order-label-close';  // Reuse order button styles
    closeBtn.style.padding = '3px 8px 3px 6px';
    closeBtn.style.margin = '-3px 4px -3px -8px';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.fontSize = '14px';
    closeBtn.title = "Remove Alert";
    closeBtn.style.display = 'flex';
    closeBtn.style.alignItems = 'center';
    closeBtn.style.borderRight = '1px solid rgba(255,255,255,0.2)';

    closeBtn.onmousedown = (e) => { e.stopPropagation(); };
    closeBtn.onclick = (e) => {
      e.stopPropagation();
      this.removeAlert(id);
      window.callbackFunction('remove_alert_~_' + id);
    };

    const textSpan = document.createElement('span');
    textSpan.innerText = '    Alert';  // Spaces for padding like order lines
    textSpan.style.paddingLeft = '4px';

    // Drag start on label
    label.onmousedown = (e) => {
      if (e.target === closeBtn) return;
      this.draggingAlertId = id;
      if (this.handler && this.handler.chart) {
        this.handler.chart.applyOptions({ handleScroll: false, handleScale: false });
      }
      label.style.cursor = 'grabbing';
      e.stopPropagation();
      e.preventDefault();
    };

    label.appendChild(closeBtn);
    label.appendChild(textSpan);

    this.handler.div.appendChild(label);
    this.alerts.set(id, { price, line, label });
  }

  removeAlert(id) {
    if (this.alerts.has(id)) {
      const a = this.alerts.get(id);
      if (this.handler && this.handler.series) {
        try { this.handler.series.removePriceLine(a.line); } catch (e) { }
      }
      if (a.label && a.label.parentNode) a.label.parentNode.removeChild(a.label);
      this.alerts.delete(id);
    }
  }

  updateAlert(id, newPrice) {
    if (this.alerts.has(id)) {
      const a = this.alerts.get(id);
      a.price = newPrice;
      a.line.applyOptions({ price: newPrice });
    }
  }
}

class AlertMenu {
  constructor(chartId, price, onAddAlert) {
    this.chartId = chartId;
    this.price = price;
    this.onAddAlert = onAddAlert;
    this._boundCloseHandler = this._closeHandler.bind(this);
    this.id = 'alert-menu-' + Date.now();
    this.creationTime = Date.now();

    this.div = document.createElement('div');
    this.div.className = 'context-menu alert-context-menu';
    this.div.style.display = 'block';
    this.div.style.position = 'fixed';  // Use fixed for viewport positioning
    this.div.style.zIndex = '99999';   // Ensure on top
    this.div.id = this.id;
    console.log('[AlertMenu] Created menu div:', this.id);

    const lots = window.defaultLots || 1;
    const buyItem = document.createElement('span');
    buyItem.className = 'context-menu-item';
    buyItem.innerText = 'Buy ' + lots + ' Lots at ' + price.toFixed(1);
    buyItem.onclick = (e) => {
      e.stopPropagation();
      this.div.style.display = 'none';
      this.close();
      setTimeout(() => window.callbackFunction('request_buy_~_' + price.toFixed(1)), 50);
    };
    this.div.appendChild(buyItem);

    const item = document.createElement('span');
    item.className = 'context-menu-item';
    item.innerText = 'Add Alert at ' + price.toFixed(1);
    item.onclick = (e) => {
      e.stopPropagation();
      this.div.style.display = 'none';
      this.close();
      setTimeout(() => onAddAlert(this.chartId, price), 50);
    };

    this.div.appendChild(item);
    document.body.appendChild(this.div);

    // Default position
    this.div.style.top = '100px';
    this.div.style.right = '50px';

    setTimeout(() => {
      document.addEventListener('click', this._boundCloseHandler);
      document.addEventListener('mousedown', this._boundCloseHandler);
    }, 100);
  }

  _closeHandler(e) {
    console.log('[AlertMenu] _closeHandler called, event:', e.type);
    console.log('[AlertMenu] Time since creation:', Date.now() - this.creationTime, 'ms');

    if (Date.now() - this.creationTime < 150) {
      console.log('[AlertMenu] Ignoring early close');
      return;
    }

    if (!this.div.contains(e.target)) {
      console.log('[AlertMenu] Closing - click was outside menu');
      this.close();
    } else {
      console.log('[AlertMenu] Click was inside menu, not closing');
    }
  }

  close() {
    if (this.div.parentNode) {
      this.div.parentNode.removeChild(this.div);
    }
    document.removeEventListener('click', this._boundCloseHandler);
    document.removeEventListener('mousedown', this._boundCloseHandler);
  }
}
