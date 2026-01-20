/**
 * Split Resizer Module
 * Provides drag-to-resize functionality for split charts.
 * 
 * This module creates a draggable divider between two charts that allows
 * users to adjust the split ratio by dragging.
 */

(function () {
  'use strict';

  // Configuration
  const MIN_RATIO = 0.1;  // 10% minimum
  const MAX_RATIO = 0.9;  // 90% maximum
  const DIVIDER_WIDTH = 4; // pixels - wide enough to grab easily

  /**
   * Initialize the split resizer for two charts.
   * @param {Object} chart0 - The left chart object (must have wrapper property)
   * @param {Object} chart1 - The right chart object (must have wrapper property)
   * @param {Function} onRatioChange - Callback when ratio changes (receives float 0-1)
   */
  function initSplitResizer(chart0, chart1, onRatioChange) {
    if (!chart0 || !chart1 || !chart0.wrapper || !chart1.wrapper) {
      console.error('[SplitResizer] Invalid chart objects provided');
      return null;
    }

    // Use window.containerDiv as the parent for all chart wrappers
    const container = window.containerDiv;
    if (!container) {
      console.error('[SplitResizer] Cannot find window.containerDiv');
      return null;
    }

    console.log('[SplitResizer] Container found:', container);

    // Remove existing divider if present
    const existingDivider = container.querySelector('.split-divider');
    if (existingDivider) {
      existingDivider.remove();
    }

    // Create the divider element
    const divider = document.createElement('div');
    divider.className = 'split-divider';
    divider.style.position = 'absolute';
    divider.style.top = '0';
    divider.style.bottom = '0';
    divider.style.width = DIVIDER_WIDTH + 'px';
    divider.style.cursor = 'col-resize';
    divider.style.backgroundColor = 'rgba(60, 67, 76, 0.3)';  // Subtle visible background
    divider.style.zIndex = '10000';  // Must be above active chart z-index (9999)
    divider.style.transition = 'background-color 0.15s';

    // Add grip indicator
    const grip = document.createElement('div');
    grip.className = 'split-divider-grip';
    grip.style.position = 'absolute';
    grip.style.left = '50%';
    grip.style.top = '50%';
    grip.style.transform = 'translate(-50%, -50%)';
    grip.style.width = '4px';
    grip.style.height = '40px';
    grip.style.backgroundColor = '#3C434C';
    grip.style.borderRadius = '2px';
    grip.style.pointerEvents = 'none';
    divider.appendChild(grip);

    container.appendChild(divider);

    // State
    let isDragging = false;
    let startX = 0;
    let startRatio = 0.5;
    let currentRatio = 0.5;

    // Calculate initial ratio from chart0 width
    function getCurrentRatio() {
      const c0Width = parseFloat(chart0.wrapper.style.width) || 50;
      return c0Width / 100;
    }

    // Update divider position to match current ratio
    function updateDividerPosition(ratio) {
      const left = (ratio * 100) - (DIVIDER_WIDTH / 2 / container.offsetWidth * 100);
      divider.style.left = (ratio * 100) + '%';
      divider.style.transform = 'translateX(-50%)';
    }

    // Update chart widths
    function updateChartWidths(ratio) {
      const leftWidth = ratio * 100;
      const rightWidth = (1 - ratio) * 100;

      chart0.wrapper.style.width = leftWidth + '%';
      chart1.wrapper.style.left = leftWidth + '%';
      chart1.wrapper.style.width = rightWidth + '%';

      updateDividerPosition(ratio);
    }

    // Hover effects
    divider.addEventListener('mouseenter', function () {
      if (!isDragging) {
        divider.style.backgroundColor = 'rgba(0, 122, 255, 0.5)';
        grip.style.backgroundColor = '#007AFF';
      }
    });

    divider.addEventListener('mouseleave', function () {
      if (!isDragging) {
        divider.style.backgroundColor = 'rgba(60, 67, 76, 0.3)';
        grip.style.backgroundColor = '#3C434C';
      }
    });

    // Drag start
    divider.addEventListener('mousedown', function (e) {
      e.preventDefault();
      e.stopPropagation();

      isDragging = true;
      startX = e.clientX;
      startRatio = getCurrentRatio();

      divider.style.backgroundColor = 'rgba(0, 122, 255, 0.7)';
      grip.style.backgroundColor = '#007AFF';
      divider.classList.add('dragging');

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      console.log('[SplitResizer] Drag started at ratio:', startRatio);
    });

    // Drag move (on document to catch moves outside divider)
    document.addEventListener('mousemove', function (e) {
      if (!isDragging) return;

      const containerRect = container.getBoundingClientRect();
      const containerWidth = containerRect.width;

      // Calculate new ratio based on mouse position
      const mouseX = e.clientX - containerRect.left;
      let newRatio = mouseX / containerWidth;

      // Clamp to min/max
      newRatio = Math.max(MIN_RATIO, Math.min(MAX_RATIO, newRatio));

      currentRatio = newRatio;
      updateChartWidths(newRatio);
    });

    // Drag end (on document to catch mouseup anywhere)
    document.addEventListener('mouseup', function (e) {
      if (!isDragging) return;

      isDragging = false;
      divider.style.backgroundColor = 'rgba(60, 67, 76, 0.3)';
      grip.style.backgroundColor = '#3C434C';
      divider.classList.remove('dragging');

      document.body.style.cursor = '';
      document.body.style.userSelect = '';

      console.log('[SplitResizer] Drag ended at ratio:', currentRatio);

      // Notify Python of the new ratio
      if (onRatioChange) {
        onRatioChange(currentRatio);
      }
    });

    // Initialize position
    currentRatio = getCurrentRatio();
    updateDividerPosition(currentRatio);

    console.log('[SplitResizer] Initialized with ratio:', currentRatio);

    // Return control object
    return {
      setRatio: function (ratio) {
        currentRatio = Math.max(MIN_RATIO, Math.min(MAX_RATIO, ratio));
        updateChartWidths(currentRatio);
      },
      getRatio: function () {
        return currentRatio;
      },
      destroy: function () {
        divider.remove();
      },
      show: function () {
        divider.style.display = 'block';
      },
      hide: function () {
        divider.style.display = 'none';
      }
    };
  }

  // Expose globally
  window.initSplitResizer = initSplitResizer;

  console.log('[SplitResizer] Module loaded');
})();
