#!/usr/bin/env python3
"""
Test script for text annotation tool with PyQt6 input dialog integration
"""
import json
import pandas as pd
from PyQt6.QtWidgets import QApplication, QInputDialog
from lightweight_charts import Chart

# Create sample data
df = pd.DataFrame({
    'time': pd.date_range('2024-01-01', periods=100, freq='1h'),
    'open': [100 + i * 0.5 for i in range(100)],
    'high': [102 + i * 0.5 for i in range(100)],
    'low': [98 + i * 0.5 for i in range(100)],
    'close': [101 + i * 0.5 for i in range(100)],
})

# Create chart with toolbox enabled
print("Creating chart with toolbox (including text annotation tool)...")
chart = Chart(toolbox=True)

# Set the data
chart.set(df)

# Define callback handler for text annotation editing
def on_edit_text_annotation(data_str):
    """
    Callback handler for text annotation double-click events.
    Shows a PyQt6 input dialog to edit the text.
    
    Args:
        data_str: JSON string containing point data and current text
    """
    try:
        # Parse the JSON data
        data = json.loads(data_str)
        
        # Extract values - handle both string and object types for currentText
        annotation_id = data.get('id', '')
        current_text = data.get('currentText', 'Text')
        if isinstance(current_text, dict):
            # If currentText is a dict (shouldn't happen), use 'Text' as default
            current_text = 'Text'
        elif not isinstance(current_text, str):
            current_text = str(current_text)
            
        time = data.get('time')
        logical = data.get('logical')
        price = data.get('price', 0)
        
        print(f"\n📝 Text Annotation Edit Request:")
        print(f"   ID: {annotation_id}")
        print(f"   Time: {time}")
        print(f"   Logical: {logical}")
        print(f"   Price: {price:.2f}")
        print(f"   Current Text: '{current_text}'")
        
        # Create QApplication instance if it doesn't exist
        app = QApplication.instance()
        if app is None:
            import sys
            app = QApplication(sys.argv)
        
        # Show PyQt6 input dialog
        new_text, ok = QInputDialog.getText(
            None,  # parent widget
            "Edit Text Annotation",  # dialog title
            f"Edit text at price {price:.2f}:",  # label
            text=str(current_text)  # ensure it's a string
        )
        
        if ok and new_text and new_text != current_text:
            print(f"   ✅ New Text: '{new_text}'")
            
            # Update the text annotation in the chart
            # Call the JavaScript updateTextAnnotation method
            escaped_text = new_text.replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n')
            update_script = f'{chart.id}.toolBox.updateTextAnnotation("{annotation_id}", "{escaped_text}")'
            chart.run_script(update_script)
            
            print(f"   ✅ Text updated successfully in chart!")
        elif ok and new_text == current_text:
            print(f"   ℹ️  Text unchanged")
        else:
            print(f"   ❌ Edit cancelled")
            
    except json.JSONDecodeError as e:
        print(f"❌ Error parsing JSON data: {e}")
        print(f"   Raw data: {data_str}")
    except Exception as e:
        print(f"❌ Error handling text annotation edit: {e}")
        import traceback
        traceback.print_exc()

# Register the callback handler
# The callback name is 'edit_text_annotation' (from TypeScript)
chart.win.handlers['edit_text_annotation'] = on_edit_text_annotation

print("\n✅ Chart created successfully!")
print("\n" + "="*60)
print("TEXT ANNOTATION TOOL - INTERACTIVE EDITING DEMO")
print("="*60)
print("\n📋 Instructions:")
print("  1. Press Alt+A or click the 'T' button in the toolbox")
print("  2. Click anywhere on the chart to place a text annotation")
print("  3. Double-click the text annotation to edit it")
print("  4. A PyQt6 input dialog will appear for editing")
print("  5. Enter new text and press OK")
print("\n🎨 Other drawing tools:")
print("  Alt+T - Trend line")
print("  Alt+H - Horizontal line")
print("  Alt+R - Ray line")
print("  Alt+B - Box")
print("  Alt+V - Vertical line")
print("  Alt+A - Text annotation")
print("\n💡 Tip: You can drag text annotations to reposition them")
print("="*60 + "\n")

# Show the chart

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

chart.show(block=True)
