class _Registry:
    def __init__(self):
        self._tools = {}
    def register(self, name, description, fn, category="general", parameters=None):
        self._tools[name] = {"name": name, "description": description, "fn": fn, "category": category, "parameters": parameters}
    def get(self, name): return self._tools.get(name)
    def all(self): return self._tools
REGISTRY = _Registry()