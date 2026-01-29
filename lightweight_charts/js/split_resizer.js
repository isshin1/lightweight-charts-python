/**
 * Split Resizer Module
 * Provides drag-to-resize functionality for split charts.
 * 
 * Supports:
 * - 2-chart horizontal split (left/right)
 * - 2-chart vertical split (top/bottom)
 * - 3-chart layouts (3_left_big, 3_top_big, etc.)
 * - 4-chart grid layout
 */

(function () {
  'use strict';

  // Configuration
  const MIN_RATIO = 0.15;  // 15% minimum
  const MAX_RATIO = 0.85;  // 85% maximum
  const DIVIDER_SIZE = 6;  // pixels - wide enough to grab easily

  // Store active dividers
  let activeDividers = [];

  // Store layout state global (for highlighter)
  let g_mode = 'single';
  let g_charts = {};
  let g_hRatio = 0.5;
  let g_vRatio = 0.5;
  let g_activeIndex = -1;
  let g_activeBorderConfig = { color: '#3498db', width: 2 };
  let g_activeOverlay = null;

  /**
   * Create or update the active chart highlight overlay
   */
  function updateHighlight() {
    if (g_activeIndex < 0) {
      if (g_activeOverlay) g_activeOverlay.style.display = 'none';
      return;
    }

    const container = window.containerDiv;
    if (!container) return;

    if (!g_activeOverlay) {
      g_activeOverlay = document.createElement('div');
      g_activeOverlay.className = 'chart-highlight-overlay';
      g_activeOverlay.style.position = 'absolute';
      g_activeOverlay.style.zIndex = '200000'; // Above dividers (100000)
      g_activeOverlay.style.pointerEvents = 'none'; // Allow clicks to pass through
      g_activeOverlay.style.boxSizing = 'border-box';
      container.appendChild(g_activeOverlay);
    }

    g_activeOverlay.style.display = 'block';
    g_activeOverlay.style.border = g_activeBorderConfig.width + 'px solid ' + g_activeBorderConfig.color;

    // Calculate position based on mode and index
    let style = { top: '0', left: '0', width: '0', height: '0' };

    // Helper for applying styles
    const setRect = (top, left, width, height) => {
      g_activeOverlay.style.top = top;
      g_activeOverlay.style.left = left;
      g_activeOverlay.style.width = width;
      g_activeOverlay.style.height = height;
    };

    // Logic mirroring updateLayout
    const hR = g_hRatio * 100 + '%';
    const hRInv = (1 - g_hRatio) * 100 + '%';
    const vR = g_vRatio * 100 + '%';
    const vRInv = (1 - g_vRatio) * 100 + '%';

    switch (g_mode) {
      case 'split_h':
        if (g_activeIndex == 0) setRect('0', '0', hR, '100%');
        else if (g_activeIndex == 1) setRect('0', hR, hRInv, '100%');
        break;
      case 'split_v':
        if (g_activeIndex == 0) setRect('0', '0', '100%', vR);
        else if (g_activeIndex == 2) setRect(vR, '0', '100%', vRInv);
        break;
      case '3_left_big':
        if (g_activeIndex == 0) setRect('0', '0', hR, '100%');
        else if (g_activeIndex == 1) setRect('0', hR, hRInv, vR);
        else if (g_activeIndex == 3) setRect(vR, hR, hRInv, vRInv);
        break;
      case '3_top_big':
        if (g_activeIndex == 0) setRect('0', '0', '100%', vR);
        else if (g_activeIndex == 2) setRect(vR, '0', hR, vRInv);
        else if (g_activeIndex == 3) setRect(vR, hR, hRInv, vRInv);
        break;
      case '3_right_big':
        if (g_activeIndex == 1) setRect('0', hR, hRInv, '100%');
        else if (g_activeIndex == 0) setRect('0', '0', hR, vR);
        else if (g_activeIndex == 2) setRect(vR, '0', hR, vRInv);
        break;
      case '3_bottom_big':
        if (g_activeIndex == 2) setRect(vR, '0', '100%', vRInv);
        else if (g_activeIndex == 0) setRect('0', '0', hR, vR);
        else if (g_activeIndex == 1) setRect('0', hR, hRInv, vR);
        break;
      case 'grid':
        if (g_activeIndex == 0) setRect('0', '0', hR, vR);
        else if (g_activeIndex == 1) setRect('0', hR, hRInv, vR);
        else if (g_activeIndex == 2) setRect(vR, '0', hR, vRInv);
        else if (g_activeIndex == 3) setRect(vR, hR, hRInv, vRInv);
        break;
      default:
        g_activeOverlay.style.display = 'none';
    }
  }

  /**
   * Set active chart highlight
   */
  function setHighlight(index, config) {
    g_activeIndex = parseInt(index);
    if (config) {
      if (config.color) g_activeBorderConfig.color = config.color;
      if (config.width) g_activeBorderConfig.width = config.width;
    }
    updateHighlight();
  }


  /**
   * Remove all existing dividers
   */
  function clearDividers() {
    activeDividers.forEach(function (d) {
      if (d && d.element) {
        d.element.remove();
      }
    });
    activeDividers = [];
  }

  /**
   * Clear the highlight overlay (called when returning to single-chart mode)
   */
  function clearHighlight() {
    g_mode = 'single';
    g_activeIndex = -1;
    if (g_activeOverlay) {
      g_activeOverlay.style.display = 'none';
    }
  }

  /**
   * Create a divider element
   * @param {string} orientation - 'horizontal' or 'vertical'
   */
  function createDivider(orientation) {
    const isVertical = (orientation === 'vertical');

    const divider = document.createElement('div');
    divider.className = 'split-divider';
    divider.style.position = 'absolute';
    divider.style.zIndex = '100000';  // Very high z-index to ensure above charts
    divider.style.transition = 'background-color 0.15s';
    divider.style.backgroundColor = '#ffffff';  // [FIX] Changed to white as requested
    divider.style.pointerEvents = 'auto';  // Ensure clickable

    if (isVertical) {
      // Horizontal bar for vertical split (divides top/bottom)
      divider.style.left = '0';
      divider.style.width = '100%';  // Use explicit width instead of left:0;right:0
      divider.style.height = DIVIDER_SIZE + 'px';
      divider.style.cursor = 'row-resize';
      console.log('[SplitResizer] Created VERTICAL divider (horizontal bar)');
    } else {
      // Vertical bar for horizontal split (divides left/right)
      divider.style.top = '0';
      divider.style.height = '100%';  // Use explicit height instead of top:0;bottom:0
      divider.style.width = DIVIDER_SIZE + 'px';
      divider.style.cursor = 'col-resize';
      console.log('[SplitResizer] Created HORIZONTAL divider (vertical bar)');
    }

    // Add grip indicator
    const grip = document.createElement('div');
    grip.className = 'split-divider-grip';
    grip.style.position = 'absolute';
    grip.style.left = '50%';
    grip.style.top = '50%';
    grip.style.transform = 'translate(-50%, -50%)';
    grip.style.backgroundColor = '#555';
    grip.style.borderRadius = '2px';
    grip.style.pointerEvents = 'none';

    if (isVertical) {
      grip.style.width = '40px';
      grip.style.height = '4px';
    } else {
      grip.style.width = '4px';
      grip.style.height = '40px';
    }

    divider.appendChild(grip);

    return { element: divider, grip: grip, orientation: orientation };
  }

  /**
   * Initialize resizers based on layout mode
   * @param {string} mode - Layout mode (split_h, split_v, 3_left_big, grid, etc.)
   * @param {Object} charts - Object with chart references {c0, c1, c2, c3}
   * @param {Function} onRatioChange - Callback(axis, ratio) when ratio changes
   */
  function initLayoutResizers(mode, charts, onRatioChange) {
    const container = window.containerDiv;
    if (!container) {
      console.error('[SplitResizer] Cannot find window.containerDiv');
      return null;
    }

    // Store layout state
    g_mode = mode;
    g_charts = charts;

    // Clear existing dividers
    clearDividers();

    // Get current ratios from chart positions based on mode
    function getHRatio() {
      if (charts.c0 && charts.c0.wrapper) {
        const w = parseFloat(charts.c0.wrapper.style.width) || 50;
        return w / 100;
      }
      return 0.5;
    }

    function getVRatio() {
      // For 3_right_big mode: chart 0 and chart 2 are stacked on left (each 50% height)
      // Chart 1 is full height on right, so we read from chart 0's height
      // For 3_left_big mode: chart 1 and chart 3 are stacked on right (each 50% height)
      // Chart 0 is full height on left, so we read from chart 1's height

      // Check current mode to determine which chart to read height from
      if (g_mode === '3_right_big') {
        // In 3_right_big, chart 0 has the actual vertical split ratio
        if (charts.c0 && charts.c0.wrapper) {
          const h = parseFloat(charts.c0.wrapper.style.height) || 50;
          return h / 100;
        }
      } else if (g_mode === '3_left_big') {
        // In 3_left_big, chart 1 has the actual vertical split ratio
        if (charts.c1 && charts.c1.wrapper && parseFloat(charts.c1.wrapper.style.height) > 0) {
          const h = parseFloat(charts.c1.wrapper.style.height) || 50;
          return h / 100;
        }
      }

      // Fallback: try chart 1 first, then chart 0
      if (charts.c1 && charts.c1.wrapper && parseFloat(charts.c1.wrapper.style.height) > 0 && parseFloat(charts.c1.wrapper.style.height) < 100) {
        const h = parseFloat(charts.c1.wrapper.style.height) || 50;
        return h / 100;
      }
      if (charts.c0 && charts.c0.wrapper && parseFloat(charts.c0.wrapper.style.height) < 100) {
        const h = parseFloat(charts.c0.wrapper.style.height) || 50;
        return h / 100;
      }
      return 0.5;
    }

    let hRatio = getHRatio();
    let vRatio = getVRatio();

    // Sync globals
    g_hRatio = hRatio;
    g_vRatio = vRatio;

    console.log('[SplitResizer] Raw ratios - hRatio:', hRatio, 'vRatio:', vRatio, 'mode:', mode);

    // For 3-chart layouts, ensure we have reasonable default ratios
    if (mode === '3_left_big' || mode === '3_right_big') {
      // vRatio should be for the vertical split on the side
      // Use > 0.9 to catch floating point edge cases
      if (vRatio > 0.9 || vRatio < 0.1) {
        console.log('[SplitResizer] Fixing vRatio from', vRatio, 'to 0.5');
        vRatio = 0.5;
      }
    } else if (mode === '3_top_big' || mode === '3_bottom_big') {
      // hRatio should be for the horizontal split on the side
      if (hRatio > 0.9 || hRatio < 0.1) {
        console.log('[SplitResizer] Fixing hRatio from', hRatio, 'to 0.5');
        hRatio = 0.5;
      }
    }

    // Determine which dividers to create based on mode
    let needsHDivider = false;  // Vertical bar (resizes left/right)
    let needsVDivider = false;  // Horizontal bar (resizes top/bottom)
    let hDividerScope = 'full';  // 'full' or 'right' or 'left'
    let vDividerScope = 'full';  // 'full' or 'top' or 'bottom'

    switch (mode) {
      case 'split_h':
        needsHDivider = true;
        break;
      case 'split_v':
        needsVDivider = true;
        break;
      case '3_left_big':
        needsHDivider = true;
        needsVDivider = true;
        vDividerScope = 'right';  // Only affects right side
        break;
      case '3_top_big':
        needsHDivider = true;
        needsVDivider = true;
        hDividerScope = 'bottom';  // Only affects bottom side
        break;
      case '3_right_big':
        needsHDivider = true;
        needsVDivider = true;
        vDividerScope = 'left';  // Only affects left side
        break;
      case '3_bottom_big':
        needsHDivider = true;
        needsVDivider = true;
        hDividerScope = 'top';  // Only affects top side
        break;
      case 'grid':
        needsHDivider = true;
        needsVDivider = true;
        break;
      default:
        // Single mode - no dividers
        return null;
    }

    // Create horizontal divider (vertical bar)
    if (needsHDivider) {
      const hDiv = createDivider('horizontal');
      hDiv.element.style.left = (hRatio * 100) + '%';
      hDiv.element.style.transform = 'translateX(-50%)';

      // Scope the divider height for 3-chart layouts
      if (hDividerScope === 'top') {
        hDiv.element.style.top = '0';
        hDiv.element.style.height = (vRatio * 100) + '%';
      } else if (hDividerScope === 'bottom') {
        hDiv.element.style.top = (vRatio * 100) + '%';
        hDiv.element.style.height = ((1 - vRatio) * 100) + '%';
      } else {
        // Full height (default for split_h and grid)
        hDiv.element.style.top = '0';
        hDiv.element.style.height = '100%';
      }

      container.appendChild(hDiv.element);
      activeDividers.push(hDiv);

      // Handlers will be added after all dividers are created
    }

    // Create vertical divider (horizontal bar)
    if (needsVDivider) {
      const vDiv = createDivider('vertical');
      vDiv.element.style.top = (vRatio * 100) + '%';
      vDiv.element.style.transform = 'translateY(-50%)';

      // Scope the divider width for 3-chart layouts
      if (vDividerScope === 'left') {
        vDiv.element.style.left = '0';
        vDiv.element.style.width = (hRatio * 100) + '%';
      } else if (vDividerScope === 'right') {
        vDiv.element.style.left = (hRatio * 100) + '%';
        vDiv.element.style.width = ((1 - hRatio) * 100) + '%';
      } else {
        // Full width (default for split_v and grid)
        vDiv.element.style.left = '0';
        vDiv.element.style.width = '100%';
      }

      container.appendChild(vDiv.element);
      console.log('[SplitResizer] Appended vDivider at top:', vDiv.element.style.top, 'dims:', vDiv.element.offsetWidth, 'x', vDiv.element.offsetHeight);
      activeDividers.push(vDiv);

      // Handlers will be added after all dividers are created
    }

    console.log('[SplitResizer] Initialized for mode:', mode, 'hDivider:', needsHDivider, 'vDivider:', needsVDivider, 'hRatio:', hRatio, 'vRatio:', vRatio);

    // Store divider references for updating during drag
    let hDivRef = activeDividers.find(d => d.orientation === 'horizontal');
    let vDivRef = activeDividers.find(d => d.orientation === 'vertical');

    // Function to update scoped divider dimensions
    function updateDividerScopes() {
      // Update hDivider scope if it exists and is scoped
      if (hDivRef && hDividerScope !== 'full') {
        if (hDividerScope === 'top') {
          hDivRef.element.style.height = (vRatio * 100) + '%';
        } else if (hDividerScope === 'bottom') {
          hDivRef.element.style.top = (vRatio * 100) + '%';
          hDivRef.element.style.height = ((1 - vRatio) * 100) + '%';
        }
      }

      // Update vDivider scope if it exists and is scoped
      if (vDivRef && vDividerScope !== 'full') {
        if (vDividerScope === 'left') {
          vDivRef.element.style.width = (hRatio * 100) + '%';
        } else if (vDividerScope === 'right') {
          vDivRef.element.style.left = (hRatio * 100) + '%';
          vDivRef.element.style.width = ((1 - hRatio) * 100) + '%';
        }
      }
    }

    // Override the drag handlers to also update scoped divider dimensions
    if (hDivRef) {
      setupDragHandlers(hDivRef, 'horizontal', function (ratio) {
        hRatio = ratio;
        updateLayout(mode, charts, hRatio, vRatio);
        updateDividerScopes();  // Update vDivider scope
        if (onRatioChange) onRatioChange('horizontal', ratio);
      }, container);
    }

    if (vDivRef) {
      setupDragHandlers(vDivRef, 'vertical', function (ratio) {
        vRatio = ratio;
        updateLayout(mode, charts, hRatio, vRatio);
        updateDividerScopes();  // Update hDivider scope
        if (onRatioChange) onRatioChange('vertical', ratio);
      }, container);
    }

    return {
      setHRatio: function (r) { hRatio = r; updateLayout(mode, charts, hRatio, vRatio); updateDividerScopes(); },
      setVRatio: function (r) { vRatio = r; updateLayout(mode, charts, hRatio, vRatio); updateDividerScopes(); },
      destroy: clearDividers
    };
  }

  /**
   * Setup drag handlers for a divider
   */
  function setupDragHandlers(dividerObj, axis, onDrag, container) {
    const divider = dividerObj.element;
    const grip = dividerObj.grip;
    const isVertical = (axis === 'vertical');
    let isDragging = false;

    divider.addEventListener('mouseenter', function () {
      if (!isDragging) {
        divider.style.backgroundColor = '#3498db';
        grip.style.backgroundColor = '#ffffff';
      }
    });

    divider.addEventListener('mouseleave', function () {
      if (!isDragging) {
        divider.style.backgroundColor = '#ffffff';
        grip.style.backgroundColor = '#555';
      }
    });

    divider.addEventListener('mousedown', function (e) {
      e.preventDefault();
      e.stopPropagation();
      isDragging = true;

      divider.style.backgroundColor = 'rgba(52, 152, 219, 0.8)';
      grip.style.backgroundColor = '#3498db';

      document.body.style.cursor = isVertical ? 'row-resize' : 'col-resize';
      document.body.style.userSelect = 'none';

      function onMouseMove(e) {
        if (!isDragging) return;

        const rect = container.getBoundingClientRect();
        let ratio;

        if (isVertical) {
          ratio = (e.clientY - rect.top) / rect.height;
        } else {
          ratio = (e.clientX - rect.left) / rect.width;
        }

        ratio = Math.max(MIN_RATIO, Math.min(MAX_RATIO, ratio));

        // Update divider position
        if (isVertical) {
          divider.style.top = (ratio * 100) + '%';
        } else {
          divider.style.left = (ratio * 100) + '%';
        }

        onDrag(ratio);
      }

      function onMouseUp() {
        if (!isDragging) return;
        isDragging = false;
        divider.style.backgroundColor = '#ffffff';
        grip.style.backgroundColor = '#555';
        document.body.style.cursor = '';
        document.body.style.userSelect = '';

        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      }

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  /**
   * Helper to resize a chart's internal canvas to match its wrapper
   */
  function resizeChart(chartObj) {
    if (!chartObj || !chartObj.wrapper || !chartObj.chart) return;

    // Get the actual pixel dimensions of the wrapper
    const rect = chartObj.wrapper.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      try {
        chartObj.chart.resize(rect.width, rect.height);
      } catch (e) {
        console.log('[SplitResizer] Chart resize error:', e);
      }
    }
  }

  /**
   * Update chart layout based on mode and ratios
   */
  function updateLayout(mode, charts, hRatio, vRatio) {
    // [FIX] Update globals so highlighter knows where to draw
    g_hRatio = hRatio;
    g_vRatio = vRatio;

    const c0 = charts.c0, c1 = charts.c1, c2 = charts.c2, c3 = charts.c3;

    switch (mode) {
      case 'split_h':
        if (c0 && c0.wrapper) {
          c0.wrapper.style.width = (hRatio * 100) + '%';
          c0.wrapper.style.left = '0';
        }
        if (c1 && c1.wrapper) {
          c1.wrapper.style.width = ((1 - hRatio) * 100) + '%';
          c1.wrapper.style.left = (hRatio * 100) + '%';
        }
        break;

      case 'split_v':
        if (c0 && c0.wrapper) {
          c0.wrapper.style.height = (vRatio * 100) + '%';
          c0.wrapper.style.top = '0';
        }
        if (c2 && c2.wrapper) {
          c2.wrapper.style.height = ((1 - vRatio) * 100) + '%';
          c2.wrapper.style.top = (vRatio * 100) + '%';
        }
        break;

      case '3_left_big':
        // Chart 0: left (full height)
        // Chart 1: right-top
        // Chart 3: right-bottom
        if (c0 && c0.wrapper) {
          c0.wrapper.style.width = (hRatio * 100) + '%';
          c0.wrapper.style.height = '100%';
          c0.wrapper.style.left = '0';
          c0.wrapper.style.top = '0';
        }
        if (c1 && c1.wrapper) {
          c1.wrapper.style.width = ((1 - hRatio) * 100) + '%';
          c1.wrapper.style.height = (vRatio * 100) + '%';
          c1.wrapper.style.left = (hRatio * 100) + '%';
          c1.wrapper.style.top = '0';
        }
        if (c3 && c3.wrapper) {
          c3.wrapper.style.width = ((1 - hRatio) * 100) + '%';
          c3.wrapper.style.height = ((1 - vRatio) * 100) + '%';
          c3.wrapper.style.left = (hRatio * 100) + '%';
          c3.wrapper.style.top = (vRatio * 100) + '%';
        }
        break;

      case '3_top_big':
        // Chart 0: top (full width)
        // Chart 2: bottom-left
        // Chart 3: bottom-right
        if (c0 && c0.wrapper) {
          c0.wrapper.style.width = '100%';
          c0.wrapper.style.height = (vRatio * 100) + '%';
          c0.wrapper.style.left = '0';
          c0.wrapper.style.top = '0';
        }
        if (c2 && c2.wrapper) {
          c2.wrapper.style.width = (hRatio * 100) + '%';
          c2.wrapper.style.height = ((1 - vRatio) * 100) + '%';
          c2.wrapper.style.left = '0';
          c2.wrapper.style.top = (vRatio * 100) + '%';
        }
        if (c3 && c3.wrapper) {
          c3.wrapper.style.width = ((1 - hRatio) * 100) + '%';
          c3.wrapper.style.height = ((1 - vRatio) * 100) + '%';
          c3.wrapper.style.left = (hRatio * 100) + '%';
          c3.wrapper.style.top = (vRatio * 100) + '%';
        }
        break;

      case '3_right_big':
        // Chart 1: right (full height)
        // Chart 0: left-top
        // Chart 2: left-bottom
        if (c1 && c1.wrapper) {
          c1.wrapper.style.width = ((1 - hRatio) * 100) + '%';
          c1.wrapper.style.height = '100%';
          c1.wrapper.style.left = (hRatio * 100) + '%';
          c1.wrapper.style.top = '0';
        }
        if (c0 && c0.wrapper) {
          c0.wrapper.style.width = (hRatio * 100) + '%';
          c0.wrapper.style.height = (vRatio * 100) + '%';
          c0.wrapper.style.left = '0';
          c0.wrapper.style.top = '0';
        }
        if (c2 && c2.wrapper) {
          c2.wrapper.style.width = (hRatio * 100) + '%';
          c2.wrapper.style.height = ((1 - vRatio) * 100) + '%';
          c2.wrapper.style.left = '0';
          c2.wrapper.style.top = (vRatio * 100) + '%';
        }
        break;

      case '3_bottom_big':
        // Chart 2: bottom (full width)
        // Chart 0: top-left
        // Chart 1: top-right
        if (c2 && c2.wrapper) {
          c2.wrapper.style.width = '100%';
          c2.wrapper.style.height = ((1 - vRatio) * 100) + '%';
          c2.wrapper.style.left = '0';
          c2.wrapper.style.top = (vRatio * 100) + '%';
        }
        if (c0 && c0.wrapper) {
          c0.wrapper.style.width = (hRatio * 100) + '%';
          c0.wrapper.style.height = (vRatio * 100) + '%';
          c0.wrapper.style.left = '0';
          c0.wrapper.style.top = '0';
        }
        if (c1 && c1.wrapper) {
          c1.wrapper.style.width = ((1 - hRatio) * 100) + '%';
          c1.wrapper.style.height = (vRatio * 100) + '%';
          c1.wrapper.style.left = (hRatio * 100) + '%';
          c1.wrapper.style.top = '0';
        }
        break;

      case 'grid':
        // 2x2 grid
        if (c0 && c0.wrapper) {
          c0.wrapper.style.width = (hRatio * 100) + '%';
          c0.wrapper.style.height = (vRatio * 100) + '%';
          c0.wrapper.style.left = '0';
          c0.wrapper.style.top = '0';
        }
        if (c1 && c1.wrapper) {
          c1.wrapper.style.width = ((1 - hRatio) * 100) + '%';
          c1.wrapper.style.height = (vRatio * 100) + '%';
          c1.wrapper.style.left = (hRatio * 100) + '%';
          c1.wrapper.style.top = '0';
        }
        if (c2 && c2.wrapper) {
          c2.wrapper.style.width = (hRatio * 100) + '%';
          c2.wrapper.style.height = ((1 - vRatio) * 100) + '%';
          c2.wrapper.style.left = '0';
          c2.wrapper.style.top = (vRatio * 100) + '%';
        }
        if (c3 && c3.wrapper) {
          c3.wrapper.style.width = ((1 - hRatio) * 100) + '%';
          c3.wrapper.style.height = ((1 - vRatio) * 100) + '%';
          c3.wrapper.style.left = (hRatio * 100) + '%';
          c3.wrapper.style.top = (vRatio * 100) + '%';
        }
        break;
    }

    // After CSS changes, trigger chart internal resize
    // Use requestAnimationFrame to ensure CSS has been applied
    requestAnimationFrame(function () {
      resizeChart(c0);
      resizeChart(c1);
      resizeChart(c2);
      resizeChart(c3);
      updateHighlight(); // Update highlight position
    });
  }

  // Expose globally
  window.initLayoutResizers = initLayoutResizers;
  window.clearSplitResizers = clearDividers;
  window.clearHighlight = clearHighlight;
  window.setHighlight = setHighlight;

  console.log('[SplitResizer] Module loaded (multi-layout support) + Highlighting');
})();
