class AlertPlugin {
  constructor(handler) {
    if (!handler) return;
    this.handler = handler;
    this.alerts = new Map(); // Stores {id: {price, line, label}}
    this.draggingAlertId = null;
    this.hoveredAlertId = null;
    this.currentPrice = null;

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
    this._handleMouseDown = this._handleMouseDown.bind(this);
    this._handleMouseUp = this._handleMouseUp.bind(this);
    this._handleWrapperClick = this._handleWrapperClick.bind(this);
    this._handleContextMenu = this._handleContextMenu.bind(this);

    if (this.handler.wrapper) {
      this.handler.wrapper.addEventListener('mousemove', this._handleMouseMove);
      this.handler.wrapper.addEventListener('mousedown', this._handleMouseDown);
      this.handler.wrapper.addEventListener('click', this._handleWrapperClick, { capture: true });
      this.handler.wrapper.addEventListener('contextmenu', this._handleContextMenu);
      document.addEventListener('mouseup', this._handleMouseUp);

      this.handler.wrapper.addEventListener('mouseleave', () => {
        if (this.button) this.button.style.display = 'none';
      });
    }

    requestAnimationFrame(this._renderLoop);
  }

  _initPlusButton() {
    this.button = document.createElement('div');
    this.button.id = 'alert-button-' + this.handler.chart.id;
    this.button.className = 'alert-plus-button';
    this.button.innerHTML = '+';
    this.button.style.position = 'absolute';
    this.button.style.zIndex = '100';
    this.button.style.width = '24px';
    this.button.style.height = '24px';  // Match crosshair label height
    this.button.style.borderRadius = '4px';  // Rectangle with rounded corners
    this.button.style.backgroundColor = '#4c525e';  // Match crosshair label gray
    this.button.style.color = 'white';
    this.button.style.fontSize = '18px';
    this.button.style.fontWeight = 'bold';
    this.button.style.textAlign = 'center';
    this.button.style.lineHeight = '22px';
    this.button.style.cursor = 'pointer';
    this.button.style.display = 'none';
    this.button.style.userSelect = 'none';

    this.button.onclick = (e) => {
      console.log('[AlertPlugin] Button clicked! Price:', this.currentPrice);
      e.stopPropagation();
      e.preventDefault();
      if (this.currentPrice !== null) {
        this._handleClick(e);
      }
    };

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
      const y = e.clientY - rect.top;
      const x = e.clientX - rect.left;

      const priceScale = this.handler.series.priceScale();
      const priceScaleWidth = priceScale.width();

      // Hide button if in price scale area
      if (x > rect.width - priceScaleWidth) {
        if (this.button) this.button.style.display = 'none';
        return;
      }

      if (this.handler.series) {
        const price = this.handler.series.coordinateToPrice(y);
        if (price !== null) {
          this.currentPrice = price;

          // Position plus button aligned with crosshair (same level as label)
          if (this.button) {
            this.button.style.display = 'block';
            this.button.style.top = y + 'px';  // Exact crosshair line position
            this.button.style.right = (priceScaleWidth + 4) + 'px';
          }
        }
      }
    } catch (e) {
      console.warn("AlertPlugin mousemove error:", e);
    }
  }

  _handleMouseDown(e) {
    // Placeholder for alert drag
  }

  _handleMouseUp(e) {
    if (this.draggingAlertId) {
      const alert = this.alerts.get(this.draggingAlertId);
      if (alert) {
        window.callbackFunction('update_alert_~_' + this.draggingAlertId + '_~_' + alert.price.toFixed(2));
      }
      this.draggingAlertId = null;
    }
  }

  _handleWrapperClick(e) {
    // This is captured-phase, we don't need special logic here
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
    if (this.currentPrice !== null) {
      // Remove ALL existing context menus (alert menus AND drawing menus)
      const allMenus = document.querySelectorAll('.context-menu, .alert-context-menu');
      allMenus.forEach(el => {
        el.style.display = 'none';
      });

      const menu = new AlertMenu(this.handler.chart.id, this.currentPrice, (id, p) => this.addAlert(id, p));

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

  addAlert(chartId, price) {
    const id = 'alert-' + Date.now();
    window.callbackFunction('add_alert_~_' + id + '_~_' + price.toFixed(2));

    if (!this.handler || !this.handler.series) return;

    const line = this.handler.series.createPriceLine({
      price: price,
      color: '#FF9800',
      lineWidth: 1,
      lineStyle: 2,
      axisLabelVisible: true,
      title: '🔔',
    });

    const label = document.createElement('div');
    label.className = 'alert-label';
    label.style.position = 'absolute';
    label.style.zIndex = '50';
    label.style.backgroundColor = '#FF9800';
    label.style.color = 'white';
    label.style.padding = '2px 6px';
    label.style.fontSize = '11px';
    label.style.borderRadius = '3px';
    label.style.cursor = 'pointer';
    label.innerText = '🔔 ' + price.toFixed(1);

    label.onclick = () => {
      this.removeAlert(id);
      window.callbackFunction('remove_alert_~_' + id);
    };

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
      if (a.label) {
        a.label.innerText = '🔔 ' + newPrice.toFixed(1);
      }
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
