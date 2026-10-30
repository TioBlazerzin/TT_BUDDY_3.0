import json, os
CONFIG_PATH = "config.json"
def get_config():
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

def get_api_key(provider=None):
    cfg = get_config()
    if cfg.get("use_cloud"):
        # aqui você puxa da sua cloud se quiser
        return cfg.get("cloud_endpoint")
    provider = provider or cfg.get("selected_provider", "gemini")
    return cfg["api_keys"].get(provider, "")

def get_provider():
    return get_config().get("selected_provider", "gemini")
