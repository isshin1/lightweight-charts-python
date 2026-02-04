/**
 * Chart Context Menu Module
 * Provides right-click context menu for chart splitting.
 * 
 * Layout modes (window.chartLayoutMode):
 * - 'single': 1x1 - both split options enabled
 * - 'split': 2x1 horizontal - split down disabled
 * - 'split_down': 1x2 vertical - split right disabled
 */

(function () {
    'use strict';

    let activeMenu = null;

    // CSS for context menu
    const menuStyles = `
        .chart-context-menu {
            position: fixed;
            background: #1e1e1e;
            border: 1px solid #3C434C;
            border-radius: 6px;
            padding: 4px 0;
            min-width: 160px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
            z-index: 100000;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 13px;
            user-select: none;
        }

        .chart-context-menu-item {
            padding: 8px 16px;
            color: #d8d9db;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 10px;
            transition: background-color 0.1s;
        }

        .chart-context-menu-item:hover:not(.disabled) {
            background: #3C434C;
        }

        .chart-context-menu-item.disabled {
            color: #666;
            cursor: not-allowed;
        }

        .chart-context-menu-item .icon {
            width: 16px;
            height: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0.7;
        }

        .chart-context-menu-separator {
            height: 1px;
            background: #3C434C;
            margin: 4px 0;
        }
    `;

    // Inject styles once
    function injectStyles() {
        if (document.querySelector('#chart-context-menu-styles')) return;
        const style = document.createElement('style');
        style.id = 'chart-context-menu-styles';
        style.textContent = menuStyles;
        document.head.appendChild(style);
    }

    /**
     * Create SVG icons for menu items.
     */
    const icons = {
        splitRight: `<svg viewBox="0 0 16 16" fill="currentColor" width="16" height="16">
            <rect x="1" y="2" width="6" height="12" rx="1" stroke="currentColor" fill="none" stroke-width="1.5"/>
            <rect x="9" y="2" width="6" height="12" rx="1" stroke="currentColor" fill="none" stroke-width="1.5"/>
            <path d="M11 8h2M12 7v2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>`,
        splitDown: `<svg viewBox="0 0 16 16" fill="currentColor" width="16" height="16">
            <rect x="2" y="1" width="12" height="6" rx="1" stroke="currentColor" fill="none" stroke-width="1.5"/>
            <rect x="2" y="9" width="12" height="6" rx="1" stroke="currentColor" fill="none" stroke-width="1.5"/>
            <path d="M8 11v2M7 12h2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>`,
        close: `<svg viewBox="0 0 16 16" fill="currentColor" width="16" height="16">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>`
    };

    /**
     * Hide any active context menu.
     */
    function hideMenu() {
        if (activeMenu) {
            activeMenu.remove();
            activeMenu = null;
        }
    }

    /**
     * Show context menu at position.
     * @param {number} x - X position
     * @param {number} y - Y position
     * @param {Object} options - Menu options
     */
    function showMenu(x, y, options) {
        hideMenu();

        const menu = document.createElement('div');
        menu.className = 'chart-context-menu';

        // Split Right
        const splitRightItem = createMenuItem(
            'Split Right',
            icons.splitRight,
            options.canSplitRight,
            () => {
                hideMenu();
                if (options.onSplitRight) options.onSplitRight();
            }
        );
        menu.appendChild(splitRightItem);

        // Split Down
        const splitDownItem = createMenuItem(
            'Split Down',
            icons.splitDown,
            options.canSplitDown,
            () => {
                hideMenu();
                if (options.onSplitDown) options.onSplitDown();
            }
        );
        menu.appendChild(splitDownItem);

        // Close (only if not main chart and in split mode)
        if (options.showClose) {
            const separator = document.createElement('div');
            separator.className = 'chart-context-menu-separator';
            menu.appendChild(separator);

            const closeItem = createMenuItem(
                'Close',
                icons.close,
                true,
                () => {
                    hideMenu();
                    if (options.onClose) options.onClose();
                }
            );
            menu.appendChild(closeItem);
        }

        // Position menu
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;

        document.body.appendChild(menu);
        activeMenu = menu;

        // Adjust if menu goes off screen
        const rect = menu.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            menu.style.left = `${window.innerWidth - rect.width - 8}px`;
        }
        if (rect.bottom > window.innerHeight) {
            menu.style.top = `${window.innerHeight - rect.height - 8}px`;
        }
    }

    /**
     * Create a menu item element.
     */
    function createMenuItem(label, iconSvg, enabled, onClick) {
        const item = document.createElement('div');
        item.className = 'chart-context-menu-item' + (enabled ? '' : ' disabled');

        const icon = document.createElement('span');
        icon.className = 'icon';
        icon.innerHTML = iconSvg;

        const text = document.createElement('span');
        text.textContent = label;

        item.appendChild(icon);
        item.appendChild(text);

        if (enabled) {
            item.addEventListener('click', onClick);
        }

        return item;
    }

    /**
     * Determine split availability based on current grid state and chart position.
     * 
     * Uses window.chartGrid (2x2 array of 0/1) to determine which splits are available.
     * 
     * @param {number} row - Grid row (0 or 1)
     * @param {number} col - Grid column (0 or 1)
     * @returns {{canSplitRight: boolean, canSplitDown: boolean, showClose: boolean}}
     */
    function getSplitAvailability(row, col) {
        const grid = window.chartGrid || [[1, 0], [0, 0]];
        const isPrimary = (row === 0 && col === 0);

        // Can split right if the cell to the right is empty
        const canSplitRight = (col < 1 && grid[row][col + 1] === 0);

        // Can split down if the cell below is empty
        const canSplitDown = (row < 1 && grid[row + 1][col] === 0);

        // Can close if not the primary chart
        const showClose = !isPrimary;

        return { canSplitRight, canSplitDown, showClose };
    }

    /**
     * Initialize context menu for a chart.
     * @param {Object} chartObj - The chart object (must have wrapper)
     * @param {Object} callbacks - Callback functions {onSplitRight, onSplitDown, onClose}
     * @param {number} row - Grid row position (0 or 1)
     * @param {number} col - Grid column position (0 or 1)
     */
    function initChartContextMenu(chartObj, callbacks, row, col) {
        if (!chartObj || !chartObj.wrapper) {
            console.error('[ChartContextMenu] Invalid chart object');
            return;
        }

        injectStyles();

        const wrapper = chartObj.wrapper;

        // Remove existing handler if any
        if (wrapper._contextMenuHandler) {
            wrapper.removeEventListener('contextmenu', wrapper._contextMenuHandler);
        }

        wrapper._contextMenuHandler = (e) => {
            // Check if a drawing is being hovered - if so, let the drawing context menu handle it
            if (window.Lib && window.Lib.Drawing && window.Lib.Drawing.hoveredObject) {
                // Don't prevent default or stop propagation - let the drawing context menu handle it
                return;
            }

            e.preventDefault();
            e.stopPropagation();

            // Get current availability based on grid state
            const availability = getSplitAvailability(row, col);

            showMenu(e.clientX, e.clientY, {
                canSplitRight: availability.canSplitRight,
                canSplitDown: availability.canSplitDown,
                showClose: availability.showClose,
                onSplitRight: () => {
                    if (callbacks.onSplitRight) callbacks.onSplitRight();
                },
                onSplitDown: () => {
                    if (callbacks.onSplitDown) callbacks.onSplitDown();
                },
                onClose: () => {
                    if (callbacks.onClose) callbacks.onClose();
                }
            });
        };

        wrapper.addEventListener('contextmenu', wrapper._contextMenuHandler);

        console.log('[ChartContextMenu] Initialized for chart at [' + row + ',' + col + '] mode:', window.chartLayoutMode);
    }

    // Global click to hide menu
    document.addEventListener('click', (e) => {
        if (activeMenu && !activeMenu.contains(e.target)) {
            hideMenu();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            hideMenu();
        }
    });

    /**
     * Auto-initialize context menu for a newly created chart handler.
     * Called when chartCreated event is received from TypeScript Handler.
     * @param {Object} handler - The chart handler object with id and wrapper
     */
    function autoInitForHandler(handler) {
        if (!handler || !handler.wrapper) {
            console.warn('[ChartContextMenu] Handler or wrapper not ready for auto-init');
            return;
        }

        injectStyles();

        // Determine grid position from handler index in allChartHandlers
        const allHandlers = window.allChartHandlers || [];
        const idx = allHandlers.indexOf(handler);
        const row = Math.floor(idx / 2);
        const col = idx % 2;

        // Setup click handler for focus tracking (updates blue border)
        const wrapper = handler.wrapper;
        if (!wrapper._focusClickHandler) {
            wrapper._focusClickHandler = function (e) {
                console.log('[ChartContextMenu] Click detected on chart index ' + idx);
                if (window.pythonObject) {
                    window.pythonObject.callback('on_active_chart_~_' + idx);
                }
            };
            wrapper.addEventListener('mousedown', wrapper._focusClickHandler, true);
            console.log('[ChartContextMenu] Focus click handler installed for chart ' + idx);
        }

        // Create callbacks that use pythonObject for Python communication
        const callbacks = {
            onSplitRight: function () {
                console.log('[ChartContextMenu] Split Right from [' + row + ',' + col + ']');
                if (window.pythonObject) {
                    window.pythonObject.callback('on_context_split_~_' + row + '_' + col + '_right');
                }
            },
            onSplitDown: function () {
                console.log('[ChartContextMenu] Split Down from [' + row + ',' + col + ']');
                if (window.pythonObject) {
                    window.pythonObject.callback('on_context_split_~_' + row + '_' + col + '_down');
                }
            },
            onClose: function () {
                if (row === 0 && col === 0) {
                    // Primary chart cannot be closed
                    return;
                }
                console.log('[ChartContextMenu] Close chart at [' + row + ',' + col + ']');
                if (window.pythonObject) {
                    window.pythonObject.callback('on_context_close_~_' + row + '_' + col);
                }
            }
        };

        // Initialize context menu for this handler
        initChartContextMenu(handler, callbacks, row, col);
        console.log('[ChartContextMenu] Auto-initialized for handler', handler.id, 'at [' + row + ',' + col + ']');
    }

    // Listen for chart creation events from TypeScript Handler
    document.addEventListener('chartCreated', function (e) {
        const { chartId, handler } = e.detail;
        console.log('[ChartContextMenu] Received chartCreated event for', chartId);
        autoInitForHandler(handler);
    });

    // Expose globally
    window.ChartContextMenu = {
        init: initChartContextMenu,
        hide: hideMenu,
        getSplitAvailability,
        autoInitForHandler
    };

    console.log('[ChartContextMenu] Module loaded with event listener');
})();

