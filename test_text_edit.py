#!/usr/bin/env python3
"""
Test script for text annotation editing with PyQt6 input dialog
"""
import json
import pandas as pd
from PyQt6.QtWidgets import QApplication, QInputDialog
from lightweight_charts import Chart
import sys

# Create QApplication first (required for QInputDialog)
app = QApplication(sys.argv)

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
    """
    try:
        # Parse the JSON data
        data = json.loads(data_str)
        current_text = data.get('currentText', 'Text')
        time = data.get('time')
        logical = data.get('logical')
        price = data.get('price')
        
        print(f"\n📝 Text Annotation Edit Request:")
        print(f"   Time: {time}")
        print(f"   Logical: {logical}")
        print(f"   Price: {price}")
        print(f"   Current Text: {current_text}")
        
        # Show PyQt6 input dialog
        new_text, ok = QInputDialog.getText(
            None,  # parent widget
            "Edit Text Annotation",  # dialog title
            f"Edit text at price {price:.2f}:",  # label
            text=current_text  # default text
        )
        
        if ok and new_text:
            print(f"   ✅ New Text: {new_text}")
            # TODO: Update the text annotation in the chart
            # This would require adding a method to update text annotations
            # For now, we just print the result
        else:
            print(f"   ❌ Edit cancelled")
            
    except json.JSONDecodeError as e:
        print(f"Error parsing JSON data: {e}")
    except Exception as e:
        print(f"Error handling text annotation edit: {e}")

# Register the callback
# The callback name pattern is: edit_text_annotation_~_{JSON_data}
# We need to intercept this in the chart's callback handler
original_callback = chart._win.handlers.get('edit_text_annotation', None)

def callback_wrapper(data):
    """Wrapper to handle the edit_text_annotation callback"""
    on_edit_text_annotation(data)

# Register our callback
chart._win.handlers['edit_text_annotation'] = callback_wrapper

print("\n✅ Chart created successfully!")
print("\nText Annotation Tool Usage:")
print("  1. Press Alt+A or click the 'T' button in the toolbox")
print("  2. Click anywhere on the chart to place a text annotation")
print("  3. Double-click the text annotation to edit it")
print("  4. A PyQt6 input dialog will appear for editing")
print("\nOther drawing tools:")
print("  Alt+T - Trend line")
print("  Alt+H - Horizontal line")
print("  Alt+R - Ray line")
print("  Alt+B - Box")
print("  Alt+V - Vertical line")
print("  Alt+A - Text annotation")

# Show the chart
chart.show(block=True)
