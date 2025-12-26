import json
import uuid

FILE_PATH = "workflow_main.json"

def load_workflow():
    with open(FILE_PATH, 'r', encoding='utf-8') as f:
        return json.load(f)

def save_workflow(data):
    with open(FILE_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=4)

def fix_workflow():
    workflow = load_workflow()
    
    nodes = workflow.get('nodes', [])
    connections = workflow.get('connections', {})
    
    # 1. Update Gemini Nodes to retryOnFail = true
    gemini_node_names = ["viral clips identification", "Analyze the actual whole video"]
    for node in nodes:
        if node['name'] in gemini_node_names:
            node['retryOnFail'] = True
            # Optional: Add wait functionality if node type supports it parameters 
            # (n8n base nodes usually handle retries with logic, but the property retryOnFail enables system retries)
            print(f"Enabled retryOnFail for {node['name']}")

    # 2. Fix Loop Over Items1 (The second loop)
    loop_node = next((n for n in nodes if n["name"] == "Loop Over Items1"), None)
    if not loop_node:
        print("Error: Could not find 'Loop Over Items1' node")
        return

    # Ensure batchSize is 1
    if "parameters" not in loop_node:
        loop_node["parameters"] = {}
    loop_node["parameters"]["batchSize"] = 1
    print("Set Loop Over Items1 batchSize to 1")

    # 3. Insert Wait Node in the second loop
    # Current connection: Loop Over Items1 (index 1) -> Read clips from disk
    # New connection: Loop Over Items1 (index 1) -> Wait Node 2 -> Read clips from disk
    
    # Find the target node "Read clips from disk"
    read_node = next((n for n in nodes if n["name"] == "Read clips from disk"), None)
    if not read_node:
        # Fallback to checking connections if name changed (unlikely based on logs)
        print("Error: Could not find 'Read clips from disk' node")
        return

    # Check if Wait node already exists (avoid duplicates if re-run)
    existing_wait = next((n for n in nodes if n["name"] == "API Rate Limit 2"), None)
    if existing_wait:
        print("API Rate Limit 2 already exists. Skipping injection.")
        return

    # Create new Wait Node
    wait_node_id = str(uuid.uuid4())
    wait_node = {
        "parameters": {
            "amount": 10,
            "unit": "seconds"
        },
        "id": wait_node_id,
        "name": "API Rate Limit 2",
        "type": "n8n-nodes-base.wait",
        "typeVersion": 1.1,
        "position": [
            loop_node["position"][0] + 100, # Offset slightly
            loop_node["position"][1] + 100
        ]
    }
    nodes.append(wait_node)
    
    # Update Connections
    # Remove connection from Loop output 1 to Read Node
    loop_name = loop_node["name"]
    read_name = read_node["name"]
    wait_name = wait_node["name"]

    if loop_name in connections and "main" in connections[loop_name]:
        outputs = connections[loop_name]["main"]
        # Output 1 is the 'Loop' output (index 1 in array if 0-indexed implies [Done, Loop]? Use n8n logic)
        # SplitInBatches V3: 
        # Output 0: Done? 
        # Output 1: Loop?
        # Let's verify standard n8n SplitInBatches outputs.
        # Actually usually: 
        # [0]: Loop (Processing)
        # [1]: Done (Completed)
        # BUT in previous `view_file` (Step 541):
        # "Loop Over Items1": { "main": [ [ { "node": "Send a message" } ], [ { "node": "Read clips from disk" } ] ] }
        # The first array [0] goes to "Send a message" (Done path?)
        # The second array [1] goes to "Read clips from disk" (Loop path?)
        # Let's trust the current connection structure.
        
        # We want to intercept the connection to "Read clips from disk".
        
        found_connection = False
        
        # Iterate through outputs to find the one pointing to Read clips from disk
        for output_index, output_connections in enumerate(outputs):
            for i, conn in enumerate(output_connections):
                if conn["node"] == read_name:
                    # Update this connection to point to Wait Node
                    conn["node"] = wait_name
                    found_connection = True
                    print(f"Redirected {loop_name} output {output_index} to {wait_name}")
        
        if not found_connection:
            print(f"Could not find connection from {loop_name} to {read_name}")
            return
            
        # Add connection from Wait Node to Read Node
        if wait_name not in connections:
            connections[wait_name] = {"main": []}
        
        # Wait node has 1 output
        connections[wait_name]["main"].append([
            {
                "node": read_name,
                "type": "main",
                "index": 0
            }
        ])
        print(f"Connected {wait_name} to {read_name}")

    save_workflow(workflow)
    print("Workflow updated successfully.")

if __name__ == "__main__":
    fix_workflow()
