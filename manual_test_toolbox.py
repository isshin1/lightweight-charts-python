import sys
import pandas as pd
from PyQt6.QtWidgets import QApplication
from lightweight_charts.widgets import QtChart

if __name__ == '__main__':
    app = QApplication(sys.argv)
    
    chart = QtChart(toolbox=True)
    
    df = pd.read_csv('lightweight-charts-python/examples/1_setting_data/ohlcv.csv')
    chart.set(df)
    

    chart.layout(
        background_color='#ffffff',
        text_color='#000000',
        font_size=16,
        font_family='Helvetica'
    )
    
    chart.candle_style(
        up_color='#089981',
        down_color='#F23645',
        border_up_color='#089981',
        border_down_color='#F23645',
        wick_up_color='#089981',
        wick_down_color='#F23645'
    )
    
    chart.volume_config(up_color='#089981', down_color='#F23645')
    
    
    chart.grid(color='rgba(29, 30, 38, .1)')
    
    chart.legend(visible=True, font_size=14, color='#000000')


    chart.get_webview().show()
    
    # Updated instructions
    print("Please follow these steps to verify:")
    print("TEST 1: Tool Deactivation")
    print("1. Click on a tool in the toolbox (e.g., Trend Line).")
    print("2. Verify the cursor changes to crosshair.")
    print("3. Press 'Escape'.")
    print("4. Verify the tool is deselected and cursor returns to normal.")
    
    print("\nTEST 2: Sticky Tool Check")
    print("1. Select a tool (e.g., Trend Line).")
    print("2. Click on the chart to start drawing (place the first point).")
    print("3. Press 'Escape'.")
    print("4. Verify the tool stays ACTIVE (icon still highlighted) and drawing is NOT cancelled.")

    print("\nTEST 3: Shift Key Horizontal Constraint")
    print("1. Select Trend Line or Ray Line.")
    print("2. Click to place the first point.")
    print("3. Hold 'Shift'.")
    print("4. Move mouse up and down. Verify line remains horizontal (snapped to y-coord of 1st point).")
    print("5. Release 'Shift'. Verify line moves freely again.")
    print("6. Hold 'Shift' and click. Verify stored line is horizontal.
- **Support for Editing**: Click an existing line, drag a point, hold Shift. It should snap to the other point's level.

TEST 4: Clear All Drawings
1. Create multiple drawings.
2. Click the new "Trash" icon in the toolbox.
3. Accept the confirmation dialog ("Delete all drawings?").
4. Verify all drawings are removed.

TEST 5: Text Tool Input Modal
1. Select Text Tool ('T' icon).
2. Click on chart.
3. Verify an in-window modal appears asking for text.
4. Enter text and click OK. Verify text appears.
5. Double-click the text. Verify modal reappears.
6. Edit text and click OK. Verify update.")
    
    sys.exit(app.exec())
