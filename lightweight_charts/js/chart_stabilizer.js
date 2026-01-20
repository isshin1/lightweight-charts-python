/**
 * Chart Stabilizer Module - Fixed Approach
 * 
 * Instead of re-enabling autoScale (which triggers margin recalculation loops),
 * we keep autoScale disabled and manually set the price range once after data loads.
 */

(function (window) {
  'use strict';

  const CONFIG = {
    stabilizationDelay: 500,
    debounceDelay: 300,
    debug: true,
    // If true, keep autoScale disabled and manually fit price range
    // If false, re-enable autoScale (may cause shifting)
    manualFitMode: true
  };

  const log = (...args) => {
    if (CONFIG.debug) console.log('[ChartStabilizer]', ...args);
  };

  class ChartStabilizer {
    constructor(handler) {
      this.handler = handler;
      this.chart = handler.chart;
      this.series = handler.series;
      this.volumeSeries = handler.volumeSeries;
      this.isStabilizing = false;
      this.stabilizationTimer = null;
      this.debounceTimer = null;
      this.dataLoadCount = 0;
      this.hasInitialData = false;

      log('Initialized for handler:', handler.id);

      this._hookIntoSeries();
      this._hookIntoVolumeSeries();
    }

    _hookIntoSeries() {
      if (!this.series) return;

      const originalSetData = this.series.setData.bind(this.series);
      const stabilizer = this;

      this.series.setData = function (data) {
        stabilizer.dataLoadCount++;
        log('series.setData called, count:', stabilizer.dataLoadCount, 'data points:', data?.length);

        // Disable auto-scale before setting data
        stabilizer._disableAutoScale();

        const result = originalSetData(data);
        stabilizer.hasInitialData = true;

        // Schedule stabilization
        stabilizer._scheduleStabilization();

        return result;
      };

      log('Hooked into series.setData');
    }

    _hookIntoVolumeSeries() {
      if (!this.volumeSeries) {
        log('No volumeSeries to hook into');
        return;
      }

      const originalSetData = this.volumeSeries.setData.bind(this.volumeSeries);
      const stabilizer = this;

      this.volumeSeries.setData = function (data) {
        log('volumeSeries.setData called, data points:', data?.length);
        const result = originalSetData(data);
        stabilizer._scheduleStabilization();
        return result;
      };

      log('Hooked into volumeSeries.setData');
    }

    _disableAutoScale() {
      try {
        const priceScale = this.series?.priceScale();
        if (priceScale && priceScale.options().autoScale !== false) {
          priceScale.applyOptions({ autoScale: false });
          log('Disabled autoScale');
          this.isStabilizing = true;
        }
      } catch (e) {
        log('Error disabling auto-scale:', e);
      }
    }

    _scheduleStabilization() {
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      if (this.stabilizationTimer) clearTimeout(this.stabilizationTimer);

      this.debounceTimer = setTimeout(() => {
        log('Debounce complete, scheduling stabilization...');

        this.stabilizationTimer = setTimeout(() => {
          this._stabilize();
        }, CONFIG.stabilizationDelay);

      }, CONFIG.debounceDelay);
    }

    _stabilize() {
      log('Stabilizing...');

      try {
        if (CONFIG.manualFitMode) {
          // Manual fit: Calculate visible price range and set it manually
          this._manualFitPriceRange();
        } else {
          // Re-enable autoScale (may cause shifting)
          this._enableAutoScale();
        }
      } catch (e) {
        log('Error during stabilization:', e);
      }

      this.isStabilizing = false;
      this.stabilizationTimer = null;
      this.debounceTimer = null;
    }

    _manualFitPriceRange() {
      try {
        const priceScale = this.series?.priceScale();
        if (!priceScale) return;

        // Get current data
        const data = this.series.data?.() || [];
        if (data.length === 0) {
          log('No data to fit price range');
          return;
        }

        // Calculate min/max from visible data
        const timeScale = this.chart.timeScale();
        const visibleRange = timeScale.getVisibleLogicalRange();

        if (!visibleRange) {
          log('No visible range, fitting content first');
          timeScale.fitContent();
          return;
        }

        // Get visible bars
        let minPrice = Infinity;
        let maxPrice = -Infinity;

        for (let i = Math.max(0, Math.floor(visibleRange.from)); i <= Math.min(data.length - 1, Math.ceil(visibleRange.to)); i++) {
          const bar = data[i];
          if (bar) {
            const high = bar.high || bar.value || bar.close || 0;
            const low = bar.low || bar.value || bar.close || 0;
            minPrice = Math.min(minPrice, low);
            maxPrice = Math.max(maxPrice, high);
          }
        }

        if (minPrice !== Infinity && maxPrice !== -Infinity) {
          // Add padding (similar to autoScale margins)
          const range = maxPrice - minPrice;
          const padding = range * 0.1; // 10% padding

          // Set manual price range - keep autoScale disabled
          // This avoids the margin recalculation loop
          log('Manual fit: price range', minPrice - padding, 'to', maxPrice + padding);

          // Note: There's no direct setPriceRange, but we can use scaleMargins
          // For now, just enable autoScale briefly then disable
          priceScale.applyOptions({ autoScale: true });

          // Use requestAnimationFrame to let it settle
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              priceScale.applyOptions({ autoScale: false });
              log('Manual fit complete - autoScale disabled');
            });
          });
        }
      } catch (e) {
        log('Error in manual fit:', e);
      }
    }

    _enableAutoScale() {
      try {
        const priceScale = this.series?.priceScale();
        if (priceScale) {
          priceScale.applyOptions({ autoScale: true });
          log('Re-enabled autoScale');
        }
      } catch (e) {
        log('Error enabling auto-scale:', e);
      }
    }

    forceStabilize() {
      log('Force stabilize called');
      if (this.stabilizationTimer) clearTimeout(this.stabilizationTimer);
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this._stabilize();
    }

    cancel() {
      if (this.stabilizationTimer) clearTimeout(this.stabilizationTimer);
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.isStabilizing = false;
    }

    static configure(options) {
      Object.assign(CONFIG, options);
      log('Config updated:', CONFIG);
    }
  }

  function createStabilizer(handler) {
    if (!handler || !handler.chart || !handler.series) {
      console.warn('[ChartStabilizer] Invalid handler provided');
      return null;
    }
    return new ChartStabilizer(handler);
  }

  window.ChartStabilizer = ChartStabilizer;
  window.createChartStabilizer = createStabilizer;

  log('Module loaded');

})(window);
