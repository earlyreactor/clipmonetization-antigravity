import json
import os

# IDs for the Sub-Workflow (Editing)
SUB_WORKFLOW_IDS = {
    "de125fd9-72c4-4cdf-8121-46c81daa8e72", # EDITING Trigger
    "03da8733-c559-4b94-bbce-113c49391e81", # Split Out
    "d190393a-2d10-43c7-8ed3-9504042b2fc2", # Loop Over Items2
    "0d49f3cd-8a20-4bf9-aed3-89e5c6dec425", # if operation is subtitles
    "5b245253-c587-4447-bc5c-bafa31db0859", # Execute operation on the clip
    "d01f6482-6def-41e0-a772-19d2c3127fbe", # Wait (long)
    "15905235-a21b-42bd-a5ff-6d1f0889bf15", # find height & width
    "cd6c45fb-e6f0-458b-9e23-1eeb30171036", # calculate relative subtitle size
    "e80d7716-e37f-4093-8226-73a49d34157c", # burn subtitles
    "c11721d5-b5c6-44f9-91dc-5a255d42a313", # Wait (short)
    "77f8d535-a391-4a85-8fab-6f724a9fd2cb", # Sticky Note4
}

def split_workflow():
    with open('workflow.json', 'r', encoding='utf-8') as f:
        data = json.load(f)

    main_nodes = []
    sub_nodes = []
    
    node_name_map = {} # Map ID to Name for connection filtering (not strictly needed if we iterate keys)
    # Actually connection keys are Names. We need Name -> IsSub map.
    node_is_sub = {}

    for node in data['nodes']:
        name = node['name']
        nid = node['id']
        if nid in SUB_WORKFLOW_IDS:
            sub_nodes.append(node)
            node_is_sub[name] = True
        else:
            main_nodes.append(node)
            node_is_sub[name] = False

    main_connections = {}
    sub_connections = {}

    for source_node, outputs in data['connections'].items():
        if source_node not in node_is_sub:
            continue # Should not happen

        if node_is_sub[source_node]:
            # This connection belongs to Sub
            sub_connections[source_node] = outputs
        else:
            # This connection belongs to Main
            main_connections[source_node] = outputs

    # Create Main Workflow Object
    main_workflow = {
        "nodes": main_nodes,
        "connections": main_connections,
        "pinData": data.get("pinData", {}),
        "meta": data.get("meta", {})
    }

    # Create Sub Workflow Object
    sub_workflow = {
        "nodes": sub_nodes,
        "connections": sub_connections,
        "pinData": {}, # Usually clean for sub
        "meta": {"instanceId": "generated-sub-workflow"}
    }
    
    # Save
    with open('workflow_main.json', 'w', encoding='utf-8') as f:
        json.dump(main_workflow, f, indent=4)
        
    with open('workflow_editing.json', 'w', encoding='utf-8') as f:
        json.dump(sub_workflow, f, indent=4)

    print("Success: Split workflow into workflow_main.json and workflow_editing.json")

if __name__ == "__main__":
    split_workflow()
