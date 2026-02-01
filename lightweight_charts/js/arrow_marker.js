/**
 * Arrow Marker Drawing Tools
 * This file extends the Lib namespace with ArrowUpMarker and ArrowDownMarker drawing tools.
 * It should be loaded after bundle_safe.js
 */
(function (Lib) {
    'use strict';

    // Get references to existing classes from Lib (bundle_safe.js)
    // These are exposed via the 't' object at the end of bundle_safe.js

    // InteractionState enum (replicated from bundle_safe.js internal 'l' enum)
    const InteractionState = {
        NONE: 0,
        HOVERING: 1,
        DRAGGING: 2
    };

    // Get Drawing base class - it's exposed as 'd' internally but we need to access through prototype chain
    // We'll create arrow markers that work with the existing system

    // ============== Arrow Marker Pane Renderer ==============
    class ArrowMarkerPaneRenderer {
        constructor(point, direction, arrowColor, arrowSize, options, hovered, label = '') {
            this._point = point;
            this._direction = direction;
            this._arrowColor = arrowColor;
            this._arrowSize = arrowSize;
            this._options = options;
            this._hovered = hovered;
            this._label = label;
        }

        draw(target) {
            target.useBitmapCoordinateSpace(scope => {
                if (this._point.x === null || this._point.y === null) return;

                const ctx = scope.context;
                const x = Math.round(this._point.x * scope.horizontalPixelRatio);
                const y = Math.round(this._point.y * scope.verticalPixelRatio);

                const size = Math.round(this._arrowSize * scope.horizontalPixelRatio);
                const halfSize = size / 2;

                ctx.save();
                ctx.fillStyle = this._arrowColor;
                ctx.strokeStyle = this._hovered ? (this._options.lineColor || '#ffffff') : this._arrowColor;
                ctx.lineWidth = this._hovered ? 2 * scope.horizontalPixelRatio : 1 * scope.horizontalPixelRatio;

                ctx.beginPath();

                if (this._direction === 'up') {
                    // Draw upward arrow (pentagonal arrow like TradingView)
                    const w = halfSize * 0.6;
                    const h = halfSize;
                    const stemH = halfSize * 0.4;
                    ctx.moveTo(x, y - h);                    // Top point
                    ctx.lineTo(x + halfSize, y);             // Right wing
                    ctx.lineTo(x + w, y);                    // Right inner
                    ctx.lineTo(x + w, y + stemH);            // Right stem bottom
                    ctx.lineTo(x - w, y + stemH);            // Left stem bottom
                    ctx.lineTo(x - w, y);                    // Left inner
                    ctx.lineTo(x - halfSize, y);             // Left wing
                    ctx.closePath();
                } else {
                    // Draw downward arrow (pentagonal arrow like TradingView)
                    const w = halfSize * 0.6;
                    const h = halfSize;
                    const stemH = halfSize * 0.4;
                    ctx.moveTo(x, y + h);                    // Bottom point
                    ctx.lineTo(x + halfSize, y);             // Right wing
                    ctx.lineTo(x + w, y);                    // Right inner
                    ctx.lineTo(x + w, y - stemH);            // Right stem top
                    ctx.lineTo(x - w, y - stemH);            // Left stem top
                    ctx.lineTo(x - w, y);                    // Left inner
                    ctx.lineTo(x - halfSize, y);             // Left wing
                    ctx.closePath();
                }

                ctx.fill();

                // Add black border by default
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 1.5 * scope.horizontalPixelRatio;
                ctx.stroke();

                if (this._hovered) {
                    // Additional highlight stroke when hovered
                    ctx.strokeStyle = this._options.lineColor || '#ffffff';
                    ctx.lineWidth = 2 * scope.horizontalPixelRatio;
                    ctx.stroke();
                }

                // Draw label if present
                if (this._label) {
                    const fontSize = Math.round(12 * scope.verticalPixelRatio);
                    ctx.font = `bold ${fontSize}px sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';

                    const labelPadding = 4 * scope.verticalPixelRatio;
                    const textMetrics = ctx.measureText(this._label);
                    const textWidth = textMetrics.width;
                    const textHeight = fontSize;

                    let labelY;
                    if (this._direction === 'up') {
                        // Label BELOW the arrow for up arrow (green)
                        labelY = y + halfSize + labelPadding + textHeight / 2;
                    } else {
                        // Label ABOVE the arrow for down arrow (red)
                        labelY = y - halfSize - labelPadding - textHeight / 2;
                    }

                    // Draw label background (transparent)
                    const bgPadding = 3 * scope.horizontalPixelRatio;
                    // No background fill - transparent

                    // Draw label text (black)
                    ctx.fillStyle = '#000000';
                    ctx.fillText(this._label, x, labelY);
                }

                ctx.restore();
            });
        }
    }

    // ============== Arrow Marker Pane View ==============
    class ArrowMarkerPaneView {
        constructor(source) {
            this._source = source;
            this._point = { x: null, y: null };
        }

        update() {
            const point = this._source._point;
            const chart = this._source.chart;
            const series = this._source.series;

            if (!chart || !series) {
                this._point.x = null;
                this._point.y = null;
                return;
            }

            const timeScale = chart.timeScale();

            // Try to get x coordinate from time first
            if (point.time) {
                const timeCoord = timeScale.timeToCoordinate(point.time);
                if (timeCoord !== null) {
                    this._point.x = timeCoord;
                } else {
                    // Time is outside visible range - calculate position based on logical range
                    const visibleRange = timeScale.getVisibleLogicalRange();
                    if (visibleRange && point.logical !== undefined) {
                        this._point.x = timeScale.logicalToCoordinate(point.logical);
                    } else {
                        // Fallback: try to find the bar index from data
                        this._point.x = null;
                    }
                }
            } else if (point.logical !== undefined) {
                this._point.x = timeScale.logicalToCoordinate(point.logical);
            } else {
                this._point.x = null;
            }

            this._point.y = series.priceToCoordinate(point.price);
        }

        renderer() {
            return new ArrowMarkerPaneRenderer(
                this._point,
                this._source._direction,
                this._source._arrowColor,
                this._source._arrowSize,
                this._source._options,
                this._source.hovered,
                this._source._label
            );
        }
    }

    // ============== Arrow Marker Base Class ==============
    // Note: This creates a standalone class that mimics the Drawing class behavior
    class ArrowMarker {
        _chart = undefined;
        _series = undefined;
        _requestUpdate;
        _paneViews = [];
        _options;
        _points = [];
        _state = InteractionState.NONE;
        _startDragPoint = null;
        _latestHoverPoint = null;
        _hasDragged = false;
        _dragStartPixelPoint = null;
        _listeners = [];

        // Arrow-specific properties
        _type;
        _point;
        _direction;
        _hovered = false;
        _arrowColor;
        _arrowSize;
        _label = '';

        constructor(point, direction, options = {}) {
            this._point = point;
            this._direction = direction;
            this._type = direction === 'up' ? 'ArrowUpMarker' : 'ArrowDownMarker';

            // Default colors: green for up, red for down
            this._arrowColor = options.arrowColor || (direction === 'up' ? '#26a69a' : '#ef5350');
            this._arrowSize = options.arrowSize || 20;
            this._label = options.label || '';

            this._options = { lineColor: '#000000', arrowColor: this._arrowColor, ...options };
            this._points = [point];
            this._paneViews = [new ArrowMarkerPaneView(this)];
        }

        // Plugin interface methods
        requestUpdate() {
            if (this._requestUpdate) this._requestUpdate();
        }

        attached({ chart, series, requestUpdate }) {
            this._chart = chart;
            this._series = series;
            this._requestUpdate = requestUpdate;
            this.requestUpdate();
        }

        detached() {
            this._chart = undefined;
            this._series = undefined;
            this._requestUpdate = undefined;
        }

        get chart() { return this._chart; }
        get series() { return this._series; }
        get hovered() { return this._hovered; }
        get direction() { return this._direction; }
        get label() { return this._label; }
        get points() { return [this._point]; }

        setLabel(text) {
            this._label = text;
            // [FIX] Update options so saveDrawings captures the change
            this._options.label = text;
            this._options.text = text; // Keep for context menu detection
            this.requestUpdate();
        }

        updatePoints(...points) {
            if (points[0]) {
                this._point = points[0];
                this._points[0] = points[0];
            }
            this.requestUpdate();
        }

        updateAllViews() {
            this._paneViews.forEach(view => view.update());
        }

        paneViews() {
            return this._paneViews;
        }

        applyOptions(opts) {
            this._options = { ...this._options, ...opts };
            if (opts.arrowColor) this._arrowColor = opts.arrowColor;
            if (opts.arrowSize) this._arrowSize = opts.arrowSize;
            if (opts.label !== undefined) this._label = opts.label;
            // Support 'text' from context menu as label alias
            if (opts.text !== undefined) {
                this._label = opts.text;
                this._options.text = opts.text; // Keep for context menu detection
            }
            this.requestUpdate();
        }

        detach() {
            this._options.lineColor = 'transparent';
            this.requestUpdate();
            if (this._series && this._series.detachPrimitive) {
                this._series.detachPrimitive(this);
            }
            for (const listener of this._listeners) {
                document.body.removeEventListener(listener.name, listener.listener);
            }
        }

        _subscribe(name, listener) {
            document.body.addEventListener(name, listener);
            this._listeners.push({ name, listener });
        }

        _unsubscribe(name, listener) {
            document.body.removeEventListener(name, listener);
            const idx = this._listeners.findIndex(l => l.name === name && l.listener === listener);
            if (idx > -1) this._listeners.splice(idx, 1);
        }

        _moveToState(state) {
            switch (state) {
                case InteractionState.NONE:
                    document.body.style.cursor = "default";
                    this._hovered = false;
                    this.requestUpdate();
                    this._unsubscribe("mousedown", this._handleMouseDownInteraction);
                    break;

                case InteractionState.HOVERING:
                    document.body.style.cursor = "pointer";
                    this._hovered = true;
                    this.requestUpdate();
                    this._subscribe("mousedown", this._handleMouseDownInteraction);
                    this._unsubscribe("mouseup", this._handleMouseUpInteraction);
                    if (this.chart) this.chart.applyOptions({ handleScroll: true });
                    break;

                case InteractionState.DRAGGING:
                    document.body.style.cursor = "grabbing";
                    this._subscribe("mouseup", this._handleMouseUpInteraction);
                    if (this.chart) this.chart.applyOptions({ handleScroll: false });
                    break;
            }
            this._state = state;
        }

        _handleMouseDownInteraction = (e) => {
            if (e.button === 0) {
                ArrowMarker._mouseIsDown = true;
                this._hasDragged = false;
                this._dragStartPixelPoint = null;
                this._onMouseDown();
            }
        };

        _handleMouseUpInteraction = () => {
            ArrowMarker._mouseIsDown = false;
            this._moveToState(InteractionState.HOVERING);
            this._dragStartPixelPoint = null;
            if (this._hasDragged) {
                document.body.dispatchEvent(new CustomEvent('drawing-changed', { detail: { type: this._type } }));
                this._hasDragged = false;
            }
        };

        _lastClickTime = 0;

        _onMouseDown() {
            this._startDragPoint = null;
            if (this._latestHoverPoint) {
                // Double-click detection
                const now = Date.now();
                if (this._lastClickTime && now - this._lastClickTime < 300) {
                    // Double-click detected - open label editor
                    this._lastClickTime = 0;
                    this.editLabel();
                    return;
                }
                this._lastClickTime = now;

                // Start dragging immediately (no delay)
                this._moveToState(InteractionState.DRAGGING);
            }
        }

        _onDrag(diff) {
            this._addDiffToPoint(this._point, diff.logical, diff.price);
        }

        _addDiffToPoint(point, logical, price) {
            if (point) {
                point.logical = point.logical + logical;
                point.price = point.price + price;
                point.time = null;
            }
        }

        _handleHoverInteraction(param, shiftPressed = false) {
            this._latestHoverPoint = param.point;

            if (ArrowMarker._mouseIsDown) {
                this._handleDragInteraction(param, shiftPressed);
            } else if (this._mouseIsOverDrawing(param)) {
                if (this._state !== InteractionState.NONE) return;
                this._moveToState(InteractionState.HOVERING);
                // Use global Drawing.hoveredObject if available
                if (typeof window !== 'undefined' && window.Lib && window.Lib.Drawing) {
                    window.Lib.Drawing.hoveredObject = this;
                    window.Lib.Drawing.lastHoveredObject = this;
                }
            } else {
                if (this._state === InteractionState.NONE) return;
                this._moveToState(InteractionState.NONE);
            }
        }

        static _mouseIsDown = false;

        static _eventToPoint(param, series, chart, calcTime = true) {
            if (!series || !param.point || param.logical === null || param.logical === undefined) return null;
            const price = series.coordinateToPrice(param.point.y);
            if (price === null) return null;
            return {
                time: calcTime ? param.time || null : null,
                logical: param.logical,
                price: price.valueOf()
            };
        }

        static _getDiff(current, start) {
            return {
                logical: current.logical - start.logical,
                price: current.price - start.price
            };
        }

        _handleDragInteraction(param, shiftPressed) {
            if (this._state !== InteractionState.DRAGGING) return;
            if (!param.point) return;
            if (!this._dragStartPixelPoint) {
                this._dragStartPixelPoint = param.point;
                return;
            }

            const dx = param.point.x - this._dragStartPixelPoint.x;
            const dy = param.point.y - this._dragStartPixelPoint.y;
            if (Math.sqrt(dx * dx + dy * dy) < 4) return;

            const point = ArrowMarker._eventToPoint(param, this.series, this.chart, false);
            if (!point) return;

            this._startDragPoint = this._startDragPoint || point;
            const diff = ArrowMarker._getDiff(point, this._startDragPoint);
            this._onDrag(diff, shiftPressed);
            this.requestUpdate();
            this._startDragPoint = point;
            this._hasDragged = true;
        }

        _mouseIsOverDrawing(param, tolerance = 8) {
            if (!param.point) return false;

            const viewPoint = this._paneViews[0]._point;
            if (viewPoint.x === null || viewPoint.y === null) return false;

            const mouseX = param.point.x;
            const mouseY = param.point.y;
            const halfSize = this._arrowSize / 2 + tolerance;

            return (
                mouseX >= viewPoint.x - halfSize &&
                mouseX <= viewPoint.x + halfSize &&
                mouseY >= viewPoint.y - halfSize &&
                mouseY <= viewPoint.y + halfSize
            );
        }

        editLabel() {
            this._showLabelModal(this._label, (newLabel) => {
                if (newLabel !== this._label) {
                    this.setLabel(newLabel);
                    document.body.dispatchEvent(new CustomEvent('drawing-changed', { detail: { type: this._type } }));
                }
            });
        }

        _showLabelModal(currentLabel, onConfirm) {
            const modal = document.createElement('div');
            modal.classList.add('confirmation-modal');

            const content = document.createElement('div');
            content.classList.add('modal-content');

            const textDisplay = document.createElement('div');
            textDisplay.classList.add('modal-text');
            textDisplay.innerText = this._label ? 'Edit Label:' : 'Add Label:';

            const input = document.createElement('input');
            input.type = 'text';
            input.value = currentLabel;
            input.classList.add('modal-input');

            const buttons = document.createElement('div');
            buttons.classList.add('modal-buttons');

            const confirmBtn = document.createElement('button');
            confirmBtn.innerText = 'OK';
            confirmBtn.classList.add('modal-button', 'confirm');

            const cancelBtn = document.createElement('button');
            cancelBtn.innerText = 'Cancel';
            cancelBtn.classList.add('modal-button', 'cancel');

            const close = () => {
                document.body.removeChild(modal);
                document.removeEventListener('keydown', onKeyDown);
            };

            const onKeyDown = (e) => {
                // Stop propagation to prevent chart handlers from deleting the arrow
                e.stopPropagation();
                if (e.key === 'Escape') close();
                if (e.key === 'Enter') {
                    onConfirm(input.value);
                    close();
                }
            };

            // Also prevent input keydowns from bubbling, but handle Enter/Escape
            input.addEventListener('keydown', (e) => {
                e.stopPropagation();
                if (e.key === 'Enter') {
                    onConfirm(input.value);
                    close();
                }
                if (e.key === 'Escape') {
                    close();
                }
            });

            confirmBtn.addEventListener('click', () => {
                onConfirm(input.value);
                close();
            });

            cancelBtn.addEventListener('click', close);
            modal.addEventListener('click', (e) => {
                if (e.target === modal) close();
            });

            document.addEventListener('keydown', onKeyDown);

            buttons.appendChild(cancelBtn);
            buttons.appendChild(confirmBtn);
            content.appendChild(textDisplay);
            content.appendChild(input);
            content.appendChild(buttons);
            modal.appendChild(content);
            document.body.appendChild(modal);

            setTimeout(() => {
                input.focus();
                input.select();
            }, 10);
        }
    }

    // ============== Convenience Classes ==============
    class ArrowUpMarker extends ArrowMarker {
        constructor(point, options) {
            super(point, 'up', options);
        }
    }

    class ArrowDownMarker extends ArrowMarker {
        constructor(point, options) {
            super(point, 'down', options);
        }
    }

    // ============== Export to Lib namespace ==============
    Lib.ArrowMarker = ArrowMarker;
    Lib.ArrowUpMarker = ArrowUpMarker;
    Lib.ArrowDownMarker = ArrowDownMarker;

    // ============== Toolbox Integration ==============
    // SVG icons for arrow markers (TradingView style pentagonal arrows)
    const ARROW_UP_SVG = '<path fill-rule="nonzero" d="M11 16v6h6v-6h4.865l-7.865-9.438-7.865 9.438h4.865zm7 7h-8v-6h-6l10-12 10 12h-6v6z"/>';
    const ARROW_DOWN_SVG = '<path fill-rule="nonzero" d="M17 12v-6h-6v6h-4.865l7.865 9.438 7.865-9.438h-4.865zm-7-7h8v6h6l-10 12-10-12h6v-6z"/>';

    // Patch the ToolBox to add arrow marker buttons
    // This runs after bundle_safe.js has loaded
    function patchToolBox() {
        const originalToolBox = Lib.ToolBox;
        if (!originalToolBox) {
            console.warn('Arrow Marker: ToolBox not found, skipping patch');
            return;
        }

        // Store original methods
        const originalMakeToolBox = originalToolBox.prototype._makeToolBox;
        const originalLoadDrawings = originalToolBox.prototype.loadDrawings;
        const originalSaveDrawings = originalToolBox.prototype.saveDrawings;

        // Patch _makeToolBox to add arrow buttons
        originalToolBox.prototype._makeToolBox = function () {
            const div = originalMakeToolBox.call(this);

            // Add Arrow Up button
            const arrowUpBtn = this._makeToolBoxElement(ArrowUpMarker, 'KeyU', ARROW_UP_SVG);
            arrowUpBtn.dataset.toolId = 'arrow_up';  // For reorder tracking
            this.buttons.push(arrowUpBtn);
            div.insertBefore(arrowUpBtn, div.lastChild); // Insert before trash button

            // Add Arrow Down button
            const arrowDownBtn = this._makeToolBoxElement(ArrowDownMarker, 'KeyD', ARROW_DOWN_SVG);
            arrowDownBtn.dataset.toolId = 'arrow_down';  // For reorder tracking
            this.buttons.push(arrowDownBtn);
            div.insertBefore(arrowDownBtn, div.lastChild); // Insert before trash button

            // Reorder all buttons based on saved TOOLBOX_ORDER
            if (window.TOOLBOX_ORDER && Array.isArray(window.TOOLBOX_ORDER)) {
                const savedOrder = window.TOOLBOX_ORDER;
                const toolButtons = Array.from(div.querySelectorAll('.toolbox-button'));
                const dragHandle = div.querySelector('.toolbox-drag-handle');

                // Sort buttons based on saved order
                toolButtons.sort((a, b) => {
                    const aId = a.dataset.toolId;
                    const bId = b.dataset.toolId;
                    const aIdx = savedOrder.indexOf(aId);
                    const bIdx = savedOrder.indexOf(bId);
                    // Items not in savedOrder go to the end
                    const aPriority = aIdx === -1 ? 999 : aIdx;
                    const bPriority = bIdx === -1 ? 999 : bIdx;
                    return aPriority - bPriority;
                });

                // Re-append buttons in sorted order (after drag handle)
                toolButtons.forEach(btn => div.appendChild(btn));
            }

            return div;
        };

        // Patch loadDrawings to handle arrow markers
        originalToolBox.prototype.loadDrawings = function (drawings) {
            // First call original to load standard drawings
            if (originalLoadDrawings) {
                // Filter out arrow markers for original handler
                const nonArrowDrawings = drawings.filter(d =>
                    d.type !== 'ArrowUpMarker' && d.type !== 'ArrowDownMarker'
                );
                originalLoadDrawings.call(this, nonArrowDrawings);
            }

            // Handle arrow markers
            drawings.forEach(d => {
                if (d.type === 'ArrowUpMarker') {
                    const options = d.options || {};
                    if (d.label) options.label = d.label;
                    this._drawingTool.addNewDrawing(new ArrowUpMarker(d.points[0], options));
                } else if (d.type === 'ArrowDownMarker') {
                    const options = d.options || {};
                    if (d.label) options.label = d.label;
                    this._drawingTool.addNewDrawing(new ArrowDownMarker(d.points[0], options));
                }
            });
        };

        console.log('Arrow Marker: ToolBox patched successfully');
    }

    // Patch DrawingTool for single-click arrow completion and proper construction
    function patchDrawingTool() {
        // Mark arrows as single-click types
        ArrowUpMarker._isSingleClick = true;
        ArrowDownMarker._isSingleClick = true;

        // We need to patch the Handler's createToolBox to intercept DrawingTool
        const originalCreateToolBox = Lib.Handler.prototype.createToolBox;
        Lib.Handler.prototype.createToolBox = function () {
            originalCreateToolBox.call(this);

            // Now patch the drawingTool's _onClick method
            const drawingTool = this.toolBox._drawingTool;
            const originalOnClick = drawingTool._onClick.bind(drawingTool);

            drawingTool._onClick = function (param) {
                if (!this._isDrawing) return;

                const point = ArrowMarker._eventToPoint(param, this._series, this._chart);
                if (!point) return;

                // Check if this is an arrow type
                const isArrowType = this._drawingType === ArrowUpMarker ||
                    this._drawingType === ArrowDownMarker;

                if (isArrowType && this._activeDrawing === null) {
                    // Create arrow with single point
                    this._activeDrawing = new this._drawingType(point, {});
                    this._series.attachPrimitive(this._activeDrawing);

                    // Complete immediately (single-click)
                    this._drawings.push(this._activeDrawing);
                    const type = this._activeDrawing._type;
                    this.stopDrawing();
                    if (this._finishDrawingCallback) {
                        this._finishDrawingCallback(type);
                    }
                    return;
                }

                // Fall back to original for non-arrow types
                originalOnClick(param);
            }.bind(drawingTool);

            console.log('Arrow Marker: DrawingTool patched for single-click');
        };
    }

    // Run patches after DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(patchToolBox, 100);
            setTimeout(patchDrawingTool, 150);
        });
    } else {
        setTimeout(patchToolBox, 100);
        setTimeout(patchDrawingTool, 150);
    }

    console.log('Arrow Marker module loaded successfully');

})(window.Lib || (window.Lib = {}));
