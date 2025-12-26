import json
import uuid

WORKFLOW_FILE = 'workflow_main.json'

def add_rate_limit():
    with open(WORKFLOW_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # 1. Identify Key Nodes by Name (using exact names from file)
    # "some more formating" -> (Feed into Loop)
    # "viral clips identification" -> (Inside Loop)
    # "filter out top clips according to score" -> (After Loop)
    
    node_map = {n['name']: n for n in data['nodes']}
    
    prev_node = node_map.get("some more formating")
    gemini_node = node_map.get("viral clips identification")
    next_node = node_map.get("filter out top clips according to score")
    
    if not (prev_node and gemini_node and next_node):
        print("Error: Could not find required nodes.")
        return

    # 2. Create New Nodes
    loop_node_id = str(uuid.uuid4())
    wait_node_id = str(uuid.uuid4())
    
    loop_node = {
        "parameters": {
            "batchSize": 1,
            "options": {}
        },
        "id": loop_node_id,
        "name": "Loop Over Chunks",
        "type": "n8n-nodes-base.splitInBatches",
        "typeVersion": 3,
        "position": [
            gemini_node['position'][0] - 200, 
            gemini_node['position'][1]
        ]
    }
    
    wait_node = {
        "parameters": {
            "amount": 5,
            "unit": "seconds"
        },
        "id": wait_node_id,
        "name": "API Rate Limit",
        "type": "n8n-nodes-base.wait",
        "typeVersion": 1.1,
        "position": [
            gemini_node['position'][0] + 200, 
            gemini_node['position'][1] + 200
        ]
    }
    
    data['nodes'].extend([loop_node, wait_node])
    
    # 3. Update Connections
    # Clear old connections related to these nodes to be safe
    # connection structure: data['connections'][SourceNodeName] = { "main": [[ {node: TargetName, ...} ]] }
    
    # A. prev_node ("some more formating") -> Loop Node
    data['connections'][prev_node['name']] = {
        "main": [[{
            "node": loop_node['name'],
            "type": "main",
            "index": 0
        }]]
    }
    
    # B. Loop Node (Index 0) -> Gemini Node
    #    Loop Node (Index 1) -> next_node ("filter out...")
    data['connections'][loop_node['name']] = {
        "main": [
            [ # Index 0: Iteration
                {
                    "node": gemini_node['name'],
                    "type": "main",
                    "index": 0
                }
            ],
            [ # Index 1: Done
                {
                    "node": next_node['name'],
                    "type": "main",
                    "index": 0
                }
            ]
        ]
    }
    
    # C. Gemini Node -> Wait Node (Instead of next_node)
    data['connections'][gemini_node['name']] = {
        "main": [[{
            "node": wait_node['name'],
            "type": "main",
            "index": 0
        }]]
    }
    
    # D. Wait Node -> Loop Node (Loop back)
    data['connections'][wait_node['name']] = {
        "main": [[{
            "node": loop_node['name'],
            "type": "main",
            "index": 0
        }]]
    }
    
    # 4. Save
    with open(WORKFLOW_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=4)
        
    print("Success: Added Rate Limit Loop.")

if __name__ == "__main__":
    add_rate_limit()
