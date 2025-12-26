
import json
import os

workflow_path = 'c:/development/clipmonetization-antigravity/workflow_main.json'
js_path = 'c:/development/clipmonetization-antigravity/temp_workflow_js.js'

try:
    with open(js_path, 'r', encoding='utf-8') as f:
        js_content = f.read()

    with open(workflow_path, 'r', encoding='utf-8') as f:
        workflow_lines = f.readlines()

    # Find the line with "jsCode": ...
    target_line_idx = -1
    for i, line in enumerate(workflow_lines):
        if '"jsCode":' in line and (400 <= i <= 410): # Heuristic check around line 405
            target_line_idx = i
            break
            
    if target_line_idx == -1:
         # Fallback search if line numbers shifted slightly
        for i, line in enumerate(workflow_lines):
            if '"jsCode":' in line and "VIDEO EDIT PLANNER" in line:
                target_line_idx = i
                break
    
    if target_line_idx != -1:
        print(f"Found jsCode at line {target_line_idx + 1}")
        
        # Construct the new line preserving indentation
        # The line usually looks like:                 "jsCode": "..."
        # We need to detect indentation
        original_line = workflow_lines[target_line_idx]
        indentation = original_line.split('"jsCode"')[0]
        
        # Proper JSON escaping of the JS content
        escaped_js = json.dumps(js_content) 
        
        # json.dumps adds surrounding quotes, so we just use it
        new_line = f'{indentation}"jsCode": {escaped_js}\n'
        
        workflow_lines[target_line_idx] = new_line
        
        with open(workflow_path, 'w', encoding='utf-8') as f:
            f.writelines(workflow_lines)
            
        print("Successfully updated workflow_main.json")
    else:
        print("Error: Could not find target 'jsCode' line in workflow_main.json")
        exit(1)

except Exception as e:
    print(f"An error occurred: {e}")
    exit(1)
